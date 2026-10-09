// Pre-FIRE EDH Deck Shell Generator

class PrefireDeckGenerator {
    constructor() {
        this.cardRoles = null;
        this.staples = null;
        this.landsData = null;
        this.cardRanks = null;
        this.archetypeAverages = null;
    }

    async init() {
        if (!this.cardRoles) {
            const [rolesRes, staplesRes, landsRes, ranksRes, archRes] = await Promise.all([
                fetch("card-roles.json"),
                fetch("prefire-staples.json"),
                fetch("prefire-lands.json"),
                fetch("card-theme-ranks.json"),
                fetch("archetype-averages.json")
            ]);
            this.cardRoles = await rolesRes.json();
            this.staples = await staplesRes.json();
            this.landsData = await landsRes.json();
            this.cardRanks = await ranksRes.json();
            this.archetypeAverages = await archRes.json();
        }
    }

    cleanSlug(name) {
        let slug = name.toLowerCase();
        const chars = ["'", ",", "\"", "(", ")", ":", "."];
        for (const char of chars) {
            slug = slug.replaceAll(char, "");
        }
        slug = slug.replaceAll(" // ", "-").replaceAll(" / ", "-");
        slug = slug.replaceAll(" ", "-");
        while (slug.includes("--")) {
            slug = slug.replaceAll("--", "-");
        }
        return slug.replace(/^-+|-+$/g, "");
    }

    getCommanderSlug(commanderA, commanderB = null) {
        if (!commanderB) {
            return this.cleanSlug(commanderA);
        }
        const slugA = this.cleanSlug(commanderA);
        const slugB = this.cleanSlug(commanderB);
        return [slugA, slugB].sort().join("-");
    }

    async loadCommanderThemes(slug) {
        const firstChar = /^[a-z0-9]/.test(slug) ? slug[0] : "_";
        try {
            const res = await fetch(`data/themes/${firstChar}/${slug}.json`);
            if (!res.ok) return null;
            return await res.json();
        } catch (err) {
            return null;
        }
    }

    isColorLegal(cardColors, commanderColors) {
        if (!cardColors || cardColors.length === 0) return true;
        return cardColors.every(c => commanderColors.includes(c));
    }

    getCardScore(cardName, themeSlug) {
        const rankObj = this.cardRanks[cardName];
        if (!rankObj) return 0.001;

        const globalScore = rankObj.global_rank || 0.0;
        const themeScore = (themeSlug && rankObj.theme_ranks) ? (rankObj.theme_ranks[themeSlug] || 0.0) : 0.0;

        return (themeScore * 0.8) + (globalScore * 0.2);
    }

    // Gathers all Pre-FIRE cards matching colors and scores them for this theme
    buildThematicCandidatePool(themeSlug, commanderColors, cardCatalog, commanderCards = []) {
        const candidateMap = new Map();

        // 1. Add any cards specifically sourced from the commander shard
        for (const name of commanderCards) {
            candidateMap.set(name, this.getCardScore(name, themeSlug) + 0.1); // Small affinity boost for commander-specific source
        }

        // 2. Scan archetype average cards
        if (themeSlug && this.archetypeAverages[themeSlug]) {
            for (const name of (this.archetypeAverages[themeSlug].cards || [])) {
                if (!candidateMap.has(name)) {
                    candidateMap.set(name, this.getCardScore(name, themeSlug));
                }
            }
        }

        // 3. Scan all cards in card-theme-ranks.json that have an affinity for this theme
        if (themeSlug) {
            for (const [name, meta] of Object.entries(this.cardRanks)) {
                if (meta.theme_ranks && meta.theme_ranks[themeSlug] && meta.theme_ranks[themeSlug] > 0) {
                    if (!candidateMap.has(name)) {
                        candidateMap.set(name, this.getCardScore(name, themeSlug));
                    }
                }
            }
        }

        // Filter by color legality and catalog verification
        const validCandidates = [];
        for (const [name, score] of candidateMap.entries()) {
            const meta = cardCatalog[name];
            const colors = meta ? meta.color_identity : (this.cardRoles[name] ? [] : null);
            
            if (this.isColorLegal(colors, commanderColors)) {
                validCandidates.push({ name, score });
            }
        }

        // Sort descending by score
        validCandidates.sort((a, b) => b.score - a.score);
        return validCandidates.map(c => c.name);
    }

