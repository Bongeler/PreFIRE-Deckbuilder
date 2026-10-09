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
        if (!rankObj) return 0.01;

        const globalScore = rankObj.global_rank || 0.0;
        const themeScore = (themeSlug && rankObj.theme_ranks) ? (rankObj.theme_ranks[themeSlug] || 0.0) : 0.0;

        // Weight theme affinity at 75%, global staple weight at 25%
        return (themeScore * 0.75) + (globalScore * 0.25);
    }

    // Step A: Assemble 63 Non-Land Spells
    assembleSpells(themeData, themeSlug, commanderColors, cardCatalog) {
        const defaultTargets = {
            ramp: 10,
            removal_creature: 6,
            removal_noncreature: 4,
            board_wipe: 3,
            draw: 10
        };

        const targets = Object.assign(defaultTargets, themeData.targets || {});
        let rawCards = (themeData.cards || []).filter(cName => {
            const meta = cardCatalog[cName];
            return !meta || this.isColorLegal(meta.color_identity, commanderColors);
        });

        // Sort candidate pool by weighted score descending
        rawCards.sort((a, b) => this.getCardScore(b, themeSlug) - this.getCardScore(a, themeSlug));

        const selected = new Set();
        const buckets = {
            ramp: [],
            removal_creature: [],
            removal_noncreature: [],
            board_wipe: [],
            draw: [],
            engine: []
        };

        // 1. Ingest cards from pool into role buckets
        for (const cardName of rawCards) {
            const roles = this.cardRoles[cardName] || [];
            let placed = false;

            for (const r of roles) {
                if (targets[r] && buckets[r].length < targets[r] && !selected.has(cardName)) {
                    buckets[r].push(cardName);
                    selected.add(cardName);
                    placed = true;
                    break;
                }
            }

            if (!placed && !selected.has(cardName)) {
                buckets.engine.push(cardName);
                selected.add(cardName);
            }
        }

        // 2. Backfill empty role quotas using prefire-staples.json prioritizing weighted score
        const backfillRoles = ["ramp", "removal_creature", "removal_noncreature", "board_wipe", "draw"];
        for (const role of backfillRoles) {
            const needed = (targets[role] || 0) - buckets[role].length;
            if (needed <= 0) continue;

            let candidates = (this.staples[role] || []).filter(c => 
                !selected.has(c.name) && this.isColorLegal(c.colors, commanderColors)
            );

            // Sort staples by their theme and global scores
            candidates.sort((a, b) => this.getCardScore(b.name, themeSlug) - this.getCardScore(a.name, themeSlug));

            for (let i = 0; i < needed && i < candidates.length; i++) {
                buckets[role].push(candidates[i].name);
                selected.add(candidates[i].name);
            }
        }

        let spellList = [];
        for (const role of Object.keys(buckets)) {
            spellList.push(...buckets[role]);
        }

        // 3. Fallback: fill up to 63 from remaining candidates
        if (spellList.length < 63) {
            for (const cardName of rawCards) {
                if (!selected.has(cardName)) {
                    spellList.push(cardName);
                    selected.add(cardName);
                    if (spellList.length === 63) break;
                }
            }
        }

        // 4. Secondary fallback: fill from general on-color staples sorted by global rank
        if (spellList.length < 63) {
            const allStaplePool = [];
            for (const r of backfillRoles) {
                (this.staples[r] || []).forEach(c => {
                    if (!selected.has(c.name) && this.isColorLegal(c.colors, commanderColors)) {
                        allStaplePool.push(c.name);
                    }
                });
            }

            allStaplePool.sort((a, b) => this.getCardScore(b, themeSlug) - this.getCardScore(a, themeSlug));

            for (const name of allStaplePool) {
                if (!selected.has(name)) {
                    spellList.push(name);
                    selected.add(name);
                    if (spellList.length === 63) break;
                }
            }
        }

        return spellList.slice(0, 63);
    }

    // Step B: Calculate Land Base (Total deck target = 99)
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

        // 4. Utility Lands with Colorless Quota Cap
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

        // 5. Basic Land Allocation Proportional to Pips
        const remainingSlots = Math.max(totalLandTarget - lands.length, 1);
        
        if (colorCount === 0) {
            for (let i = 0; i < remainingSlots; i++) {
                lands.push("Wastes");
            }
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

        let themeData = null;
        let actualSlug = selectedThemeSlug || "default";

        // Check if commander shard exists and has data for the requested theme
        if (commanderPayload) {
            if (selectedThemeSlug && commanderPayload.themes && commanderPayload.themes[selectedThemeSlug]) {
                themeData = commanderPayload.themes[selectedThemeSlug].data || commanderPayload.themes[selectedThemeSlug];
            } else if (commanderPayload.default && (commanderPayload.default.cards || []).length > 0) {
                themeData = commanderPayload.default;
            }
        }

        // Trigger Fallback to archetype-averages.json if no data was found
        if (!themeData || !themeData.cards || themeData.cards.length < 20) {
            const fallbackKey = (selectedThemeSlug && this.archetypeAverages[selectedThemeSlug]) 
                ? selectedThemeSlug 
                : "good-stuff";
            
            const arch = this.archetypeAverages[fallbackKey] || { targets: {}, cards: [] };
            
            themeData = {
                targets: arch.targets || {},
                cards: arch.cards || []
            };
            actualSlug = fallbackKey;
        }

        const cmdrCount = commanderB ? 2 : 1;
        const spells = this.assembleSpells(themeData, actualSlug, commanderColors, cardCatalog);
        const lands = this.assembleLands(commanderColors, actualSlug, spells, cardCatalog, cmdrCount);

        return [...spells, ...lands];
    }
}

window.PrefireDeckGenerator = PrefireDeckGenerator;
