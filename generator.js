// Pre-FIRE EDH Deck Shell Generator

class PrefireDeckGenerator {
    constructor() {
        this.cardRoles = null;
        this.staples = null;
        this.landsData = null;
    }

    async init() {
        if (!this.cardRoles) {
            const [rolesRes, staplesRes, landsRes] = await Promise.all([
                fetch("card-roles.json"),
                fetch("prefire-staples.json"),
                fetch("prefire-lands.json")
            ]);
            this.cardRoles = await rolesRes.json();
            this.staples = await staplesRes.json();
            this.landsData = await landsRes.json();
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
        const res = await fetch(`data/themes/${firstChar}/${slug}.json`);
        if (!res.ok) {
            throw new Error(`Theme data not found for slug: ${slug}`);
        }
        return await res.json();
    }

    // Checks if card colors are subset of commander colors
    isColorLegal(cardColors, commanderColors) {
        return cardColors.every(c => commanderColors.includes(c));
    }

    // Step A: Assemble 62-63 Non-Land Spells
    assembleSpells(themeData, themeSlug, commanderColors, cardCatalog) {
        const targets = Object.assign({}, themeData.targets);
        const sourceCards = themeData.cards || [];
        const selected = new Set();
        const buckets = {
            ramp: [],
            removal_creature: [],
            removal_noncreature: [],
            board_wipe: [],
            draw: [],
            engine: []
        };

        // 1. Ingest cards directly from theme list into role buckets
        for (const cardName of sourceCards) {
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

        // 2. Backfill empty role quotas using prefire-staples.json
        const backfillRoles = ["ramp", "removal_creature", "removal_noncreature", "board_wipe", "draw"];
        for (const role of backfillRoles) {
            const needed = (targets[role] || 0) - buckets[role].length;
            if (needed <= 0) continue;

            const candidates = this.staples[role] || [];
            
            // Prioritize candidates matching current theme
            const onTheme = [];
            const generic = [];

            for (const c of candidates) {
                if (selected.has(c.name)) continue;
                if (!this.isColorLegal(c.colors, commanderColors)) continue;

                if (c.themes && c.themes.includes(themeSlug)) {
                    onTheme.push(c.name);
                } else {
                    generic.push(c.name);
                }
            }

            const pool = [...onTheme, ...generic];
            for (let i = 0; i < needed && i < pool.length; i++) {
                buckets[role].push(pool[i]);
                selected.add(pool[i]);
            }
        }

        // 3. Flatten non-land spells, target cap: 63
        let spellList = [];
        for (const role of Object.keys(buckets)) {
            spellList.push(...buckets[role]);
        }

        // If short of 63, fill from remaining engine candidates
        if (spellList.length < 63) {
            for (const cardName of sourceCards) {
                if (!selected.has(cardName)) {
                    spellList.push(cardName);
                    selected.add(cardName);
                    if (spellList.length === 63) break;
                }
            }
        }

        return spellList.slice(0, 63);
    }

    // Step B: Calculate Land Base (36-37 Lands)
    assembleLands(commanderColors, themeSlug, nonLandSpells, cardCatalog) {
        const lands = [];
        const colorCount = commanderColors.length;
        const totalLandTarget = 36;

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

        // 2. Dual Cycles (Pair combinations)
        const pairs = [];
        for (let i = 0; i < commanderColors.length; i++) {
            for (let j = i + 1; j < commanderColors.length; j++) {
                const pairKey = [commanderColors[i], commanderColors[j]].sort().join("");
                pairs.push(pairKey);
            }
        }

        for (const pair of pairs) {
            const duals = this.landsData.duals[pair];
            if (duals) {
                lands.push(duals.shock);
                lands.push(duals.fetch);
                lands.push(duals.check);
                lands.push(duals.pain);
                if (colorCount <= 3) {
                    lands.push(duals.filter);
                    lands.push(duals.abur);
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

        // Add theme-specific utility lands
        const themeLands = this.landsData.utility.theme_specific[themeSlug] || [];
        for (const lName of themeLands) {
            const cardMeta = cardCatalog[lName];
            const isColorless = !cardMeta || cardMeta.color_identity.length === 0;

            if (isColorless && colorlessCount >= maxColorless) continue;
            if (cardMeta && !this.isColorLegal(cardMeta.color_identity, commanderColors)) continue;

            if (!lands.includes(lName)) {
                lands.push(lName);
                if (isColorless) colorlessCount++;
            }
        }

        // Add colored utility staples for mono/dual
        if (colorCount <= 2) {
            for (const color of commanderColors) {
                const staples = this.landsData.utility.colored_staples[color] || [];
                for (const lName of staples) {
                    if (!lands.includes(lName)) {
                        lands.push(lName);
                        break; // 1 colored staple per color
                    }
                }
            }
        }

        // 5. Basic Land Allocation Proportional to Pips
        const remainingSlots = Math.max(totalLandTarget - lands.length, 1);
        
        if (colorCount === 0) {
            // Colorless commander gets Wastes
            for (let i = 0; i < remainingSlots; i++) {
                lands.push("Wastes");
            }
            return lands;
        }

        // Count colored mana pips across non-land spells
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
            // Even split if no pips detected
            const split = Math.floor(remainingSlots / colorCount);
            let rem = remainingSlots % colorCount;
            for (const color of commanderColors) {
                const count = split + (rem-- > 0 ? 1 : 0);
                for (let i = 0; i < count; i++) lands.push(basicNames[color]);
            }
        } else {
            let allocated = 0;
            const basicAllocations = {};

            // Allocate proportional basics (minimum 1 per color in identity)
            for (const color of commanderColors) {
                const pips = pipCounts[color] || 0;
                let count = Math.max(1, Math.round((pips / totalPips) * remainingSlots));
                basicAllocations[color] = count;
                allocated += count;
            }

            // Adjust rounding discrepancy to match exact remaining slot count
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

    // Main Execution Hook
    async generate(commanderA, commanderB = null, selectedThemeSlug = null, cardCatalog = {}) {
        await this.init();

        const slug = this.getCommanderSlug(commanderA, commanderB);
        const commanderPayload = await this.loadCommanderThemes(slug);

        // Derive commander color identity from commander card(s)
        const colors = new Set();
        [commanderA, commanderB].filter(Boolean).forEach(name => {
            const card = cardCatalog[name];
            if (card && card.color_identity) {
                card.color_identity.forEach(c => colors.add(c));
            }
        });
        const commanderColors = Array.from(colors);

        // Determine theme dataset to use
        let themeData = commanderPayload.default;
        let actualSlug = "default";

        if (selectedThemeSlug && commanderPayload.themes && commanderPayload.themes[selectedThemeSlug]) {
            themeData = commanderPayload.themes[selectedThemeSlug].data;
            actualSlug = selectedThemeSlug;
        }

        // 1. Build Spells (62-63)
        const spells = this.assembleSpells(themeData, actualSlug, commanderColors, cardCatalog);

        // 2. Build Lands (36-37)
        const lands = this.assembleLands(commanderColors, actualSlug, spells, cardCatalog);

        // Return completed 99-card list
        return [...spells, ...lands];
    }
}

// Expose globally for browser usage
window.PrefireDeckGenerator = PrefireDeckGenerator;