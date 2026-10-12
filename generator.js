// Pre-FIRE EDH Deck Shell Generator

class PrefireDeckGenerator {
    constructor() {
        this.cardRoles = null;
        this.cardTypes = null;
        this.staples = null;
        this.landsData = null;
        this.themeFallbacks = null;
        this.archetypeIndex = null;
        this.cardColorMap = {};

        // Signature keywords and mechanics for theme filtration
        this.themeSignatures = {
            "aristocrats": ["sacrifice", "dies", "morbid", "blood artist", "zulaport", "altar", "grave pact", "dictate of erebos", "viscera seer"],
            "lifegain": ["gain life", "gains life", "lifelink", "soul warden", "well of lost dreams", "ajani", "crest", "sanguine bond", "exquisite blood"],
            "+1-+1-counters": ["+1/+1 counter", "proliferate", "cathars' crusade", "hardened scales", "corpsejack", "doubling season"],
            "tokens": ["create", "token", "tokens", "populate", "lingering souls", "spectral procession", "bitterblossom", "anointed procession"],
            "reanimator": ["reanimate", "animate dead", "graveyard", "return target creature card from your graveyard", "necromancy", "living death"],
            "voltron": ["equipment", "equipped", "aura", "enchant creature", "sword of", "jitte", "puresteel"],
            "enchantress": ["enchantment", "enchantress", "aura", "constellation", "totem armor", "umbra", "enchant", "replenish", "serra's sanctum"],
            "auras": ["aura", "enchant creature", "totem armor", "umbra", "enchanted creature", "heroic"]
        };
    }

