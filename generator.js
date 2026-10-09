// Pre-FIRE EDH Deck Shell Generator

class PrefireDeckGenerator {
    constructor() {
        this.cardRoles = null;
        this.staples = null;
        this.landsData = null;

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
        try {
            const res = await fetch(`data/themes/${firstChar}/${slug}.json`);
            if (!res.ok) return null;
            return await res.json();
        } catch (err) {
            return null;
        }
    }

    async loadArchetypeFallback(themeSlug) {
        if (!themeSlug) return null;
        try {
            const res = await fetch(`data/archetypes/${themeSlug}.json`);
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

    isCardOnTheme(cardName, themeSlug, cardCatalog) {
        if (!themeSlug || themeSlug === "default") return false;
        const keywords = this.themeSignatures[themeSlug] || [themeSlug.replace("-", " ")];
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
    assembleSpells(themeData, themeSlug, commanderColors, cardCatalog) {
        const targets = Object.assign({
            ramp: 10,
            removal_creature: 6,
            removal_noncreature: 4,
            board_wipe: 3,
            draw: 10
        }, themeData.targets || {});

        const rawCards = (themeData.cards || []).filter(c => {
            const meta = cardCatalog[c];
            return !meta || this.isColorLegal(meta.color_identity, commanderColors);
        });

        const onThemeCards = [];
        const genericCards = [];

        // Partition candidate pool so on-theme cards get placed first
        for (const c of rawCards) {
            if (this.isCardOnTheme(c, themeSlug, cardCatalog)) {
                onThemeCards.push(c);
            } else {
                genericCards.push(c);
            }
        }

        const sourceCards = [...onThemeCards, ...genericCards];
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

        // 2. Backfill empty role quotas using prefire-staples.json prioritizing current theme
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
                    if (!selected.has(c
