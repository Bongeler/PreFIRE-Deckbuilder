import os
import sys
import json
import re
from collections import defaultdict

RANKINGS_FILE = "universal-card-ranking.json"
VARIANTS_FILE = "variants.json"
ATOMIC_FILE = "mtgjson-atomic.json"
EDHREC_CACHE_FILE = "edhrec-prefire-cache.json"
COMMANDER_INDEX_FILE = "commander-theme-index.json"
LANDS_FILE = "prefire-lands.json"

if not os.path.exists(RANKINGS_FILE):
    print(f"FATAL ERROR: {RANKINGS_FILE} missing.")
    sys.exit(1)

with open(RANKINGS_FILE, "r", encoding="utf-8") as f:
    rankings = json.load(f)

combo_variants = []
if os.path.exists(VARIANTS_FILE):
    with open(VARIANTS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
        combo_variants = data if isinstance(data, list) else data.get("variants", [])

# Build case-insensitive lookup for all legal commanders from MTGJSON
atomic_lookup = {}
if os.path.exists(ATOMIC_FILE):
    with open(ATOMIC_FILE, "r", encoding="utf-8-sig") as f:
        raw_data = json.load(f)
        data_dict = raw_data.get("data", raw_data)
        for k, val in data_dict.items():
            card_item = val[0] if isinstance(val, list) and val else val
            if isinstance(card_item, dict):
                atomic_lookup[k.strip().lower()] = card_item

edhrec_cache = {}
if os.path.exists(EDHREC_CACHE_FILE):
    with open(EDHREC_CACHE_FILE, "r", encoding="utf-8-sig") as f:
        edhrec_cache = json.load(f)

lands_data = {}
ALL_KNOWN_LAND_NAMES = set()

if os.path.exists(LANDS_FILE):
    with open(LANDS_FILE, "r", encoding="utf-8-sig") as f:
        lands_data = json.load(f)

    # Recursively extract every land name inside prefire-lands.json
    def extract_names(node):
        if isinstance(node, str):
            ALL_KNOWN_LAND_NAMES.add(node.strip().lower())
        elif isinstance(node, dict):
            for v in node.values():
                extract_names(v)
        elif isinstance(node, list):
            for item in node:
                extract_names(item)

    extract_names(lands_data)

# Hardcode extra baseline non-basic and basic lands
ALL_KNOWN_LAND_NAMES.update({
    "command tower", "evolving wilds", "terramorphic expanse", "ash barrens",
    "myriad landscape", "field of the dead", "fabled passage", "reliquary tower",
    "bojuka bog", "exotic orchard", "path of ancestry", "city of brass",
    "mana confluence", "reflecting pool", "rogue's passage", "ancient tomb",
    "strip mine", "wasteland", "ghost quarter", "tectonic edge", "arcane lighthouse",
    "homeward path", "scavenger grounds", "buried ruin", "inventors' fair",
    "phyrexian tower", "high market", "volrath's stronghold", "academy ruins",
    "hall of the bandit lord", "cavern of souls", "unclaimed territory", "wastes",
    "plains", "island", "swamp", "mountain", "forest",
    "snow-covered plains", "snow-covered island", "snow-covered swamp",
    "snow-covered mountain", "snow-covered forest"
})

# ----------------------------------------------------
# 1. ARCHETYPE PROPORTION BLUEPRINTS (Total non-lands = 99 - lands)
# ----------------------------------------------------
ARCHETYPE_TEMPLATES = {
    "aggro": {
        "lands": 34,
        "ramp": 8,
        "draw": 10,
        "removal": 8,
        "wipes": 2,
        "special": 8,
        "special_name": "Protection/Anthems",
        "special_keywords": ["protection", "anthem", "buff", "counter", "indestructible"],
        "max_combos": 0,
        "target_cmc": 2.8,
        "max_high_drops": 4
    },
    "midrange": {
        "lands": 36,
        "ramp": 10,
        "draw": 12,
        "removal": 10,
        "wipes": 3,
        "special": 6,
        "special_name": "Engine/Recursion",
        "special_keywords": ["recursion", "reanimate", "blink", "sacrifice engine", "graveyard"],
        "max_combos": 0,
        "target_cmc": 3.4,
        "max_high_drops": 8
    },
    "control": {
        "lands": 38,
        "ramp": 10,
        "draw": 12,
        "removal": 14,
        "wipes": 5,
        "special": 8,
        "special_name": "Pillowfort/Tax",
        "special_keywords": ["pillowfort", "tax", "stax", "fog", "counterspell"],
        "max_combos": 0,
        "target_cmc": 3.5,
        "max_high_drops": 7
    },
    "voltron": {
        "lands": 36,
        "ramp": 10,
        "draw": 10,
        "removal": 8,
        "wipes": 2,
        "special": 16,
        "special_name": "Equipment/Aura/Protection",
        "special_keywords": ["equipment", "aura", "protection", "hexproof", "unblockable", "evasion"],
        "max_combos": 0,
        "target_cmc": 3.1,
        "max_high_drops": 5
    },
    "big_mana": {
        "lands": 40,
        "ramp": 16,
        "draw": 12,
        "removal": 8,
        "wipes": 4,
        "special": 8,
        "special_name": "High-CMC Payoffs",
        "special_keywords": ["finisher", "bomb", "extra turn", "beater"],
        "max_combos": 0,
        "target_cmc": 4.1,
        "max_high_drops": 14
    },
    "combo": {
        "lands": 34,
        "ramp": 12,
        "draw": 14,
        "removal": 10,
        "wipes": 2,
        "special": 6,
        "special_name": "Combo Packages",
        "special_keywords": [],
        "max_combos": 2,
        "target_cmc": 3.0,
        "max_high_drops": 4
    }
}

THEME_ARCHETYPE_MAP = {
    "tokens": "aggro",
    "goblins": "aggro",
    "elves": "aggro",
    "dogs": "aggro",
    "dog": "aggro",
    "white weenie": "aggro",
    "aristocrats": "midrange",
    "blink": "midrange",
    "reanimator": "midrange",
    "merfolk": "midrange",
    "zombies": "midrange",
    "pillowfort": "control",
    "pillow-fort": "control",
    "stax": "control",
    "spellslinger": "control",
    "auras": "voltron",
    "equipment": "voltron",
    "enchantress": "voltron",
    "landfall": "big_mana",
    "sea monsters": "big_mana",
    "dragons": "big_mana",
    "combo": "combo",
    "storm": "combo"
}

def slugify(name):
    clean = re.sub(r"[^\w\s-]", "", name.lower())
    return re.sub(r"[\s_]+", "-", clean).strip("-")

def get_card(name):
    return rankings.get(name.strip().lower())

def resolve_commander(name):
    clean = name.strip().lower()

    comm_record = None
    if clean in rankings:
        comm_record = dict(rankings[clean])

    atomic_record = atomic_lookup.get(clean)

    if comm_record:
        if not comm_record.get("color_identity") and atomic_record:
            comm_record["color_identity"] = atomic_record.get("colorIdentity", [])
            comm_record["colors"] = atomic_record.get("colors", [])
        return comm_record

    if atomic_record:
        return {
            "name": atomic_record.get("name", name),
            "type_line": atomic_record.get("type", atomic_record.get("typeLine", "Legendary Creature")),
            "mana_cost": atomic_record.get("manaCost", ""),
            "colors": atomic_record.get("colors", []),
            "color_identity": atomic_record.get("colorIdentity", []),
            "composite_score": 0.0,
            "community_user_roles": [],
            "system_roles": []
        }

    print(f"Commander '{name}' could not be resolved.")
    return None

def get_card(name):
    clean = name.split("//")[0].strip().lower()
    card = rankings.get(clean)
    atomic = atomic_lookup.get(clean)

    if not card and atomic:
        card = {
            "name": atomic.get("name", name),
            "type_line": atomic.get("type", atomic.get("typeLine", "")),
            "mana_cost": atomic.get("manaCost", ""),
            "colors": atomic.get("colors", []),
            "color_identity": atomic.get("colorIdentity", []),
            "composite_score": 0.0,
            "community_user_roles": [],
            "system_roles": []
        }
    elif card and atomic:
        if not card.get("color_identity"):
            card["color_identity"] = atomic.get("colorIdentity", [])
        if not card.get("colors"):
            card["colors"] = atomic.get("colors", [])
        if not card.get("type_line"):
            card["type_line"] = atomic.get("type", atomic.get("typeLine", ""))
        if not card.get("mana_cost"):
            card["mana_cost"] = atomic.get("manaCost", "")
    return card

def is_color_legal(card_obj, commander_identity):
    if not card_obj:
        return False

    clean_name = card_obj.get("name", "").split("//")[0].strip().lower()
    atomic = atomic_lookup.get(clean_name, {})

    c_ident = set(card_obj.get("color_identity", []))
    if not c_ident and atomic:
        c_ident = set(atomic.get("colorIdentity", []))

    c_colors = set(card_obj.get("colors", []))
    if not c_colors and atomic:
        c_colors = set(atomic.get("colors", []))

    cost = card_obj.get("mana_cost", "") or atomic.get("manaCost", "")
    cost_pips = set(re.findall(r"\{?([WUBRG])\}?", cost))

    effective_colors = c_ident | c_colors | cost_pips
    if not effective_colors.issubset(set(commander_identity)):
        return False

    t_line = (card_obj.get("type_line", "") or atomic.get("type", "")).lower()
    if "land" in t_line:
        type_to_color = {
            "plains": "W",
            "island": "U",
            "swamp": "B",
            "mountain": "R",
            "forest": "G"
        }
        for b_type, col in type_to_color.items():
            if b_type in t_line and col not in commander_identity:
                return False

    return True

def get_commander_cached_synergies(commander_name):
    slug = slugify(commander_name)
    cached_list = edhrec_cache.get(slug, [])
    return set(c.strip().lower() for c in cached_list)

def score_card_for_deck(card, commander_cache_set, themes_clean, bucket_keywords=None):
    base_score = card.get("composite_score", 0.0)
    card_name_clean = card["name"].strip().lower()
    t_line = card.get("type_line", "").lower()
    roles = [r.lower() for r in card.get("community_user_roles", []) + card.get("system_roles", [])]

    edhrec_bonus = 60.0 if card_name_clean in commander_cache_set else 0.0

    theme_bonus = 0.0
    for t in themes_clean:
        if t in t_line or any(t in r for r in roles):
            theme_bonus += 30.0

    cross_role_bonus = 0.0
    if bucket_keywords:
        is_bucket = any(kw in r for r in roles for kw in bucket_keywords) or any(kw in t_line for kw in bucket_keywords)
        is_thematic = any(t in t_line or any(t in r for r in roles) for t in themes_clean)
        if is_bucket and is_thematic:
            cross_role_bonus = 80.0

    return base_score + edhrec_bonus + theme_bonus + cross_role_bonus

def find_best_combos(commander_name, commander_identity, max_combos=2):
    if not combo_variants or max_combos == 0:
        return []

    clean_comm = commander_name.strip().lower()
    valid_combos = []

    for v in combo_variants:
        uses = v.get("uses", [])
        piece_names = []
        for u in uses:
            cname = u.get("card", {}).get("name", "") if isinstance(u, dict) else str(u)
            piece_names.append(cname.split("//")[0].strip())

        pieces_data = [get_card(p) for p in piece_names]
        if any(p is None for p in pieces_data):
            continue

        if not all(is_color_legal(p, commander_identity) for p in pieces_data):
            continue

        if len(pieces_data) > 3:
            continue

        uses_commander = any(p.get("name", "").strip().lower() == clean_comm for p in pieces_data)
        avg_score = sum(p.get("composite_score", 0) for p in pieces_data) / len(pieces_data)
        priority = avg_score + (100.0 if uses_commander else 0.0)

        valid_combos.append({
            "pieces": [p.get("name") for p in pieces_data],
            "uses_commander": uses_commander,
            "priority": priority,
            "produces": [pr.get("name") for pr in v.get("produces", []) if isinstance(pr, dict) and pr.get("name")]
        })

    valid_combos.sort(key=lambda x: x["priority"], reverse=True)

    selected_combos = []
    seen_pieces = set()

    for c in valid_combos:
        if len(selected_combos) >= max_combos:
            break
        non_comm_pieces = [p for p in c["pieces"] if p.strip().lower() != clean_comm]
        if any(p in seen_pieces for p in non_comm_pieces):
            continue
        selected_combos.append(c)
        seen_pieces.update(non_comm_pieces)

    return selected_combos

def generate_mana_base(identity, target_count, themes_clean=None, deck_cards=None, archetype=None):
    if themes_clean is None:
        themes_clean = []
    if deck_cards is None:
        deck_cards = []

    c_set = set(identity)
    num_colors = len(c_set)
    selected_lands = {}

    # Detect snow requirement across non-land cards or active themes
    requires_snow = False
    if "snow" in themes_clean:
        requires_snow = True
    else:
        for cname in deck_cards:
            card_obj = get_card(cname)
            if not card_obj:
                continue
            o_text = card_obj.get("oracle_text", "").lower()
            name_clean = card_obj.get("name", "").lower()

            # Checks for snow mana symbol, explicit snow permanent references, or Extraplanar Lens
            if "{s}" in o_text or "snow-covered" in o_text or "snow land" in o_text or "snow permanent" in o_text:
                requires_snow = True
                break
            if name_clean in {"extraplanar lens", "sunstone", "scrying sheets", "glacial crevasses", "skred", "into the north"}:
                requires_snow = True
                break

    prefix = "Snow-Covered " if requires_snow else ""
    basic_names = {
        "W": f"{prefix}Plains",
        "U": f"{prefix}Island",
        "B": f"{prefix}Swamp",
        "R": f"{prefix}Mountain",
        "G": f"{prefix}Forest"
    }

    # Strict mono-color gated lands
    MONO_ONLY_LANDS = {
        "nykthos, shrine to nyx",
        "valakut, the molten pinnacle",
        "cabal coffers",
        "emeria, the sky ruin"
    }

    # Combat lands unsuitable for Control / Pillowfort
    ATTACK_ONLY_LANDS = {
        "slayers' stronghold",
        "sunhome, fortress of the legion",
        "hanweir battlements",
        "flamekin village",
        "kessig wolf run",
        "rogue's passage",
        "windbrisk heights"
    }

    num_artifacts = sum(1 for cname in deck_cards if get_card(cname) and "artifact" in get_card(cname).get("type_line", "").lower())
    num_creatures = sum(1 for cname in deck_cards if get_card(cname) and "creature" in get_card(cname).get("type_line", "").lower())

    # Reserve basic land floors
    if num_colors == 0:
        total_reserved_basics = 0
    elif num_colors == 1:
        total_reserved_basics = 16
    elif num_colors == 2:
        total_reserved_basics = 8
    elif num_colors == 3:
        total_reserved_basics = 6
    else:
        total_reserved_basics = num_colors

    max_nonbasics = target_count - total_reserved_basics

    def add_land(card_name, category):
        if not card_name or card_name in selected_lands:
            return False
        if len(selected_lands) >= max_nonbasics:
            return False

        clean_name = card_name.strip().lower()

        # 1. Mono gate
        if clean_name in MONO_ONLY_LANDS and num_colors > 1:
            return False

        # 2. Combat gate for defensive archetypes
        if clean_name in ATTACK_ONLY_LANDS and (archetype == "control" or "pillowfort" in themes_clean):
            return False

        # 3. Card-type minimum thresholds
        if clean_name == "academy ruins" and num_artifacts < 8 and "artifacts" not in themes_clean:
            return False
        if clean_name == "volrath's stronghold" and num_creatures < 15 and "reanimator" not in themes_clean:
            return False

        selected_lands[card_name] = category
        return True

    # 1. Multi-color Fixers
    if num_colors >= 2:
        fixers = lands_data.get("fixers", {})
        add_land(fixers.get("command_tower", "Command Tower"), "Fixer")
        add_land(fixers.get("city_of_brass", "City of Brass"), "Fixer")
        add_land(fixers.get("mana_confluence", "Mana Confluence"), "Fixer")
        add_land(fixers.get("reflecting_pool", "Reflecting Pool"), "Fixer")
        if num_colors >= 3:
            add_land(fixers.get("exotic_orchard", "Exotic Orchard"), "Fixer")

    # 2. Tri-Lands
    if num_colors == 3:
        tri_lands = lands_data.get("tri_lands", {})
        for tri_key, tri_name in tri_lands.items():
            if set(tri_key) == c_set:
                add_land(tri_name, "Tri-Land")

    # 3. Dual Lands
    duals_dict = lands_data.get("duals", {})
    all_pairs = []
    id_list = list(identity)
    for i in range(len(id_list)):
        for j in range(i + 1, len(id_list)):
            pair_a = f"{id_list[i]}{id_list[j]}"
            pair_b = f"{id_list[j]}{id_list[i]}"
            matching_key = pair_a if pair_a in duals_dict else (pair_b if pair_b in duals_dict else None)
            if matching_key:
                all_pairs.append(matching_key)

    # Standard dual cycles
    cycles_order = ["fetch", "shock", "abur", "check", "pain", "filter"]
    for cycle in cycles_order:
        for pair in all_pairs:
            land_name = duals_dict[pair].get(cycle)
            if land_name:
                add_land(land_name, f"Dual ({cycle.upper()})")

    # For 2-color decks, reach deeper into tapped duals / temples / bounce lands if available
    if num_colors == 2:
        secondary_cycles = ["temple", "bounce", "manland", "fast", "tangle"]
        for cycle in secondary_cycles:
            for pair in all_pairs:
                land_name = duals_dict[pair].get(cycle)
                if land_name:
                    add_land(land_name, f"Dual ({cycle.capitalize()})")

    # 4. Guild Utility Lands (2 to 3 colors)
    if 2 <= num_colors <= 3:
        guild_util = lands_data.get("utility", {}).get("guild_utility", {})
        for pair in all_pairs:
            for u_land in guild_util.get(pair, []):
                add_land(u_land, "Guild Utility")

    # 5. Theme-Specific Utility Lands
    theme_util = lands_data.get("utility", {}).get("theme_specific", {})
    for t in themes_clean:
        for u_land in theme_util.get(t, []):
            card_obj = get_card(u_land)
            if not card_obj or is_color_legal(card_obj, identity):
                add_land(u_land, "Theme Utility Land")

    # 6. Colored Staples
    colored_staples = lands_data.get("utility", {}).get("colored_staples", {})
    for c in identity:
        for u_land in colored_staples.get(c, []):
            add_land(u_land, "Colored Utility Land")

    # 7. Generic Colorless Utility (Cap at 2 for 3+ colors, 4 for 1-2 colors)
    max_colorless = 2 if num_colors >= 3 else 4
    generic_colorless = lands_data.get("utility", {}).get("generic_colorless", [])
    colorless_added = 0
    for u_item in generic_colorless:
        if colorless_added >= max_colorless:
            break
        u_name = u_item["name"] if isinstance(u_item, dict) else u_item
        if add_land(u_name, "Utility Land"):
            colorless_added += 1

    # 8. Basics to fill remaining quota (Weighted by colored mana pips)
    remaining_slots = target_count - len(selected_lands)
    if remaining_slots > 0:
        category_name = "Snow Basic Land" if requires_snow else "Basic Land"

        if num_colors == 0:
            selected_lands["Wastes"] = f"Basic Land (x{remaining_slots})"
        else:
            pip_counts = {c: 0 for c in identity}
            total_pips = 0

            # Count colored mana pips across all chosen non-land spells
            for cname in deck_cards:
                card_obj = get_card(cname)
                if not card_obj:
                    continue
                mana_cost = card_obj.get("mana_cost", "")
                matches = re.findall(r"\{([WUBRG])\}", mana_cost)
                for color in matches:
                    if color in pip_counts:
                        pip_counts[color] += 1
                        total_pips += 1

            # Fallback to even split if deck has no colored pips (e.g., all colorless spells)
            if total_pips == 0:
                per_color = remaining_slots // num_colors
                remainder = remaining_slots % num_colors
                for idx, c in enumerate(identity):
                    b_count = per_color + (1 if idx < remainder else 0)
                    if b_count > 0:
                        b_name = basic_names.get(c, f"{prefix}Plains")
                        selected_lands[f"{b_name} (x{b_count})"] = category_name
            else:
                allocations = {}
                allocated = 0

                # Ensure at least 1 basic per color as long as slots permit
                for c in identity:
                    pips = pip_counts[c]
                    share = (pips / total_pips) * remaining_slots
                    count = max(1, round(share)) if remaining_slots >= num_colors else (1 if pips > 0 else 0)
                    allocations[c] = count
                    allocated += count

                # Reconcile rounding differences to hit the exact target
                diff = remaining_slots - allocated
                primary_color = max(identity, key=lambda c: pip_counts[c])
                allocations[primary_color] = max(1, allocations[primary_color] + diff)

                for c in identity:
                    count = allocations[c]
                    if count > 0:
                        b_name = basic_names.get(c, f"{prefix}Plains")
                        selected_lands[f"{b_name} (x{count})"] = category_name

    return selected_lands

def build_deck(commander_name, commander_b=None, archetype=None, themes=None):
    if themes is None:
        themes = []

    clean_comm_a = commander_name.strip().lower()
    comm_data_a = resolve_commander(commander_name)
    if not comm_data_a:
        print(f"Commander '{commander_name}' not found.")
        return

    clean_comm_b = commander_b.strip().lower() if commander_b else None
    comm_data_b = resolve_commander(commander_b) if commander_b else None
    if commander_b and not comm_data_b:
        print(f"Partner Commander '{commander_b}' not found.")
        return

    # Combined color identity
    identity_set = set(comm_data_a.get("color_identity", []))
    if comm_data_b:
        identity_set.update(comm_data_b.get("color_identity", []))
    identity = sorted(list(identity_set))

    commander_count = 2 if commander_b else 1
    theme_clean = [t.strip().lower() for t in themes]
    
    comm_cache_pool = get_commander_cached_synergies(commander_name)
    if commander_b:
        comm_cache_pool.update(get_commander_cached_synergies(commander_b))

    selected_arch = None
    if archetype and archetype.lower() in ARCHETYPE_TEMPLATES:
        selected_arch = archetype.lower()
    else:
        for t in theme_clean:
            if t in THEME_ARCHETYPE_MAP:
                selected_arch = THEME_ARCHETYPE_MAP[t]
                break
        if not selected_arch:
            selected_arch = "midrange"

    config = ARCHETYPE_TEMPLATES[selected_arch]
    target_spells = 100 - commander_count - config["lands"]

    header_names = f"{comm_data_a['name']} // {comm_data_b['name']}" if comm_data_b else comm_data_a['name']
    print("=" * 65)
    print(f"COMMANDER: {header_names} (Identity: {identity})")
    print(f"ARCHETYPE: {selected_arch.upper()} | THEMES: {theme_clean if theme_clean else ['None']}")
    print(f"TARGET RATIOS: Lands: {config['lands']} | Spells: {target_spells}")
    print(f"               Ramp: {config['ramp']} | Draw: {config['draw']} | Removal: {config['removal']} | Wipes: {config['wipes']} | {config['special_name']}: {config['special']}")
    print("=" * 65)

    deck_list = {}

    # Exclude commanders from deck candidate pool
    commander_names_set = {clean_comm_a}
    if clean_comm_b:
        commander_names_set.add(clean_comm_b)

    if config["max_combos"] > 0:
        combos = find_best_combos(commander_name, identity, max_combos=config["max_combos"])
        for idx, c in enumerate(combos, 1):
            for piece in c["pieces"]:
                if piece.strip().lower() not in commander_names_set:
                    deck_list[piece] = "Combo Package"

    def is_land_card(card_obj):
        clean = card_obj.get("name", "").split("//")[0].strip().lower()
        atomic = atomic_lookup.get(clean, {})
        t_line = (card_obj.get("type_line", "") or atomic.get("type", "") or atomic.get("typeLine", "")).lower()
        return "land" in t_line

    def is_land_card(card_obj):
        clean = card_obj.get("name", "").split("//")[0].strip().lower()
        if clean in ALL_KNOWN_LAND_NAMES:
            return True
        atomic = atomic_lookup.get(clean, {})
        t_line = (
            card_obj.get("type_line", "")
            or atomic.get("type", "")
            or atomic.get("typeLine", "")
        ).lower()
        if "land" in t_line:
            return True
        o_text = (card_obj.get("oracle_text", "") or atomic.get("text", "")).lower()
        if not t_line and ("enters the battlefield" in o_text or "{t}: add" in o_text):
            return True
        return False

    legal_candidates = [
        c for c in rankings.values()
        if c["name"].strip().lower() not in commander_names_set
        and not is_land_card(c)
        and is_color_legal(c, identity)
        and c["name"].split("//")[0].strip() not in deck_list
    ]

    def card_matches_role(card, target_role, explicit_keywords):
        all_roles = [r.lower() for r in card.get("community_user_roles", []) + card.get("system_roles", [])]
        t_line = card.get("type_line", "").lower()
        o_text = card.get("oracle_text", "").lower()

        if any(kw in r for r in all_roles for kw in explicit_keywords):
            return True
        if any(kw in t_line for kw in explicit_keywords):
            return True

        if target_role == "Card Draw":
            return "draw a card" in o_text or "draw cards" in o_text or "draws a card" in o_text

        if target_role == "Ramp":
            if "land" in t_line:
                return False
            return (
                "search your library for a land" in o_text or
                "search your library for a basic land" in o_text or
                "put a land card from your hand onto the battlefield" in o_text or
                ("artifact" in t_line and ("add {" in o_text or "add one mana" in o_text or "adds one mana" in o_text)) or
                ("creature" in t_line and ("add {" in o_text or "add one mana" in o_text))
            )

        if target_role == "Targeted Removal":
            if "destroy all" in o_text or "exile all" in o_text:
                return False
            return (
                "destroy target" in o_text or
                "exile target" in o_text or
                "return target" in o_text or
                "target creature gets -" in o_text or
                "deals damage to target" in o_text
            )

        if target_role == "Board Wipe":
            return (
                "destroy all" in o_text or
                "exile all" in o_text or
                "all creatures get -" in o_text or
                "each creature gets -" in o_text or
                "deals damage to each creature" in o_text
            )

        if target_role == "Protection/Anthems":
            return (
                "indestructible" in o_text or
                "hexproof" in o_text or
                "shroud" in o_text or
                "creatures you control get +" in o_text or
                "protection from" in o_text
            )

        if target_role == "Pillowfort/Tax":
            return (
                "can't attack you" in o_text or
                "attacks you or a planeswalker you control" in o_text or
                "attacks you, unless" in o_text or
                "spells cost {" in o_text or
                "spells your opponents cast cost" in o_text
            )

        return False

    def fill_slot_bucket(label, keywords, quota):
        added = 0
        bucket_candidates = []
        for card in legal_candidates:
            if card["name"] in deck_list:
                continue

            if card_matches_role(card, label, keywords):
                score = score_card_for_deck(card, comm_cache_pool, theme_clean, bucket_keywords=keywords)
                bucket_candidates.append((score, card))

        bucket_candidates.sort(key=lambda x: x[0], reverse=True)

        for _, card in bucket_candidates:
            if added >= quota:
                break
            clean_display_name = card["name"].split("//")[0].strip()
            deck_list[clean_display_name] = label
            added += 1

    fill_slot_bucket("Ramp", ["ramp", "mana rock", "acceleration"], config["ramp"])
    fill_slot_bucket("Card Draw", ["card draw", "draw engine", "draw"], config["draw"])
    fill_slot_bucket("Targeted Removal", ["removal", "spot removal", "targeted removal"], config["removal"])
    fill_slot_bucket("Board Wipe", ["board wipe", "sweeper", "wrath"], config["wipes"])

    if config["special_keywords"]:
        fill_slot_bucket(config["special_name"], config["special_keywords"], config["special"])

    def get_card_cmc(card_dict):
        cost = card_dict.get("mana_cost", "")
        if not cost:
            return 0.0
        generic = re.search(r"\{(\d+)\}", cost)
        val = int(generic.group(1)) if generic else 0
        symbols = re.findall(r"\{[WUBRGCXYZSP\d/]+\}", cost)
        for s in symbols:
            if not re.match(r"^\{\d+\}$", s):
                val += 1
        return float(val)

    # 3. FILL ARCHETYPE / THEME SYNERGY SLOTS (With Curve Smoothing)
    theme_candidates = []
    for card in legal_candidates:
        if card["name"] in deck_list:
            continue
        all_roles = [r.lower() for r in card.get("community_user_roles", []) + card.get("system_roles", [])]
        t_line = card.get("type_line", "").lower()
        o_text = card.get("oracle_text", "").lower()
        is_thematic = any(t in t_line or t in o_text or any(t in r for r in all_roles) for t in theme_clean)
        is_cached = card["name"].strip().lower() in comm_cache_pool

        if is_thematic or is_cached:
            base_score = score_card_for_deck(card, comm_cache_pool, theme_clean)
            cmc = get_card_cmc(card)

            cur_cmc = sum(get_card_cmc(get_card(c)) for c in deck_list if get_card(c)) / max(len(deck_list), 1)
            penalty = 0.0
            if cmc >= 5 and cur_cmc > config["target_cmc"]:
                penalty = (cmc - 4) * 25.0
            elif cmc <= 3 and cur_cmc > config["target_cmc"]:
                penalty = -10.0

            theme_candidates.append((base_score - penalty, cmc, card))

    theme_candidates.sort(key=lambda x: x[0], reverse=True)
    target_theme_limit = target_spells - max(0, int(target_spells * 0.15))
    high_drop_count = sum(1 for c in deck_list if get_card(c) and get_card_cmc(get_card(c)) >= 6)

    for _, cmc, card in theme_candidates:
        if len(deck_list) >= target_theme_limit:
            break
        if cmc >= 6 and high_drop_count >= config["max_high_drops"]:
            continue
        clean_display_name = card["name"].split("//")[0].strip()
        deck_list[clean_display_name] = "Theme Synergy"
        if cmc >= 6:
            high_drop_count += 1

    # 4. FILL REMAINING SLOTS WITH FORMAT STAPLES (With Curve Smoothing)
    staple_candidates = []
    for card in legal_candidates:
        if card["name"] in deck_list:
            continue
        cmc = get_card_cmc(card)
        cur_cmc = sum(get_card_cmc(get_card(c)) for c in deck_list if get_card(c)) / max(len(deck_list), 1)
        penalty = 0.0
        if cmc >= 5 and cur_cmc > config["target_cmc"]:
            penalty = (cmc - 4) * 25.0
        elif cmc <= 3 and cur_cmc > config["target_cmc"]:
            penalty = -10.0

        score = card.get("composite_score", 0.0) - penalty
        staple_candidates.append((score, cmc, card))

    staple_candidates.sort(key=lambda x: x[0], reverse=True)

    for _, cmc, card in staple_candidates:
        if len(deck_list) >= target_spells:
            break
        if cmc >= 6 and high_drop_count >= config["max_high_drops"]:
            continue
        clean_display_name = card["name"].split("//")[0].strip()
        deck_list[clean_display_name] = "Format Staple"
        if cmc >= 6:
            high_drop_count += 1

    mana_base = generate_mana_base(
        identity=identity,
        target_count=config["lands"],
        themes_clean=theme_clean,
        deck_cards=list(deck_list.keys()),
        archetype=selected_arch
    )

    total_cards = len(deck_list) + config["lands"] + commander_count
    cmdr_label = f"{commander_count} Commanders" if commander_count == 2 else "1 Commander"
    print(f"\nFinal Deck Roster: {len(deck_list)} Spells + {config['lands']} Lands + {cmdr_label} = {total_cards} Cards")

    role_counts = defaultdict(int)
    for role in deck_list.values():
        role_counts[role] += 1

    print("\n--- Non-land Spell Breakdown ---")
    for r, count in sorted(role_counts.items(), key=lambda x: x[1], reverse=True):
        print(f"  - {r}: {count} cards")

    print(f"\n--- Mana-Base ({len(mana_base)} distinct land entries for {config['lands']} total slots) ---")
    for land, cat in mana_base.items():
        print(f"  [{cat}] {land}")

    # Standard export formatting (Moxfield / Archidekt / MTGO compatible)
    export_lines = []
    export_lines.append("// Commander")
    export_lines.append(f"1 {comm_data_a['name']}")
    if comm_data_b:
        export_lines.append(f"1 {comm_data_b['name']}")
    export_lines.append("")

    export_lines.append(f"// Non-land Spells ({len(deck_list)})")
    for card_name in sorted(deck_list.keys()):
        export_lines.append(f"1 {card_name}")
    export_lines.append("")

    export_lines.append(f"// Lands ({config['lands']})")
    for land_entry in mana_base.keys():
        match = re.match(r"^(.*?)\s*\(x(\d+)\)$", land_entry)
        if match:
            b_name, b_qty = match.groups()
            export_lines.append(f"{b_qty} {b_name}")
        else:
            export_lines.append(f"1 {land_entry}")

    out_dir = "exports"
    os.makedirs(out_dir, exist_ok=True)
    filename = slugify(header_names) + ".txt"
    out_path = os.path.join(out_dir, filename)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(export_lines))

    print(f"\n[Export] Full decklist written to: {out_path}")

if __name__ == "__main__":
    # Test 2-Commander Partner Pair (Kraum + Tymna = 4-Color Midrange)
    build_deck("Kraum, Ludevic's Opus", commander_b="Tymna the Weaver", archetype="midrange")
   