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
        let payload = null;
        try {
            const firstChar = /^[a-z0-9]/.test(slug) ? slug[0] : "_";
            const res = await fetch(`data/themes/${firstChar}/${slug}.json`);
            if (res.ok) {
                const text = await res.text();
                if (text && !text.trim().startsWith("<")) {
                    payload = JSON.parse(text);
                }
            }
        } catch (e) {}

        const clean = slug.toLowerCase().trim();
        const swarmConfigs = {
            "relentless-rats": {
                label: "Relentless Rats (Swarm)",
                commanders: new Set([
                    "marrow-gnawer", "balthor-the-defiled", "chainer-dementia-master",
                    "shirei-shizos-caretaker", "sidisi-undead-vizier", "karador-ghost-chieftain",
                    "jarad-golgari-lich-lord", "geth-lord-of-the-vault", "ayara-first-of-locthwain",
                    "krrik-son-of-yawgmoth"
                ])
            },
            "shadowborn-apostle": {
                label: "Shadowborn Apostle (Swarm)",
                commanders: new Set([
                    "athreos-god-of-passage", "shirei-shizos-caretaker", "razaketh-the-foulblooded",
                    "lyzolda-the-blood-witch", "meren-of-clan-nel-toth", "whisper-blood-liturgist",
                    "chainer-dementia-master", "taborax-hopes-demise"
                ])
            },
            "persistent-petitioners": {
                label: "Persistent Petitioners (Swarm)",
                commanders: new Set([
                    "grand-arbiter-augustin-iv", "phenax-god-of-deception", "oona-queen-of-the-fae",
                    "the-mimeoplasm", "arcades-the-strategist", "circu-dimir-lobotomist",
                    "bruvac-the-grandiloquent", "captain-ngathrod"
                ])
            }
        };

        let result = payload || {};
        if (!result.themes) result.themes = {};

        Object.keys(swarmConfigs).forEach(themeKey => {
            const cfg = swarmConfigs[themeKey];
            if (cfg.commanders.has(clean)) {
                result.themes[themeKey] = { label: cfg.label };
            }
        });

        return result;
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

    // Step A: Assemble Non-Land Spells with Balanced Distribution and On-Theme Functional Quotas
    assembleSpells(themeData, themeSlug, commanderColors, cardCatalog, commanderCount = 1, powerLevel = "medium") {
        const dist = (themeData && themeData.distribution) ? themeData.distribution : {};
        const targetLandCount = (typeof dist.lands === 'number') ? dist.lands : ((themeData && themeData.targets && themeData.targets.lands) ? themeData.targets.lands : 36);
        const targetSpellsCount = 100 - commanderCount - targetLandCount;

        const SWARM_CARDS = ["Relentless Rats", "Shadowborn Apostle", "Persistent Petitioners"];
        const isSwarmTheme = ["relentless-rats", "shadowborn-apostle", "persistent-petitioners"].includes(themeSlug);

        const GAME_CHANGER_NAMES = new Set([
            "ad nauseam", "ancient tomb", "aura shards", "biorhythm", "bolas's citadel",
            "braids, cabal minion", "chrome mox", "coalition victory", "consecrated sphinx",
            "crop rotation", "cyclonic rift", "deflecting swat", "demonic tutor",
            "drannith magistrate", "enlightened tutor", "expropriate", "farewell",
            "field of the dead", "fierce guardianship", "food chain", "force of will",
            "gaea's cradle", "gamble", "gifts ungiven", "glacial chasm",
            "grand arbiter augustin iv", "grim monolith", "humility", "imperial seal",
            "intuition", "jeska's will", "jin-gitaxias, core augur", "kinnan, bonder prodigy",
            "lion's eye diamond", "mana vault", "mishra's workshop", "mox diamond",
            "mystical tutor", "narset, parter of veils", "natural order", "necropotence",
            "notion thief", "opposition agent", "orcish bowmasters", "panoptic mirror",
            "rhystic study", "seedborn muse", "serra's sanctum", "smothering tithe",
            "survival of the fittest", "sway of the stars", "teferi's protection",
            "tergrid, god of fright", "tergrid, god of fright // tergrid's lantern",
            "thassa's oracle", "the one ring", "the tabernacle at pendrell vale",
            "underworld breach", "urza, lord high artificer", "vampiric tutor",
            "vorinclex, voice of hunger", "winota, joiner of forces", "worldly tutor",
            "yuriko, the tiger's shadow"
        ]);

        const isGameChanger = (name) => {
            const clean = name.trim().toLowerCase();
            const front = clean.split("//")[0].trim();
            return GAME_CHANGER_NAMES.has(clean) || GAME_CHANGER_NAMES.has(front);
        };

        const maxGameChangers = powerLevel === "low" ? 0 : (powerLevel === "medium" ? 3 : Infinity);
        let currentGameChangerCount = 0;

        const blueprint = (themeData && themeData.blueprint) ? themeData.blueprint : {};
        const blueprintExclusions = new Set((blueprint.exclusions || []).map(n => n.toLowerCase().trim()));

       const isLegalSpell = (cName) => {
            if (!cName) return false;
            if (this.isLandCard(cName, cardCatalog)) return false;

            const cleanName = cName.trim();
            const lower = cleanName.toLowerCase();

            if (blueprintExclusions.has(lower)) return false;
            if (!isSwarmTheme && SWARM_CARDS.includes(cleanName)) return false;

            // Universal Anti-Synergy & Parasitic Guardrails
            // If a card requires a parasitic mechanic not matched by theme, reject it
            if (lower === "trapjaw tyrant" && !themeSlug.includes("dinosaur")) return false;

           const isColorlessDeck = commanderColors.length === 0 || themeSlug === "eldrazi" || themeSlug === "devoid" || themeSlug === "artifacts";
            if ((lower === "titan's presence" || lower === "gruesome slaughter") && !isColorlessDeck) return false;
            if ((lower === "warping wail" || lower === "spatial contortion") && !isColorlessDeck && commanderColors.length > 2) return false;
            if (lower === "not of this world" && !isColorlessDeck && themeSlug !== "big-mana" && themeSlug !== "voltron") return false;
            if (lower === "trapjaw tyrant" && !themeSlug.includes("dinosaur") && themeSlug !== "enrage") return false;

            if (lower === "dragon's hoard" && themeSlug !== "dragons") return false;
            if (lower === "pillar of origins" && !themeSlug.includes("trib") && themeSlug !== "slivers" && themeSlug !== "elves" && themeSlug !== "goblins" && themeSlug !== "zombies") return false;

            if (isGameChanger(cleanName) && currentGameChangerCount >= maxGameChangers) {
                return false;
            }

            const meta = cardCatalog[cName] || cardCatalog[lower];
            const colors = (meta && meta.color_identity) ? meta.color_identity : this.cardColorMap[lower];

            if (colors && !this.isColorLegal(colors, commanderColors)) return false;
            return true;
        };

        // Mechanical Sub-Role Classifiers
        const isAuraModifier = (cardName) => {
            const tLine = this.getCardTypeLine(cardName, cardCatalog);
            const meta = cardCatalog[cardName] || cardCatalog[cardName.toLowerCase()] || {};
            const text = (meta.oracle_text || meta.text || "").toLowerCase();
            return tLine.includes("aura") && (text.includes("enchant creature") || text.includes("enchanted creature gets") || text.includes("enchanted creature has"));
        };

        const isEquipmentCard = (cardName) => {
            const tLine = this.getCardTypeLine(cardName, cardCatalog);
            return tLine.includes("equipment");
        };

        const isProtectionOrEvasion = (cardName) => {
            const meta = cardCatalog[cardName] || cardCatalog[cardName.toLowerCase()] || {};
            const text = (meta.oracle_text || meta.text || "").toLowerCase();
            return text.includes("hexproof") || text.includes("shroud") || text.includes("indestructible") ||
                   text.includes("protection from") || text.includes("can't be blocked") || text.includes("unblockable") ||
                   text.includes("double strike") || text.includes("totem armor") || text.includes("umbra");
        };

        const isSacOutlet = (cardName) => {
            const meta = cardCatalog[cardName] || cardCatalog[cardName.toLowerCase()] || {};
            const text = (meta.oracle_text || meta.text || "").toLowerCase();
            return text.includes("sacrifice a creature:") || text.includes("sacrifice another creature:");
        };

        const isDeathTrigger = (cardName) => {
            const meta = cardCatalog[cardName] || cardCatalog[cardName.toLowerCase()] || {};
            const text = (meta.oracle_text || meta.text || "").toLowerCase();
            return text.includes("whenever a creature dies") || text.includes("whenever another creature dies") || text.includes("whenever this creature dies");
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
            if (text.includes("draw a card") || text.includes("draw two") || text.includes("draw cards") || text.includes("draws a card") ||
                text.includes("whenever this creature deals combat damage to a player, draw") ||
                text.includes("whenever a creature you control deals combat damage to a player, draw")) {
                detected.push("draw");
            }
            const isNarrowConditionalWipe = cardName.toLowerCase() === "aligned hedron network";
            if (!isNarrowConditionalWipe && (text.includes("destroy all") || text.includes("exile all") || text.includes("each player sacrifices all"))) {
                detected.push("board_wipe");
            } else if (text.includes("destroy target") || text.includes("exile target") || text.includes("deals damage to target")) {
                if (text.includes("creature")) detected.push("removal_creature");
                if (text.includes("noncreature") || text.includes("artifact") || text.includes("enchantment") || text.includes("permanent")) {
                    detected.push("removal_noncreature");
                }
            }

            if (text.includes("hexproof") || text.includes("shroud") || text.includes("indestructible") ||
                text.includes("counter target") || text.includes("prevent all damage") || text.includes("phase out")) {
                detected.push("protection");
            }
            if (text.includes("return target") && (text.includes("from your graveyard") || text.includes("from a graveyard"))) {
                detected.push("recursion");
            }
            if (text.includes("search your library for a card") || text.includes("search your library for a creature")) {
                detected.push("tutors");
            }

            return detected;
        };

        const isThemeAligned = (name) => {
            const clean = themeSlug.toLowerCase();
            const tLine = this.getCardTypeLine(name, cardCatalog);
            const meta = cardCatalog[name] || cardCatalog[name.toLowerCase()] || {};
            const text = (meta.oracle_text || meta.text || "").toLowerCase();
            const lowerName = name.toLowerCase();

            // Strict Disambiguation: Voltron vs Auras vs Enchantress
            if (clean === "voltron") {
                return isAuraModifier(name) || isEquipmentCard(name) || isProtectionOrEvasion(name) || text.includes("equipped creature") || text.includes("enchanted creature");
            }
            if (clean === "auras") {
                return isAuraModifier(name) || (tLine.includes("enchantment") && text.includes("aura"));
            }
            if (clean === "enchantress") {
                return tLine.includes("enchantment") || text.includes("whenever you cast an enchantment spell");
            }
            if (clean === "aristocrats") {
                return isSacOutlet(name) || isDeathTrigger(name) || text.includes("sacrifice");
            }
            if (clean === "spellslinger") {
                return (tLine.includes("instant") || tLine.includes("sorcery")) && (text.includes("draw") || text.includes("damage") || text.includes("copy") || text.includes("cost less"));
            }

            const singularTribe = clean.replace(/s$/, "");
            if (tLine.includes(clean) || tLine.includes(singularTribe)) return true;

            const keywords = this.themeSignatures[clean] || [clean.replace(/-/g, " ")];
            if (keywords.some(kw => lowerName.includes(kw) || text.includes(kw))) return true;

            return false;
        };

        // Resolve Tiered Power Targets: check themeData.targets[powerLevel] first
        const allTargets = (themeData && themeData.targets) ? themeData.targets : {};
        const activeTargets = (allTargets[powerLevel] && typeof allTargets[powerLevel] === 'object')
            ? allTargets[powerLevel]
            : (allTargets.medium || allTargets);

        const empRoles = (themeData && themeData.roles) ? themeData.roles : {};
        const overrides = blueprint.role_overrides || {};

        const resolveQuota = (overrideVal, targetVal, roleVal, baseline) => {
            if (typeof overrideVal === 'number') return overrideVal;
            if (typeof targetVal === 'number') return targetVal;
            if (typeof roleVal === 'number' && roleVal > 0) return roleVal;
            return baseline;
        };

        const quotas = {
            ramp: resolveQuota(overrides.ramp, activeTargets.ramp, empRoles.ramp, 8),
            draw: resolveQuota(overrides.draw, activeTargets.draw, empRoles.draw, 10),
            protection: resolveQuota(overrides.protection, activeTargets.protection, null, 3),
            recursion: resolveQuota(overrides.recursion, activeTargets.recursion, null, 3),
            tutors: resolveQuota(overrides.tutors, activeTargets.tutors, null, powerLevel === 'low' ? 0 : 2),
            removal_creature: resolveQuota(overrides.removal_creature, activeTargets.removal_creature, empRoles.removal_creature, 5),
            removal_noncreature: resolveQuota(overrides.removal_noncreature, activeTargets.removal_noncreature, empRoles.removal_noncreature, 2),
            board_wipe: resolveQuota(overrides.board_wipe, activeTargets.board_wipe, empRoles.wipes, powerLevel === 'high' ? 1 : 2)
        };

        const isEnchantTheme = themeSlug.includes("enchant") || themeSlug === "auras";
        const isArtifactTheme = themeSlug.includes("artifact") || themeSlug === "equipment" || themeSlug === "cheerios";

        // Enforce engine density floor from active targets or blueprint
        const targetArchetypeDensity = (typeof activeTargets.engine === 'number')
            ? activeTargets.engine
            : (blueprint.engine_floor || (isEnchantTheme ? 30 : (isArtifactTheme ? 26 : 22)));

        // Gather candidate pools
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
        const unifiedThemePool = Array.from(new Set([...cmdrThemeCards, ...globalArchCards]));

        // Gather format staples pool
        const staplePool = [];
        for (const roleList of Object.values(this.staples)) {
            if (Array.isArray(roleList)) {
                for (const item of roleList) {
                    const name = typeof item === 'string' ? item : (item.name || "");
                    if (isLegalSpell(name) && !staplePool.includes(name)) {
                        staplePool.push(name);
                    }
                }
            }
        }

        const selected = new Set();
        const swarmPackage = [];

        if (isSwarmTheme) {
            const swarmSpecs = {
                "relentless-rats": {
                    name: "Relentless Rats",
                    count: 30,
                    staples: ["Thrumming Stone", "Secret Salvage", "Bontu's Monument", "Phyrexian Arena"]
                },
                "shadowborn-apostle": {
                    name: "Shadowborn Apostle",
                    count: 32,
                    staples: ["Thrumming Stone", "Edgewalker", "Razaketh, the Foulblooded", "Rune-Scarred Demon", "Living Death", "Patriarch's Bidding"]
                },
                "persistent-petitioners": {
                    name: "Persistent Petitioners",
                    count: 28,
                    staples: ["Thrumming Stone", "Intruder Alarm", "Dramatic Reversal", "Isochron Scepter", "Sphinx's Tutelage"]
                }
            };

            const spec = swarmSpecs[themeSlug];
            if (spec) {
                for (let i = 0; i < spec.count; i++) {
                    swarmPackage.push(spec.name);
                }
                spec.staples.forEach(stapleName => {
                    if (isLegalSpell(stapleName)) {
                        selected.add(stapleName);
                    }
                });
            }
        }

        const roleBuckets = {
            ramp: 0,
            draw: 0,
            protection: 0,
            recursion: 0,
            tutors: 0,
            removal_creature: 0,
            removal_noncreature: 0,
            board_wipe: 0
        };

        let archetypePermanentCount = 0;

        const checkArchetypePermanent = (name) => {
            const tLine = this.getCardTypeLine(name, cardCatalog);
            if (isEnchantTheme && tLine.includes("enchantment")) return true;
            if (isArtifactTheme && tLine.includes("artifact")) return true;
            return false;
        };

        const addCardToDeck = (name) => {
            if (!name || selected.has(name) || selected.size >= targetSpellsCount) return false;
            if (isGameChanger(name)) {
                if (currentGameChangerCount >= maxGameChangers) return false;
                currentGameChangerCount++;
            }
            selected.add(name);
            if (checkArchetypePermanent(name)) archetypePermanentCount++;
            for (const r of detectCardRoles(name)) {
                if (roleBuckets[r] !== undefined) roleBuckets[r]++;
            }
            return true;
        };

        // Utility: Partition candidates into 3 tiers and sample with power-level weights
        // Smart Contextual Synergy Evaluator & Tiered Sampler
        const evaluateCardFitness = (cardName, slug, level) => {
            const meta = cardCatalog[cardName] || cardCatalog[cardName.toLowerCase()] || {};
            const text = (meta.oracle_text || meta.text || "").toLowerCase();
            const tLine = this.getCardTypeLine(cardName, cardCatalog);
            const cmc = meta.cmc !== undefined ? meta.cmc : 3;

            let score = meta.score || 1.0;
            const cleanSlug = slug.toLowerCase();

            // 1. Archetype-Specific Mechanical Intelligence
            if (cleanSlug === "voltron") {
                if (tLine.includes("equipment") || tLine.includes("aura") || text.includes("equipped creature") || text.includes("enchanted creature")) {
                    score *= 3.5;
                }
                if (text.includes("hexproof") || text.includes("indestructible") || text.includes("shroud")) {
                    score *= 2.5;
                }
                if (text.includes("sacrifice a creature") || text.includes("tokens you control get")) {
                    score *= 0.1; // Suppress wide token/sac cards in single-threat Voltron
                }
            } else if (cleanSlug.includes("landfall") || cleanSlug.includes("karametra")) {
                if (text.includes("whenever a land enters") || text.includes("play an additional land") || text.includes("search your library for a land")) {
                    score *= 4.0;
                }
                // Suppress generic low-impact dorks that don't ramp lands or synergize with landfall
                if (tLine.includes("creature") && cmc <= 2 && !text.includes("land") && !text.includes("search")) {
                    score *= 0.2; 
                }
                // Block off-theme mechanics like Dinosaur Enrage (*Trapjaw Tyrant*)
                if (text.includes("enrage") || tLine.includes("dinosaur")) {
                    score *= 0.01;
                }
            } else if (cleanSlug === "aristocrats") {
                if (text.includes("sacrifice a creature") || text.includes("sacrifice another")) score *= 4.0;
                if (text.includes("whenever a creature dies")) score *= 3.5;
            }

            // 2. Power Level Curve Weighting
            if (level === "high") {
                if (cmc >= 5) score *= 0.4; // Punish clunky high-mana drops
                if (cmc <= 2) score *= 1.5; // Reward fast setup
            } else if (level === "low") {
                if (cmc >= 5) score *= 1.5; // Reward big battlecruiser spells
            }

            return score;
        };

        const sampleCandidatesWithPowerTier = (candidatesList, limit, level = powerLevel) => {
            if (!candidatesList || candidatesList.length === 0) return [];

            // Score and sort candidates intelligently based on deck context
            const scored = candidatesList.map(name => ({
                name,
                fitness: evaluateCardFitness(name, themeSlug, level)
            })).sort((a, b) => b.fitness - a.fitness);

            const highCut = Math.max(1, Math.floor(scored.length * 0.25));
            const midCut = Math.max(highCut + 1, Math.floor(scored.length * 0.65));

            const topTier = scored.slice(0, highCut).map(i => i.name);
            const midTier = scored.slice(highCut, midCut).map(i => i.name);
            const lowTier = scored.slice(midCut).map(i => i.name);

            const shuffle = (arr) => arr.slice().sort(() => Math.random() - 0.5);

            let primaryPool = [];
            if (level === "high") {
                primaryPool = [...shuffle(topTier), ...shuffle(midTier)];
            } else if (level === "low") {
                primaryPool = [...shuffle(lowTier), ...shuffle(midTier), ...shuffle(topTier)];
            } else {
                primaryPool = [...shuffle(midTier), ...shuffle(topTier), ...shuffle(lowTier)];
            }
            return primaryPool.slice(0, limit);
        };

        // PASS 0: Ingest Core Archetype Sub-Roles First (Modifiers, Sac Outlets, Protection, etc.)
        const subRoles = (blueprint && blueprint.sub_roles) ? blueprint.sub_roles : {};

        for (const [subRole, quota] of Object.entries(subRoles)) {
            let needed = quota;
            const subRoleCandidates = unifiedThemePool.filter(name => {
                if (selected.has(name) || !isLegalSpell(name)) return false;
                const r = this.cardRoles[name] || this.cardRoles[name.toLowerCase()] || [];
                return r.includes(subRole);
            });

            const sampledList = sampleCandidatesWithPowerTier(subRoleCandidates, subRoleCandidates.length, powerLevel);
            for (const name of sampledList) {
                if (needed <= 0 || selected.size >= targetSpellsCount) break;
                if (addCardToDeck(name)) {
                    needed--;
                }
            }
        }

        // Top off core archetype density if sub-roles did not reach target floor
        const pureThemeCandidates = unifiedThemePool.filter(name => !selected.has(name) && isLegalSpell(name) && isThemeAligned(name));
        const sampledCoreTheme = sampleCandidatesWithPowerTier(pureThemeCandidates, pureThemeCandidates.length, powerLevel);

        for (const name of sampledCoreTheme) {
            if (selected.size >= targetArchetypeDensity || selected.size >= targetSpellsCount) break;
            addCardToDeck(name);
        }

        // PASS 1: Fill functional quotas prioritizing theme-aligned / vector-matched cards
        const preferredRamp = blueprint.preferred_ramp_type || null;
        const disallowedRamp = blueprint.disallowed_ramp_types || [];

        for (const [role, quota] of Object.entries(quotas)) {
            let needed = quota - roleBuckets[role];
            if (needed <= 0) continue;

            const roleCandidates = [...unifiedThemePool, ...staplePool].filter(name => {
                if (selected.has(name) || !isLegalSpell(name)) return false;
                const roles = detectCardRoles(name);
                if (!roles.includes(role)) return false;

                // Enforce strict ramp vector filtering (e.g. Landfall wants land-ramp, not elf dorks)
                if (role === 'ramp' && preferredRamp) {
                    const metaText = ((cardCatalog[name] || {}).oracle_text || "").toLowerCase();
                    const isLandRamp = metaText.includes("search your library for a land") || metaText.includes("put a land onto the battlefield");
                    const isDork = metaText.includes("creature") && (metaText.includes("add {") || metaText.includes("add one mana"));
                    const isRock = metaText.includes("artifact") && (metaText.includes("add {") || metaText.includes("add one mana"));

                    if (preferredRamp === "ramp_land" && !isLandRamp) return false;
                    if (disallowedRamp.includes("ramp_dork") && isDork) return false;
                    if (disallowedRamp.includes("ramp_rock") && isRock) return false;
                }

                return true;
            });

            roleCandidates.sort((a, b) => {
                const aTheme = isThemeAligned(a) ? 100 : (cmdrThemeCards.includes(a) ? 50 : 0);
                const bTheme = isThemeAligned(b) ? 100 : (cmdrThemeCards.includes(b) ? 50 : 0);
                return bTheme - aTheme;
            });

            const sampledRoleList = sampleCandidatesWithPowerTier(roleCandidates, roleCandidates.length, powerLevel);

            for (const name of sampledRoleList) {
                if (needed <= 0 || selected.size >= targetSpellsCount) break;
                if (addCardToDeck(name)) {
                    needed--;
                }
            }
        }

        // PASS 2: Top off any remaining archetype permanent floor if still short
        if (targetArchetypeDensity > 0 && archetypePermanentCount < targetArchetypeDensity) {
            const remainingArchPermanents = unifiedThemePool.filter(name =>
                !selected.has(name) && isLegalSpell(name) && checkArchetypePermanent(name)
            );
            const sampledPermanents = sampleCandidatesWithPowerTier(remainingArchPermanents, remainingArchPermanents.length, powerLevel);

            for (const name of sampledPermanents) {
                if (archetypePermanentCount >= targetArchetypeDensity || selected.size >= targetSpellsCount) break;
                addCardToDeck(name);
            }
        }

        // PASS 3: Fill remaining open slots from the commander's synergy pool
        const commanderSynergyRemaining = cmdrThemeCards.filter(name => !selected.has(name) && isLegalSpell(name));
        const sampledCommanderSynergy = sampleCandidatesWithPowerTier(commanderSynergyRemaining, commanderSynergyRemaining.length, powerLevel);
        for (const name of sampledCommanderSynergy) {
            if (selected.size >= targetSpellsCount) break;
            addCardToDeck(name);
        }

        // PASS 4: Fill remaining open slots from global archetype candidates
        const globalArchRemaining = globalArchCards.filter(name => !selected.has(name) && isLegalSpell(name));
        const sampledGlobalArch = sampleCandidatesWithPowerTier(globalArchRemaining, globalArchRemaining.length, powerLevel);
        for (const name of sampledGlobalArch) {
            if (selected.size >= targetSpellsCount) break;
            addCardToDeck(name);
        }

        // PASS 5: Fill any remaining open slots with format staples as backfill
        const stapleRemaining = staplePool.filter(name => !selected.has(name) && isLegalSpell(name));
        const sampledStaples = sampleCandidatesWithPowerTier(stapleRemaining, stapleRemaining.length, powerLevel);
        for (const name of sampledStaples) {
            if (selected.size >= targetSpellsCount) break;
            addCardToDeck(name);
        }

        const remainingCapacity = Math.max(0, targetSpellsCount - swarmPackage.length);
        const nonSwarmSpells = Array.from(selected).slice(0, remainingCapacity);
        return [...swarmPackage, ...nonSwarmSpells];
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

    async generate(commanderA, commanderB = null, selectedThemeSlug = null, cardCatalog = {}, powerLevel = "medium") {
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
        const spells = this.assembleSpells(themeData, actualSlug, commanderColors, cardCatalog, cmdrCount, powerLevel);
        const lands = this.assembleLands(commanderColors, actualSlug, spells, cardCatalog, cmdrCount);

        return [...spells, ...lands];
    }
}

if (typeof window !== 'undefined') {
    window.PrefireDeckGenerator = PrefireDeckGenerator;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PrefireDeckGenerator };
}