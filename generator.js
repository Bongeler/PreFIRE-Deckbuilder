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
        for (let i = 0; i < chars.length; i++) {
            slug = slug.replaceAll(chars[i], "");
        }
        slug = slug.replaceAll(" // ", "-").replaceAll(" / ", "-");
        slug = slug.replaceAll(" ", "-