    assembleSpells(themeSlug, commanderColors, cardCatalog, commanderCards = [], customTargets = null) {
        // Target distribution defaults
        let targets = {
            ramp: 10,
            removal_creature: 6,
            removal_noncreature: 4,
            board_wipe: 3,
            draw: 10
        };

        if (customTargets) {
            targets = Object.assign(targets, customTargets);
        } else if (themeSlug && this.archetypeAverages[themeSlug]) {
            targets = Object.assign(targets, this.archetypeAverages[themeSlug].targets || {});
        }

        const utilityQuotaTotal = targets.ramp + targets.removal_creature + targets.removal_noncreature + targets.board_wipe + targets.draw;
        const targetEngineSlots = Math.max(63 - utilityQuotaTotal, 25);

        const candidates = this.buildThematicCandidatePool(themeSlug, commanderColors, cardCatalog, commanderCards);

        const selected = new Set();
        const buckets = {
            ramp: [],
            removal_creature: [],
            removal_noncreature: [],
            board_wipe: [],
            draw: [],
            engine: []
        };

        // 1. Fill engine slots first using the highest-scoring thematic cards
        for (const cardName of candidates) {
            if (buckets.engine.length >= targetEngineSlots) break;
            const roles = this.cardRoles[cardName] || [];
            
            // Prefer cards that aren't strictly pure utility for the engine bucket
            if (roles.length === 0 || roles.includes("engine")) {
                buckets.engine.push(cardName);
                selected.add(cardName);
            }
        }

        // 2. Fill utility buckets using candidate pool (thematic utility first)
        for (const cardName of candidates) {
            if (selected.has(cardName)) continue;
            const roles = this.cardRoles[cardName] || [];

            for (const r of roles) {
                if (targets[r] && buckets[r].length < targets[r]) {
                    buckets[r].push(cardName);
                    selected.add(cardName);
                    break;
                }
            }
        }

        // 3. Backfill missing utility quotas using prefire-staples.json
        const utilityRoles = ["ramp", "removal_creature", "removal_noncreature", "board_wipe", "draw"];
        for (const role of utilityRoles) {
            const needed = (targets[role] || 0) - buckets[role].length;
            if (needed <= 0) continue;

            let staplePool = (this.staples[role] || []).filter(c => 
                !selected.has(c.name) && this.isColorLegal(c.colors, commanderColors)
            );

            staplePool.sort((a, b) => this.getCardScore(b.name, themeSlug) - this.getCardScore(a.name, themeSlug));

            for (let i = 0; i < needed && i < staplePool.length; i++) {
                buckets[role].push(staplePool[i].name);
                selected.add(staplePool[i].name);
            }
        }

        // 4. Fill remaining engine slots to reach exactly 63 spells
        let spellList = [];
        for (const role of Object.keys(buckets)) {
            spellList.push(...buckets[role]);
        }

        if (spellList.length < 63) {
            for (const cardName of candidates) {
                if (!selected.has(cardName)) {
                    spellList.push(cardName);
                    selected.add(cardName);
                    if (spellList.length === 63) break;
                }
            }
        }

        // 5. Final fallback if candidate pool was exhausted
        if (spellList.length < 63) {
            const allStaples = [];
            for (const r of utilityRoles) {
                (this.staples[r] || []).forEach(c => {
                    if (!selected.has(c.name) && this.isColorLegal(c.colors, commanderColors)) {
                        allStaples.push(c.name);
                    }
                });
            }
            allStaples.sort((a, b) => this.getCardScore(b, themeSlug) - this.getCardScore(a, themeSlug));

            for (const name of allStaples) {
                if (!selected.has(name)) {
                    spellList.push(name);
                    selected.add(name);
                    if (spellList.length === 63) break;
                }
            }
        }

        return spellList.slice(0, 63);
    }

