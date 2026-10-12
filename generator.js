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

            let fallbacksData = await safeFetchJson("data/themes/theme-fallbacks.json") || await safeFetchJson("theme-fallbacks.json");

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

            // Ingest color identities from staples
            if (this.staples) {
                Object.values(this.staples).forEach(list => {
                    if (Array.isArray(list)) {
                        list.forEach(c => {
                            if (c && c.name && c.colors) {
                                this.cardColorMap[c.name.toLowerCase()] = c.colors;
                            }
                        });
                    }
                });
            }

            // Ingest color identities from archetype-index
            if (this.archetypeIndex) {
                Object.values(this.archetypeIndex).forEach(list => {
                    if (Array.isArray(list)) {
                        list.forEach(c => {
                            if (c && c.name && c.colors) {
                                this.cardColorMap[c.name.toLowerCase()] = c.colors;
                            }
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

    getCardTypeLine(cardName, cardCatalog) {
        if (!cardName) return "";
        const clean = cardName.trim();
        if (this.cardTypes) {
            if (this.cardTypes[clean]) return this.cardTypes[clean].toLowerCase();
            const lowerKey = Object.keys(this.cardTypes).find(k => k.toLowerCase() === clean.toLowerCase());
            if (lowerKey) return this.cardTypes[lowerKey].toLowerCase();
        }
        const meta = cardCatalog[clean] || cardCatalog[clean.toLowerCase()] || {};
        return (meta.type_line || meta.type || "").toLowerCase();
    }

    isLandCard(cardName, cardCatalog) {
        if (!cardName) return false;
        const lower = cardName.trim().toLowerCase();

        // 1. Check type line from card-types.json or catalog
        const tLine = this.getCardTypeLine(cardName, cardCatalog);
        if (tLine.includes("land")) return true;

        // 2. Check all lands tables
        if (this.landsData) {
            if (this.landsData.fixers && Object.values(this.landsData.fixers).some(n => n.toLowerCase() === lower)) return true;
            if (this.landsData.tri_lands && Object.values(this.landsData.tri_lands).some(n => n.toLowerCase() === lower)) return true;
            if (this.landsData.duals) {
                for (const pair of Object.values(this.landsData.duals)) {
                    if (Object.values(pair).some(n => n && n.toLowerCase() === lower)) return true;
                }
            }
            if (this.landsData.utility) {
                if (this.landsData.utility.generic_colorless && this.landsData.utility.generic_colorless.some(c => (typeof c === 'string' ? c : c.name).toLowerCase() === lower)) return true;
                if (this.landsData.utility.colored_staples) {
                    for (const list of Object.values(this.landsData.utility.colored_staples)) {
                        if (list.some(n => n.toLowerCase() === lower)) return true;
                    }
                }
            }
        }

        const basicLands = ["plains", "island", "swamp", "mountain", "forest", "wastes", "snow-covered plains", "snow-covered island", "snow-covered swamp", "snow-covered mountain", "snow-covered forest"];
        return basicLands.includes(lower);
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

    // Step A: Assemble Non-Land Spells with Universal Thematic Double-Duty Priority
    assembleSpells(themeData, themeSlug, commanderColors, cardCatalog, commanderCount = 1) {
        const dist = (themeData && themeData.distribution) ? themeData.distribution : {};
        const targetLandCount = (typeof dist.lands === 'number') ? dist.lands : ((themeData && themeData.targets && themeData.targets.lands) ? themeData.targets.lands : 36);
        const targetSpellsCount = 100 - commanderCount - targetLandCount;

        const isLegalSpell = (cName) => {
            if (!cName) return false;
            if (this.isLandCard(cName, cardCatalog)) return false;

            const lower = cName.trim().toLowerCase();
            const meta = cardCatalog[cName] || cardCatalog[lower];
            const colors = (meta && meta.color_identity) ? meta.color_identity : this.cardColorMap[lower];

            if (colors && !this.isColorLegal(colors, commanderColors)) return false;
            return true;
        };

        const detectCardRoles = (cardName) => {
            const explicit = this.cardRoles[cardName] || this.cardRoles[cardName.toLowerCase()] || [];
            if (explicit.length > 0) return explicit;
            const meta = cardCatalog[cardName] || cardCatalog[cardName.toLowerCase()] || {};
            const text = (meta.oracle_text || meta.text || "").toLowerCase();
            const tLine = this.getCardTypeLine(cardName, cardCatalog);
            const detected = [];

            if (text.includes("add ") || (text.includes("search your library for a") && text.includes("land")) || tLine.includes("mana rock")) {
                detected.push("ramp");
            }
            if (text.includes("draw a card") || text.includes("draw two") || text.includes("draw cards") || text.includes("draws a card")) {
                detected.push("draw");
            }
            if (text.includes("destroy all") || text.includes("exile all") || text.includes("each player sacrifices all")) {
                detected.push("board_wipe");
            } else if (text.includes("destroy target") || text.includes("exile target") || text.includes("deals damage to target")) {
                if (text.includes("creature")) detected.push("removal_creature");
                if (text.includes("noncreature") || text.includes("artifact") || text.includes("enchantment") || text.includes("permanent")) {
                    detected.push("removal_noncreature");
                }
            }
            return detected;
        };

        const isThemeAligned = (name) => {
            const clean = themeSlug.toLowerCase();
            const tLine = this.getCardTypeLine(name, cardCatalog);
            const meta = cardCatalog[name] || cardCatalog[name.toLowerCase()] || {};
            const text = (meta.oracle_text || meta.text || "").toLowerCase();
            const lowerName = name.toLowerCase();

            // Permanent archetype lines
            if ((clean.includes("enchant") || clean === "auras") && tLine.includes("enchantment")) return true;
            if ((clean.includes("artifact") || clean === "equipment" || clean === "cheerios") && tLine.includes("artifact")) return true;
            if (clean.includes("spellslinger") && (tLine.includes("instant") || tLine.includes("sorcery"))) return true;

            // Tribal types
            const singularTribe = clean.replace(/s$/, "");
            if (tLine.includes(clean) || tLine.includes(singularTribe)) return true;

            // Mechanically linked keywords
            const keywords = this.themeSignatures[clean] || [clean.replace(/-/g, " ")];
            if (keywords.some(kw => lowerName.includes(kw) || text.includes(kw))) return true;

            return false;
        };

        // 1. Gather all candidates from commander payload and archetype index
        let rawThemeList = [];
        if (Array.isArray(themeData)) {
            rawThemeList = themeData;
        } else if (Array.isArray(themeData.cards)) {
            rawThemeList = themeData.cards;
        } else if (Array.isArray(themeData.cardlist)) {
            rawThemeList = themeData.cardlist;
        } else if (themeData.data && Array.isArray(themeData.data.cards)) {
            rawThemeList = themeData.data.cards;
        }

        const cmdrThemeCards = rawThemeList.map(c => typeof c === 'string' ? c : (c.name || "")).filter(isLegalSpell);
        const globalArchCards = this.getArchetypeCards(themeSlug, commanderColors, 150).filter(isLegalSpell);
        const unifiedThemePool = Array.from(new Set([...globalArchCards, ...cmdrThemeCards]));

        const selected = new Set();
        const roleBuckets = {
            ramp: 0,
            draw: 0,
            removal_creature: 0,
            removal_noncreature: 0,
            board_wipe: 0
        };

        const quotas = {
            ramp: (themeData && themeData.targets && themeData.targets.ramp) || 10,
            draw: (themeData && themeData.targets && themeData.targets.draw) || 10,
            removal_creature: (themeData && themeData.targets && themeData.targets.removal_creature) || 5,
            removal_noncreature: (themeData && themeData.targets && themeData.targets.removal_noncreature) || 3,
            board_wipe: (themeData && themeData.targets && themeData.targets.board_wipe) || 2
        };

        // Rank candidates: theme synergy + functional role bonus
        const scoreCandidate = (name) => {
            let score = 0;
            const aligned = isThemeAligned(name);
            const roles = detectCardRoles(name);

            if (aligned) score += 100;
            if (cmdrThemeCards.includes(name)) score += 30;

            for (const r of roles) {
                if (quotas[r] && roleBuckets[r] < quotas[r]) {
                    score += aligned ? 50 : 15;
                }
            }

            return score;
        };

        unifiedThemePool.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

        // Pass 1: Ingest theme-aligned double-duty cards and core theme pieces
        for (const name of unifiedThemePool) {
            if (selected.size >= targetSpellsCount) break;
            selected.add(name);
            for (const r of detectCardRoles(name)) {
                if (roleBuckets[r] !== undefined) roleBuckets[r]++;
            }
        }

        // Pass 2: Backfill any role deficits prioritizing theme-aligned candidates
        for (const [role, quota] of Object.entries(quotas)) {
            let needed = quota - (roleBuckets[role] || 0);
            if (needed <= 0) continue;

            const roleCandidates = unifiedThemePool.filter(name => !selected.has(name) && detectCardRoles(name).includes(role));
            for (const name of roleCandidates) {
                if (needed <= 0 || selected.size >= targetSpellsCount) break;
                selected.add(name);
                roleBuckets[role]++;
                needed--;
            }
        }

        // Pass 3: Fill any remaining open slots with format staples strictly as a last resort
        if (selected.size < targetSpellsCount) {
            const staplePool = [];
            for (const roleList of Object.values(this.staples)) {
                if (Array.isArray(roleList)) {
                    for (const item of roleList) {
                        const name = typeof item === 'string' ? item : (item.name || "");
                        if (isLegalSpell(name) && !selected.has(name)) {
                            staplePool.push(name);
                        }
                    }
                }
            }

            staplePool.sort((a, b) => {
                const aBonus = isThemeAligned(a) ? 50 : 0;
                const bBonus = isThemeAligned(b) ? 50 : 0;
                return bBonus - aBonus;
            });

            for (const name of staplePool) {
                if (selected.size >= targetSpellsCount) break;
                selected.add(name);
            }
        }

        return Array.from(selected).slice(0, targetSpellsCount);
    }

    assembleLands(commanderColors, themeSlug, nonLandSpells, cardCatalog, commanderCount = 1) {
        const lands = [];
        const colorCount = commanderColors.length;
        const totalLandTarget = 100 - commanderCount - nonLandSpells.length;

        const alreadySelectedSpells = new Set(nonLandSpells.map(s => s.trim().toLowerCase()));

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

        let numArtifacts = 0;
        let numCreatures = 0;
        let requiresSnow = themeSlug === "snow";

        for (const spellName of nonLandSpells) {
            const tLine = this.getCardTypeLine(spellName, cardCatalog);
            const meta = cardCatalog[spellName] || {};
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
            if (!landName) return false;
            const lower = landName.trim().toLowerCase();

            // Do not dupe lands, and never add a land that was already ingested as a non-land spell!
            if (lands.some(l => l.toLowerCase() === lower)) return false;
            if (alreadySelectedSpells.has(lower)) return false;
            if (lands.length >= maxNonBasics) return false;

            if (MONO_ONLY_LANDS.has(lower) && colorCount > 1) return false;
            if (ATTACK_ONLY_LANDS.has(lower) && isPillowfortOrControl) return false;
            if (lower === "academy ruins" && numArtifacts < 8 && themeSlug !== "artifacts" && themeSlug !== "cheerios") return false;
            if (lower === "volrath's stronghold" && numCreatures < 15 && themeSlug !== "reanimator") return false;

            const meta = cardCatalog[landName] || cardCatalog[lower];
            const landColors = (meta && meta.color_identity) ? meta.color_identity : this.cardColorMap[lower];
            if (landColors && landColors.length > 0 && !this.isColorLegal(landColors, commanderColors)) {
                return false;
            }

            lands.push(landName);
            return true;
        };

        // 1. Universal Fixers
        if (colorCount >= 2 && this.landsData.fixers) {
            tryAddLand(this.landsData.fixers.command_tower);
            tryAddLand(this.landsData.fixers.city_of_brass);
            tryAddLand(this.landsData.fixers.mana_confluence);
            tryAddLand(this.landsData.fixers.reflecting_pool);
        }
        if (colorCount >= 3 && this.landsData.fixers) {
            tryAddLand(this.landsData.fixers.exotic_orchard);
        }

        // 2. Dual Cycles
        const cyclesOrder = ["fetch", "shock", "abur", "check", "pain", "filter"];
        for (const cycle of cyclesOrder) {
            for (let i = 0; i < commanderColors.length; i++) {
                for (let j = i + 1; j < commanderColors.length; j++) {
                    const c1 = commanderColors[i];
                    const c2 = commanderColors[j];
                    const key1 = `${c1}${c2}`;
                    const key2 = `${c2}${c1}`;
                    const duals = (this.landsData.duals && (this.landsData.duals[key1] || this.landsData.duals[key2]));
                    if (duals && duals[cycle]) {
                        tryAddLand(duals[cycle]);
                    }
                }
            }
        }

        // 3. Tri-Lands
        if (colorCount === 3 && this.landsData.tri_lands) {
            for (const [triKey, triName] of Object.entries(this.landsData.tri_lands)) {
                const triColors = triKey.split("");
                if (triColors.every(c => commanderColors.includes(c))) {
                    tryAddLand(triName);
                }
            }
        }

        // 4. Guild Utility Lands
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

        // 8. Basic Lands Allocation
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
            const meta = cardCatalog[spellName] || cardCatalog[spellName.toLowerCase()];
            const costStr = (meta && (meta.mana_cost || meta.manaCost)) ? (meta.mana_cost || meta.manaCost) : "";
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
            const card = cardCatalog[name] || cardCatalog[name.toLowerCase()];
            const identity = (card && card.color_identity) ? card.color_identity : this.cardColorMap[name.toLowerCase()];
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
                themeData = tMatch.data || tMatch;
            } else if ((!normalizedTheme || normalizedTheme === "default") && commanderPayload.default) {
                themeData = commanderPayload.default.data || commanderPayload.default;
            }
        }

        // 2. Fallback to unified theme profile
        if (!themeData && normalizedTheme && this.themeFallbacks && this.themeFallbacks[normalizedTheme]) {
            themeData = this.themeFallbacks[normalizedTheme];
            actualSlug = normalizedTheme;
        }

        // 3. Fallback to commander default
        if (!themeData && commanderPayload && commanderPayload.default) {
            themeData = commanderPayload.default.data || commanderPayload.default;
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