    async init() {
        if (!this.cardRoles) {
            const safeFetchJson = async (url) => {
                try {
                    const res = await fetch(url);
                    if (!res.ok) return null;
                    const text = await res.text();
                    if (!text || text.trim().startsWith("<")) return null;
                    return JSON.parse(text);
                } catch (e) {
                    return null;
                }
            };

            let fallbacksData = await safeFetchJson("data/themes/theme-fallbacks.json");
            if (!fallbacksData) {
                fallbacksData = await safeFetchJson("theme-fallbacks.json");
            }

            const [roles, staples, lands, archetypes, cardTypes] = await Promise.all([
                safeFetchJson("card-roles.json"),
                safeFetchJson("prefire-staples.json"),
                safeFetchJson("prefire-lands.json"),
                safeFetchJson("archetype-index.json"),
                safeFetchJson("card-types.json")
            ]);

            this.cardRoles = roles || {};
            this.cardTypes = cardTypes || {};
            this.staples = staples || {};
            this.landsData = lands || {};
            this.themeFallbacks = fallbacksData || {};
            this.archetypeIndex = archetypes || {};

            // Base color lookup from staples
            if (this.staples) {
                Object.values(this.staples).forEach(list => {
                    if (Array.isArray(list)) {
                        list.forEach(c => {
                            if (c && c.name && c.colors) {
                                this.cardColorMap[c.name] = c.colors;
                            }
                        });
                    }
                });
            }

            // Populate land color lookup from prefire-lands.json
            if (this.landsData && this.landsData.utility && this.landsData.utility.colored_staples) {
                Object.entries(this.landsData.utility.colored_staples).forEach(([col, list]) => {
                    if (Array.isArray(list)) {
                        list.forEach(lName => {
                            this.cardColorMap[lName] = [col];
                        });
                    }
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
        try {
            const firstChar = /^[a-z0-9]/.test(slug) ? slug[0] : "_";
            const res = await fetch(`data/themes/${firstChar}/${slug}.json`);
            if (!res.ok) return null;
            const text = await res.text();
            if (!text || text.trim().startsWith("<")) return null;
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    isColorLegal(cardColors, commanderColors) {
        if (!cardColors || cardColors.length === 0) return true;
        return cardColors.every(c => commanderColors.includes(c));
    }

    isCardOnTheme(cardName, themeSlug, cardCatalog) {
        if (!themeSlug || themeSlug === "default") return false;
        const cleanSlug = themeSlug.toLowerCase();
        const meta = cardCatalog[cardName] || {};
        const tLine = (this.cardTypes && this.cardTypes[cardName]) ? this.cardTypes[cardName].toLowerCase() : (meta.type_line || meta.type || "").toLowerCase();
        const oText = (meta.oracle_text || meta.text || "").toLowerCase();
        const lowerName = cardName.toLowerCase();

        // Type line inheritance: Any enchantment/artifact is inherently on-theme for matching archetypes
        if ((cleanSlug === "enchantress" || cleanSlug.includes("enchant")) && tLine.includes("enchantment")) {
            return true;
        }
        if (cleanSlug === "auras" && tLine.includes("aura")) {
            return true;
        }
        if ((cleanSlug === "artifacts" || cleanSlug.includes("artifact")) && tLine.includes("artifact")) {
            return true;
        }

        const keywords = this.themeSignatures[cleanSlug] || [cleanSlug.replace(/-/g, " ")];
        if (keywords.some(kw => lowerName.includes(kw))) return true;
        if (oText && keywords.some(kw => oText.includes(kw))) return true;

        return false;
    }

    getArchetypeCards(themeSlug, commanderColors, limit = 100) {
        if (!this.archetypeIndex || !themeSlug || themeSlug === "default") {
            return [];
        }

        const cleanSlug = this.cleanSlug(themeSlug);
        let pool = this.archetypeIndex[cleanSlug];

        if (!pool) {
            const matchedKey = Object.keys(this.archetypeIndex).find(k =>
                k.replace(/-/g, "") === cleanSlug.replace(/-/g, "") ||
                cleanSlug.includes(k) ||
                k.includes(cleanSlug)
            );
            if (matchedKey) {
                pool = this.archetypeIndex[matchedKey];
            }
        }

        if (!pool || !Array.isArray(pool)) {
            return [];
        }

        const legal = pool.filter(card => {
            if (!card.colors || card.colors.length === 0) return true;
            return this.isColorLegal(card.colors, commanderColors);
        });

        return legal.slice(0, limit).map(c => typeof c === 'string' ? c : c.name);
    }

    // Step A: Assemble Non-Land Spells (Thematic First -> Archetype Second -> Staples Last Resort)
    assembleSpells(themeData, themeSlug, commanderColors, cardCatalog, commanderCount = 1) {
        const dist = (themeData && themeData.distribution) ? themeData.distribution : {};
        const targetLandCount = (typeof dist.lands === 'number') ? dist.lands : ((themeData && themeData.targets && themeData.targets.lands) ? themeData.targets.lands : 36);
        const targetSpellsCount = 100 - commanderCount - targetLandCount;

        const isLand = (cName) => {
            if (this.cardTypes && this.cardTypes[cName]) {
                return this.cardTypes[cName].toLowerCase().includes("land");
            }
            const meta = cardCatalog[cName] || {};
            const tLine = (meta.type || meta.type_line || "").toLowerCase();
            return tLine.includes("land") || (this.landsData && this.landsData.baseline_lands && this.landsData.baseline_lands[cName]);
        };

        const getCardType = (cName) => {
            if (this.cardTypes && this.cardTypes[cName]) {
                return this.cardTypes[cName].toLowerCase();
            }
            const meta = cardCatalog[cName] || {};
            return (meta.type || meta.type_line || "").toLowerCase();
        };

        const isLegal = (cName) => {
            if (!cName || isLand(cName)) return false;
            const meta = cardCatalog[cName];
            const colors = (meta && meta.color_identity) ? meta.color_identity : this.cardColorMap[cName];
            if (colors && !this.isColorLegal(colors, commanderColors)) return false;
            return true;
        };

        const selected = new Set();

        // 1. Gather theme and archetype candidate pools
        const rawThemeCards = (themeData.cards || []).map(c => typeof c === 'string' ? c : (c.name || "")).filter(isLegal);
        const globalArchCards = this.getArchetypeCards(themeSlug, commanderColors, 100).filter(isLegal);

        const isEnchantTheme = themeSlug.includes("enchant") || themeSlug === "auras";
        const isArtifactTheme = themeSlug.includes("artifact") || themeSlug === "equipment" || themeSlug === "cheerios";

        const typePrioritySort = (a, b) => {
            const tA = getCardType(a);
            const tB = getCardType(b);
            if (isEnchantTheme) {
                const aEnc = tA.includes("enchantment") ? 1 : 0;
                const bEnc = tB.includes("enchantment") ? 1 : 0;
                if (aEnc !== bEnc) return bEnc - aEnc;
            }
            if (isArtifactTheme) {
                const aArt = tA.includes("artifact") ? 1 : 0;
                const bArt = tB.includes("artifact") ? 1 : 0;
                if (aArt !== bArt) return bArt - aArt;
            }
            return 0;
        };

        // 2. FILL THEMATIC SLOTS FIRST
        // Priority 1: Commander-specific theme cards
        rawThemeCards.sort(typePrioritySort);
        for (const name of rawThemeCards) {
            if (selected.size >= targetSpellsCount) break;
            selected.add(name);
        }

        // Priority 2: Global archetype cards
        globalArchCards.sort(typePrioritySort);
        for (const name of globalArchCards) {
            if (selected.size >= targetSpellsCount) break;
            selected.add(name);
        }

        // 3. STAPLES STRICTLY AS LAST RESORT (Only if slots remain unfilled)
        if (selected.size < targetSpellsCount) {
            const roles = ["ramp", "draw", "removal_creature", "removal_noncreature", "board_wipe"];
            const staplePool = [];

            for (const r of roles) {
                const list = this.staples[r] || [];
                for (const item of list) {
                    const name = typeof item === 'string' ? item : (item.name || "");
                    if (isLegal(name) && !selected.has(name)) {
                        staplePool.push(name);
                    }
                }
            }

            staplePool.sort(typePrioritySort);

            for (const name of staplePool) {
                if (selected.size >= targetSpellsCount) break;
                selected.add(name);
            }
        }

        return Array.from(selected).slice(0, targetSpellsCount);
    }

    // Step B: Calculate Land Base
    assembleLands(commanderColors, themeSlug, nonLandSpells, cardCatalog, commanderCount = 1) {
        const lands = [];
        const colorCount = commanderColors.length;
        const totalLandTarget = 100 - commanderCount - nonLandSpells.length;

        // Guaranteed basic land floors
        let minBasics = 0;
        if (colorCount === 1) minBasics = 16;
        else if (colorCount === 2) minBasics = 8;
        else if (colorCount === 3) minBasics = 6;
        else if (colorCount >= 4) minBasics = colorCount;

        const maxNonBasics = totalLandTarget - minBasics;

        const MONO_ONLY_LANDS = new Set([
            "nykthos, shrine to nyx",
            "valakut, the molten pinnacle",
            "cabal coffers",
            "emeria, the sky ruin"
        ]);

        const ATTACK_ONLY_LANDS = new Set([
            "slayers' stronghold",
            "sunhome, fortress of the legion",
            "hanweir battlements",
            "flamekin village",
            "kessig wolf run",
            "rogue's passage",
            "windbrisk heights"
        ]);

        // Evaluate live deck spell composition
        let numArtifacts = 0;
        let numCreatures = 0;
        let requiresSnow = themeSlug === "snow";

        for (const spellName of nonLandSpells) {
            const meta = cardCatalog[spellName];
            const tLine = (this.cardTypes && this.cardTypes[spellName]) ? this.cardTypes[spellName].toLowerCase() : ((meta && (meta.type || meta.type_line)) ? (meta.type || meta.type_line).toLowerCase() : "");
            const oText = (meta && meta.oracle_text) ? meta.oracle_text.toLowerCase() : "";
            const lowerName = spellName.toLowerCase();

            if (tLine.includes("artifact")) numArtifacts++;
            if (tLine.includes("creature")) numCreatures++;

            if (!requiresSnow) {
                if (oText.includes("{s}") || oText.includes("snow-covered") || oText.includes("snow land") || oText.includes("snow permanent") || lowerName === "extraplanar lens") {
                    requiresSnow = true;
                }
            }
        }

        const isPillowfortOrControl = themeSlug === "pillowfort" || themeSlug === "stax" || themeSlug === "control";

        const tryAddLand = (landName) => {
            if (!landName || lands.includes(landName)) return false;
            if (lands.length >= maxNonBasics) return false;

            const lower = landName.toLowerCase();

            if (MONO_ONLY_LANDS.has(lower) && colorCount > 1) return false;
            if (ATTACK_ONLY_LANDS.has(lower) && isPillowfortOrControl) return false;
            if (lower === "academy ruins" && numArtifacts < 8 && themeSlug !== "artifacts" && themeSlug !== "cheerios") return false;
            if (lower === "volrath's stronghold" && numCreatures < 15 && themeSlug !== "reanimator") return false;

            const meta = cardCatalog[landName];
            const landColors = (meta && meta.color_identity) ? meta.color_identity : this.cardColorMap[landName];
            if (landColors && landColors.length > 0 && !this.isColorLegal(landColors, commanderColors)) {
                return false;
            }

            lands.push(landName);
            return true;
        };

        // 1. Universal Fixers
        if (colorCount >= 2) {
            tryAddLand(this.landsData.fixers.command_tower);
            tryAddLand(this.landsData.fixers.city_of_brass);
            tryAddLand(this.landsData.fixers.mana_confluence);
            tryAddLand(this.landsData.fixers.reflecting_pool);
        }
        if (colorCount >= 3) {
            tryAddLand(this.landsData.fixers.exotic_orchard);
        }

        // 2. Dual Cycles (Fetches, Shocks, ABUR, Checks, Pains, Filters)
        const cyclesOrder = ["fetch", "shock", "abur", "check", "pain", "filter"];
        for (const cycle of cyclesOrder) {
            for (let i = 0; i < commanderColors.length; i++) {
                for (let j = i + 1; j < commanderColors.length; j++) {
                    const c1 = commanderColors[i];
                    const c2 = commanderColors[j];
                    const key1 = `${c1}${c2}`;
                    const key2 = `${c2}${c1}`;
                    const duals = this.landsData.duals[key1] || this.landsData.duals[key2];
                    if (duals && duals[cycle]) {
                        tryAddLand(duals[cycle]);
                    }
                }
            }
        }

        // 3. Tri-Lands for 3-color decks
        if (colorCount === 3 && this.landsData.tri_lands) {
            for (const [triKey, triName] of Object.entries(this.landsData.tri_lands)) {
                const triColors = triKey.split("");
                if (triColors.every(c => commanderColors.includes(c))) {
                    tryAddLand(triName);
                }
            }
        }

        // 4. Guild Utility Lands (2 to 3 colors)
        if (colorCount >= 2 && colorCount <= 3 && this.landsData.utility && this.landsData.utility.guild_utility) {
            for (let i = 0; i < commanderColors.length; i++) {
                for (let j = i + 1; j < commanderColors.length; j++) {
                    const key1 = `${commanderColors[i]}${commanderColors[j]}`;
                    const key2 = `${commanderColors[j]}${commanderColors[i]}`;
                    const guildLands = this.landsData.utility.guild_utility[key1] || this.landsData.utility.guild_utility[key2] || [];
                    for (const lName of guildLands) {
                        tryAddLand(lName);
                    }
                }
            }
        }

        // 5. Theme-Specific Utility Lands
        const themeLands = (this.landsData.utility && this.landsData.utility.theme_specific && this.landsData.utility.theme_specific[themeSlug]) || [];
        for (const lName of themeLands) {
            tryAddLand(lName);
        }

        // 6. Colored Staples
        if (this.landsData.utility && this.landsData.utility.colored_staples) {
            for (const color of commanderColors) {
                const staples = this.landsData.utility.colored_staples[color] || [];
                for (const lName of staples) {
                    tryAddLand(lName);
                }
            }
        }

        // 7. Generic Colorless Utility
        const colorlessCaps = { 0: 36, 1: 4, 2: 4, 3: 2, 4: 0, 5: 0 };
        const maxColorless = colorlessCaps[colorCount] ?? 0;
        let colorlessCount = 0;
        const genericColorless = (this.landsData.utility && this.landsData.utility.generic_colorless) || [];
        for (const item of genericColorless) {
            if (colorlessCount >= maxColorless) break;
            const uName = typeof item === "string" ? item : item.name;
            if (tryAddLand(uName)) {
                colorlessCount++;
            }
        }

        // 8. Basic Land Allocation Proportional to Pips
        const remainingSlots = Math.max(totalLandTarget - lands.length, 1);

        if (colorCount === 0) {
            for (let i = 0; i < remainingSlots; i++) lands.push("Wastes");
            return lands;
        }

        const prefix = requiresSnow ? "Snow-Covered " : "";
        const basicNames = {
            W: `${prefix}Plains`,
            U: `${prefix}Island`,
            B: `${prefix}Swamp`,
            R: `${prefix}Mountain`,
            G: `${prefix}Forest`
        };

        const pipCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
        let totalPips = 0;

        for (const spellName of nonLandSpells) {
            const card = cardCatalog[spellName];
            if (!card) continue;
            const costStr = card.mana_cost || card.manaCost || "";
            const matches = costStr.match(/\{([WUBRG])\}/g) || [];
            for (const m of matches) {
                const color = m.replace(/[\{\}]/g, "");
                if (pipCounts[color] !== undefined) {
                    pipCounts[color]++;
                    totalPips++;
                }
            }
        }

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
        let commanderPayload = await this.loadCommanderThemes(slug);

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

        // 1. Commander-specific theme check
        if (commanderPayload) {
            const checkTheme = (container) => {
                if (!container || !normalizedTheme) return null;
                return container[normalizedTheme] || null;
            };

            const tMatch = checkTheme(commanderPayload.themes) || checkTheme(commanderPayload.tribes);
            if (tMatch) {
                const candidate = tMatch.data || tMatch;
                if (candidate && Array.isArray(candidate.cards) && candidate.cards.length >= 10) {
                    themeData = candidate;
                }
            } else if ((!normalizedTheme || normalizedTheme === "default") && commanderPayload.default) {
                const defCandidate = commanderPayload.default.data || commanderPayload.default;
                if (defCandidate && Array.isArray(defCandidate.cards) && defCandidate.cards.length >= 10) {
                    themeData = defCandidate;
                }
            }
        }

        // 2. Fallback to unified theme profile if commander file has insufficient data
        if (!themeData && normalizedTheme && this.themeFallbacks && this.themeFallbacks[normalizedTheme]) {
            const fallback = this.themeFallbacks[normalizedTheme];
            if (fallback && Array.isArray(fallback.cards) && fallback.cards.length > 0) {
                themeData = fallback;
                actualSlug = normalizedTheme;
            }
        }

        // 3. Fallback to commander default
        if (!themeData && commanderPayload && commanderPayload.default) {
            const defCandidate = commanderPayload.default.data || commanderPayload.default;
            if (defCandidate && Array.isArray(defCandidate.cards)) {
                themeData = defCandidate;
            }
        }

        // 4. Safe baseline fallback
        if (!themeData) {
            themeData = { targets: {}, cards: [], distribution: {}, roles: {} };
        }

        const cmdrCount = commanderB ? 2 : 1;
        const spells = this.assembleSpells(themeData, actualSlug, commanderColors, cardCatalog, cmdrCount);
        const lands = this.assembleLands(commanderColors, actualSlug, spells, cardCatalog, cmdrCount);

        return [...spells, ...lands];
    }
}

window.PrefireDeckGenerator = PrefireDeckGenerator;