    assembleLands(commanderColors, themeSlug, nonLandSpells, cardCatalog, commanderCount = 1) {
        const lands = [];
        const colorCount = commanderColors.length;
        const totalLandTarget = 100 - commanderCount - nonLandSpells.length;

        // 1. Universal Fixers
        if (colorCount >= 2) {
            lands.push(this.landsData.fixers.command_tower);
            lands.push(this.landsData.fixers.city_of_brass);
            lands.push(this.landsData.fixers.mana_confluence);
        }
        if (colorCount >= 3) {
            lands.push(this.landsData.fixers.exotic_orchard);
            lands.push(this.landsData.fixers.reflecting_pool);
        }

        // 2. Dual Cycles
        for (let i = 0; i < commanderColors.length; i++) {
            for (let j = i + 1; j < commanderColors.length; j++) {
                const c1 = commanderColors[i];
                const c2 = commanderColors[j];
                const key1 = `${c1}${c2}`;
                const key2 = `${c2}${c1}`;

                const duals = this.landsData.duals[key1] || this.landsData.duals[key2];
                if (duals) {
                    if (duals.shock) lands.push(duals.shock);
                    if (duals.fetch) lands.push(duals.fetch);
                    if (duals.check) lands.push(duals.check);
                    if (duals.pain) lands.push(duals.pain);
                    if (colorCount <= 3) {
                        if (duals.filter) lands.push(duals.filter);
                        if (duals.abur) lands.push(duals.abur);
                    }
                }
            }
        }

        // 3. Tri-Lands for 3+ colors
        if (colorCount >= 3) {
            for (const [triKey, triName] of Object.entries(this.landsData.tri_lands)) {
                const triColors = triKey.split("");
                if (triColors.every(c => commanderColors.includes(c))) {
                    lands.push(triName);
                }
            }
        }

        // 4. Utility Lands
        const colorlessCaps = { 0: 36, 1: 7, 2: 4, 3: 2, 4: 1, 5: 0 };
        const maxColorless = colorlessCaps[colorCount] ?? 1;
        let colorlessCount = 0;

        const themeLands = (this.landsData.utility && this.landsData.utility.theme_specific && this.landsData.utility.theme_specific[themeSlug]) || [];
        for (const lName of themeLands) {
            const cardMeta = cardCatalog[lName];
            const isColorless = !cardMeta || !cardMeta.color_identity || cardMeta.color_identity.length === 0;

            if (isColorless && colorlessCount >= maxColorless) continue;
            if (cardMeta && cardMeta.color_identity && !this.isColorLegal(cardMeta.color_identity, commanderColors)) continue;

            if (!lands.includes(lName)) {
                lands.push(lName);
                if (isColorless) colorlessCount++;
            }
        }

        if (colorCount <= 2 && this.landsData.utility && this.landsData.utility.colored_staples) {
            for (const color of commanderColors) {
                const staples = this.landsData.utility.colored_staples[color] || [];
                for (const lName of staples) {
                    if (!lands.includes(lName)) {
                        lands.push(lName);
                        break;
                    }
                }
            }
        }

        // 5. Basic Land Allocation
        const remainingSlots = Math.max(totalLandTarget - lands.length, 1);
        
        if (colorCount === 0) {
            for (let i = 0; i < remainingSlots; i++) lands.push("Wastes");
            return lands;
        }

        const pipCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
        let totalPips = 0;

        for (const spellName of nonLandSpells) {
            const card = cardCatalog[spellName];
            if (!card || !card.mana_cost) continue;

            const matches = card.mana_cost.match(/\{([WUBRG])\}/g) || [];
            for (const m of matches) {
                const color = m.replace(/[\{\}]/g, "");
                if (pipCounts[color] !== undefined) {
                    pipCounts[color]++;
                    totalPips++;
                }
            }
        }

        const basicNames = {
            W: "Plains",
            U: "Island",
            B: "Swamp",
            R: "Mountain",
            G: "Forest"
        };

        if (totalPips === 0) {
            const split = Math.floor(remainingSlots / colorCount);
            let rem = remainingSlots % colorCount;
            for (const color of commanderColors) {
                const count = split + (rem-- > 0 ? 1 : 0);
                for (let i = 0; i < count; i++) lands.push(basicNames[color]);
            }
        } else {
            let allocated = 0;
            const basicAllocations = {};

            for (const color of commanderColors) {
                const pips = pipCounts[color] || 0;
                let count = Math.max(1, Math.round((pips / totalPips) * remainingSlots));
                basicAllocations[color] = count;
                allocated += count;
            }

            let diff = remainingSlots - allocated;
            const primaryColor = commanderColors.reduce((a, b) => 
                (pipCounts[a] || 0) >= (pipCounts[b] || 0) ? a : b
            );
            basicAllocations[primaryColor] = Math.max(1, basicAllocations[primaryColor] + diff);

            for (const color of commanderColors) {
                for (let i = 0; i < basicAllocations[color]; i++) {
                    lands.push(basicNames[color]);
                }
            }
        }

        return lands;
    }

    async generate(commanderA, commanderB = null, selectedThemeSlug = null, cardCatalog = {}) {
        await this.init();

        const slug = this.getCommanderSlug(commanderA, commanderB);
        const commanderPayload = await this.loadCommanderThemes(slug);

        const colors = new Set();
        [commanderA, commanderB].filter(Boolean).forEach(name => {
            const card = cardCatalog[name];
            if (card && card.color_identity) {
                card.color_identity.forEach(c => colors.add(c.toUpperCase()));
            }
        });
        const commanderColors = Array.from(colors);

        let commanderCards = [];
        let customTargets = null;
        let actualSlug = selectedThemeSlug || "default";

        if (commanderPayload) {
            if (selectedThemeSlug && commanderPayload.themes && commanderPayload.themes[selectedThemeSlug]) {
                const tObj = commanderPayload.themes[selectedThemeSlug];
                const tData = tObj.data || tObj;
                commanderCards = tData.cards || [];
                customTargets = tData.targets || null;
            } else if (commanderPayload.default) {
                commanderCards = commanderPayload.default.cards || [];
                customTargets = commanderPayload.default.targets || null;
            }
        }

        const cmdrCount = commanderB ? 2 : 1;
        const spells = this.assembleSpells(actualSlug, commanderColors, cardCatalog, commanderCards, customTargets);
        const lands = this.assembleLands(commanderColors, actualSlug, spells, cardCatalog, cmdrCount);

        return [...spells, ...lands];
    }
}

window.PrefireDeckGenerator = PrefireDeckGenerator;
