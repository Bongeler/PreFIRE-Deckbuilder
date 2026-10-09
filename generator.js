// Pre-FIRE EDH Deck Shell Generator

class PrefireDeckGenerator {
    constructor() {
        this.cardRoles = null;
        this.staples = null;
        this.landsData = null;
        this.themeFallbacks = null;
        this.cardColorMap = {};

        // Signature keywords and mechanics for theme filtration
        this.themeSignatures = {
            "aristocrats": ["sacrifice", "dies", "morbid", "blood artist", "zulaport", "altar", "grave pact", "dictate of erebos", "viscera seer"],
            "lifegain": ["gain life", "gains life", "lifelink", "soul warden", "well of lost dreams", "ajani", "crest", "sanguine bond", "exquisite blood"],
            "+1-+1-counters": ["+1/+1 counter", "proliferate", "cathars' crusade", "hardened scales", "corpsejack", "doubling season"],
            "tokens": ["create", "token", "tokens", "populate", "lingering souls", "spectral procession", "bitterblossom", "anointed procession"],
            "reanimator": ["reanimate", "animate dead", "graveyard", "return target creature card from your graveyard", "necromancy", "living death"],
            "voltron": ["equipment", "equipped", "aura", "enchant creature", "sword of", "jitte", "puresteel"]
        };
    }

