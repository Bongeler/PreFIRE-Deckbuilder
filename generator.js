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
            slug = slug.replaceAll("--
