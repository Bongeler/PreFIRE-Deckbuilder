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
        
        let candidateSet = new Set(themeData.cards || []);

        if (candidateSet.size < 63 && themeSlug && this.cardRanks) {
            for (const [cName, cData] of Object.entries(this.cardRanks)) {
                if (cData.theme_ranks && cData.theme_ranks[themeSlug] && cData.theme_ranks[themeSlug] > 0) {
                    candidateSet.add(cName);
                }
            }
        }

        let rawCards = Array.from(candidateSet).filter(cName => {
            const meta = cardCatalog[cName];
            if (meta && meta.color_identity) {
                return this.isColorLegal(meta.color_identity, commanderColors);
            }
            return true;
        });

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

        // 3. Fallback: fill up to 63 from remaining thematic candidates
        if (spellList.length < 63) {
            for (const cardName of rawCards) {
                if (!selected.has(cardName)) {
                    spellList.push(cardName);
                    selected.add