    async init() {
        if (!this.cardRoles) {
            const [rolesRes, staplesRes, landsRes, fallbacksRes, namesRes] = await Promise.all([
                fetch("card-roles.json"),
                fetch("prefire-staples.json"),
                fetch("prefire-lands.json"),
                fetch("data/themes/theme-fallbacks.json"),
                fetch("prefire-names.json")
            ]);
            this.cardRoles = await rolesRes.json();
            this.staples = await staplesRes.json();
            this.landsData = await landsRes.json();
            this.themeFallbacks = await fallbacksRes.json();

            // Build an internal color identity map
            try {
                const namesData = await namesRes.json();
                if (typeof namesData === "object" && !Array.isArray(namesData)) {
                    for (const [cName, meta] of Object.entries(namesData)) {
                        if (meta && meta.color_identity) {
                            this.cardColorMap[cName] = meta.color_identity;
                        }
                    }
                }
            } catch (e) {}

            if (this.staples) {
                Object.values(this.staples).forEach(list => {
                    list.forEach(c => {
                        if (c.name && c.colors) {
                            this.cardColorMap[c.name] = c.colors;
                        }
                    });
                });
            }
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

    isColorLegal(cardColors, commanderColors) {
        if (!cardColors || cardColors.length === 0) return true;
        return cardColors.every(c => commanderColors.includes(c));
    }

    isCardOnTheme(cardName, themeSlug, cardCatalog = {}) {
        if (!themeSlug || themeSlug === "default") return false;
        const keywords = this.themeSignatures[themeSlug] || [themeSlug.replace(/-/g, " ")];
        const lowerName = cardName.toLowerCase();

        if (keywords.some(kw => lowerName.includes(kw))) return true;

        const meta = cardCatalog[cardName];
        if (meta && meta.oracle_text) {
            const lowerText = meta.oracle_text.toLowerCase();
            if (keywords.some(kw => lowerText.includes(kw))) return true;
        }

        return false;
    }

    // Step A: Assemble 63 Non-Land Spells
    assembleSpells(themeData, themeSlug, commanderColors, cardCatalog = {}) {
        const targets = Object.assign({
            ramp: 10,
            removal_creature: 6,
            removal_noncreature: 4,
            board_wipe: 3,
            draw: 10
        }, themeData.targets || {});

        const rawList = themeData.cards || [];
        const rawCards = [];

        for (let i = 0; i < rawList.length; i++) {
            const c = rawList[i];
            const meta = cardCatalog[c];
            const cardColors = (meta && meta.color_identity) ? meta.color_identity : this.cardColorMap[c];

            if (!cardColors || this.isColorLegal(cardColors, commanderColors)) {
                rawCards.push(c);
            }
        }

        const onThemeCards = [];
        const genericCards = [];

        for (let i = 0; i < rawCards.length; i++) {
            const c = rawCards[i];
            if (this.isCardOnTheme(c, themeSlug, cardCatalog)) {
                onThemeCards.push(c);
            } else {
                genericCards.push(c);
            }
        }

        const isUsingGlobalFallback = this.themeFallbacks && themeData === this.themeFallbacks[themeSlug];
        const sourceCards = isUsingGlobalFallback ? rawCards : [...onThemeCards, ...genericCards];

        const selected = new Set();
        const buckets = {
            ramp: [],
            removal_creature: [],
            removal_noncreature: [],
            board_wipe: [],
            draw: [],
            engine: []
        };

        // 1. Ingest cards from theme list into role buckets
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
            const onThemeStaples = [];
            const genericStaples = [];

            for (const c of candidates) {
                if (selected.has(c.name)) continue;
                if (!this.isColorLegal(c.colors, commanderColors)) continue;

                const hasThemeTag = c.themes && c.themes.includes(themeSlug);
                const matchesSignature = this.isCardOnTheme(c.name, themeSlug, cardCatalog);

                if (hasThemeTag || matchesSignature) {
                    onThemeStaples.push(c.name);
                } else {
                    genericStaples.push(c.name);
                }
            }

            const pool = [...onThemeStaples, ...genericStaples];
            for (let i = 0; i < needed && i < pool.length; i++) {
                buckets[role].push(pool[i]);
                selected.add(pool[i]);
            }
        }

        let spellList = [];
        for (const role of Object.keys(buckets)) {
            spellList.push(...buckets[role]);
        }

        // 3. Fallback: fill up to 63 from remaining candidates
        if (spellList.length < 63) {
            for (const cardName of sourceCards) {
                if (!selected.has(cardName)) {
                    spellList.push(cardName);
                    selected.add(cardName);
                    if (spellList.length === 63) break;
                }
            }
        }

        // 4. Secondary fallback: fill from general on-color staples
        if (spellList.length < 63) {
            const allStaplePool = [];
            for (const r of backfillRoles) {
                (this.staples[r] || []).forEach(c => {
                    if (!selected.has(c.name) && this.isColorLegal(c.colors, commanderColors)) {
                        allStaplePool.push(c.name);
                    }
                });
            }
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
    assembleLands(commanderColors, themeSlug, nonLandSpells, cardCatalog = {}, commanderCount = 1) {
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
            const meta = cardCatalog[lName];
            const landColors = (meta && meta.color_identity) ? meta.color_identity : this.cardColorMap[lName];
            const isColorless = !landColors || landColors.length === 0;

            if (isColorless && colorlessCount >= maxColorless) continue;
            if (landColors && !this.isColorLegal(landColors, commanderColors)) continue;

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
        let commanderPayload = null;
        try {
            commanderPayload = await this.loadCommanderThemes(slug);
        } catch (err) {
            commanderPayload = null;
        }

        const colors = new Set();
        [commanderA, commanderB].filter(Boolean).forEach(name => {
            const card = cardCatalog[name];
            const identity = (card && card.color_identity) ? card.color_identity : this.cardColorMap[name];
            if (identity) {
                identity.forEach(c => colors.add(c.toUpperCase()));
            }
        });
        const commanderColors = Array.from(colors);

        const normalizedTheme = selectedThemeSlug ? selectedThemeSlug.toString().toLowerCase().trim() : null;
        let themeData = null;
        let actualSlug = normalizedTheme || "default";

        // 1. Try commander-specific theme data first
        if (commanderPayload) {
            if (normalizedTheme && commanderPayload.themes && commanderPayload.themes[normalizedTheme]) {
                const candidate = commanderPayload.themes[normalizedTheme].data || commanderPayload.themes[normalizedTheme];
                if (candidate.cards && candidate.cards.length >= 20) {
                    themeData = candidate;
                }
            } else if (!normalizedTheme && commanderPayload.default && (commanderPayload.default.cards || []).length >= 20) {
                themeData = commanderPayload.default;
            }
        }

        // 2. Fallback to unified theme profile if commander has insufficient data for this theme
        if (!themeData && normalizedTheme && this.themeFallbacks && this.themeFallbacks[normalizedTheme]) {
            const fallback = this.themeFallbacks[normalizedTheme];
            if (fallback.cards && fallback.cards.length > 0) {
                themeData = fallback;
                actualSlug = normalizedTheme;
            }
        }

        // 3. Fallback to commander's default theme if available
        if (!themeData && commanderPayload && commanderPayload.default) {
            themeData = commanderPayload.default;
        }

        // 4. Safe fallback if zero data was found
        if (!themeData) {
            themeData = { targets: {}, cards: [] };
        }

        const cmdrCount = commanderB ? 2 : 1;
        const spells = this.assembleSpells(themeData, actualSlug, commanderColors, cardCatalog);
        const lands = this.assembleLands(commanderColors, actualSlug, spells, cardCatalog, cmdrCount);

        return [...spells, ...lands];
    }
}

window.PrefireDeckGenerator = PrefireDeckGenerator;
