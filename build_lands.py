import json
import os
import re

OUTPUT_PATH = "prefire-lands.json"
CARDS_PATH = "oracle-cards-20261008090159.jsonl"
PREFIRE_PATH = "prefire-names.json"
THEMES_PATH = "all-detected-themes.json"

# 1. Load Pre-FIRE sets & detected themes
print("Loading reference datasets...")
with open(PREFIRE_PATH, "r", encoding="utf-8") as f:
    raw = json.load(f)
    prefire_names = set(raw if isinstance(raw, list) else raw.keys())

with open(THEMES_PATH, "r", encoding="utf-8") as f:
    detected_themes = json.load(f)

# 2. Dual Cycles, Tri-Lands, and Universal Fixers
DUAL_CYCLES = {
    "WU": {"fetch": "Flooded Strand", "shock": "Hallowed Fountain", "check": "Glacial Fortress", "pain": "Adarkar Wastes", "filter": "Mystic Gate", "abur": "Tundra"},
    "UB": {"fetch": "Polluted Delta", "shock": "Watery Grave", "check": "Drowned Catacomb", "pain": "Underground River", "filter": "Sunken Ruins", "abur": "Underground Sea"},
    "BR": {"fetch": "Bloodstained Mire", "shock": "Blood Crypt", "check": "Dragonskull Summit", "pain": "Sulfurous Springs", "filter": "Graven Cairns", "abur": "Badlands"},
    "RG": {"fetch": "Wooded Foothills", "shock": "Stomping Ground", "check": "Rootbound Crag", "pain": "Karplusan Forest", "filter": "Fire-Lit Thicket", "abur": "Taiga"},
    "GW": {"fetch": "Windswept Heath", "shock": "Temple Garden", "check": "Sunpetal Grove", "pain": "Brushland", "filter": "Wooded Bastion", "abur": "Savannah"},
    "WB": {"fetch": "Marsh Flats", "shock": "Godless Shrine", "check": "Isolated Chapel", "pain": "Caves of Koilos", "filter": "Fetid Heath", "abur": "Scrubland"},
    "UR": {"fetch": "Scalding Tarn", "shock": "Steam Vents", "check": "Sulfur Falls", "pain": "Shivan Reef", "filter": "Cascade Bluffs", "abur": "Volcanic Island"},
    "BG": {"fetch": "Verdant Catacombs", "shock": "Overgrown Tomb", "check": "Woodland Cemetery", "pain": "Llanowar Wastes", "filter": "Twilight Mire", "abur": "Bayou"},
    "WR": {"fetch": "Arid Mesa", "shock": "Sacred Foundry", "check": "Clifftop Retreat", "pain": "Battlefield Forge", "filter": "Rugged Prairie", "abur": "Plateau"},
    "UG": {"fetch": "Misty Rainforest", "shock": "Breeding Pool", "check": "Hinterland Harbor", "pain": "Yavimaya Coast", "filter": "Flooded Grove", "abur": "Tropical Island"}
}

TRI_LANDS = {
    "WUB": "Arcane Sanctum", "UBR": "Crumbling Necropolis", "BRG": "Savage Lands",
    "RGW": "Jungle Shrine", "GWU": "Seaside Citadel", "WBG": "Sandsteppe Citadel",
    "URW": "Mystic Monastery", "BGU": "Opulent Palace", "WRB": "Nomad Outpost",
    "UGR": "Frontier Bivouac"
}

FIXERS = {
    "command_tower": "Command Tower",
    "city_of_brass": "City of Brass",
    "mana_confluence": "Mana Confluence",
    "exotic_orchard": "Exotic Orchard",
    "reflecting_pool": "Reflecting Pool"
}

# 3. Scan Oracle Cards for Legal Utility Lands
print("Extracting Pre-FIRE lands and text definitions...")
lands_meta = {}

with open(CARDS_PATH, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        c = json.loads(line)
        name = c.get("name")
        type_line = c.get("type_line", "")

        if name in prefire_names and "Land" in type_line and name not in lands_meta:
            lands_meta[name] = {
                "text": c.get("oracle_text", ""),
                "type": type_line,
                "colors": c.get("color_identity", []),
                "rank": c.get("edhrec_rank", 999999)
            }

# 4. Static Format Anchors
generic_colorless = [
    {"name": "Command Beacon", "role": "commander_tax"},
    {"name": "Ancient Tomb", "role": "ramp"},
    {"name": "Strip Mine", "role": "land_destruction"},
    {"name": "Scavenger Grounds", "role": "graveyard_hate"},
    {"name": "Reliquary Tower", "role": "hand_size"},
    {"name": "Homeward Path", "role": "anti_theft"},
    {"name": "Ghost Quarter", "role": "land_destruction"},
    {"name": "Rogue's Passage", "role": "evasion"},
    {"name": "High Market", "role": "sacrifice"},
    {"name": "Arcane Lighthouse", "role": "anti_hexproof"},
    {"name": "Arch of Orazca", "role": "draw"},
    {"name": "Winding Canyons", "role": "flash"},
    {"name": "Terrain Generator", "role": "ramp"}
]

colored_staples = {
    "W": ["Mistveil Plains", "Windbrisk Heights", "Kor Haven", "Emeria, the Sky Ruin", "Nykthos, Shrine to Nyx"],
    "U": ["Tolaria West", "Academy Ruins", "Cephalid Coliseum", "Minamo, School at Water's Edge", "Nykthos, Shrine to Nyx"],
    "B": ["Bojuka Bog", "Urborg, Tomb of Yawgmoth", "Cabal Coffers", "Volrath's Stronghold", "Phyrexian Tower", "Nykthos, Shrine to Nyx"],
    "R": ["Valakut, the Molten Pinnacle", "Hanweir Battlements", "Kher Keep", "Flamekin Village", "Nykthos, Shrine to Nyx"],
    "G": ["Boseiju, Who Shelters All", "Gaea's Cradle", "Dryad Arbor", "Mosswort Bridge", "Yavimaya Hollow", "Nykthos, Shrine to Nyx"]
}

guild_utility = {
    "RG": ["Kessig Wolf Run"],
    "GW": ["Gavony Township"],
    "WB": ["Vault of the Archangel"],
    "UR": ["Desolate Lighthouse"],
    "UG": ["Alchemist's Refuge"],
    "WR": ["Slayers' Stronghold", "Sunhome, Fortress of the Legion"],
    "BG": ["Grim Backwoods"]
}

# 5. Automatically Link Utility Lands to Detected Themes
print("Matching lands to all detected themes...")
theme_specific = {}

# Comprehensive Pre-FIRE creature types mapped to singular form for regex
KNOWN_TRIBES = {
    "zombies": "Zombie", "goblins": "Goblin", "elves": "Elf", "merfolk": "Merfolk",
    "wizards": "Wizard", "dragons": "Dragon", "vampires": "Vampire", "slivers": "Sliver",
    "eldrazi": "Eldrazi", "soldiers": "Soldier", "rogues": "Rogue", "knights": "Knight",
    "clerics": "Cleric", "spirits": "Spirit", "warriors": "Warrior", "dinosaurs": "Dinosaur",
    "pirates": "Pirate", "cats": "Cat", "angels": "Angel", "demons": "Demon",
    "giants": "Giant", "beasts": "Beast", "insects": "Insect", "birds": "Bird",
    "rats": "Rat", "elementals": "Elemental", "shamans": "Shaman", "drakes": "Drake",
    "faeries": "Faerie", "humans": "Human", "allies": "Ally", "gorgons": "Gorgon"
}

UNIVERSAL_TRIBAL_LANDS = ["Cavern of Souls", "Path of Ancestry", "Unclaimed Territory", "Mutavault"]

for slug in detected_themes.keys():
    theme_lands = set()

    # A. Check Tribal themes
    if slug in KNOWN_TRIBES:
        t_singular = KNOWN_TRIBES[slug]
        for staple in UNIVERSAL_TRIBAL_LANDS:
            if staple in lands_meta:
                theme_lands.add(staple)
        for l_name, l_info in lands_meta.items():
            if re.search(rf"\b{t_singular}\b", l_info["text"], re.I):
                theme_lands.add(l_name)

    # B. Check Mechanical themes via text matching
    elif slug in ["counters", "+1/+1-counters", "proliferate"]:
        for l_name, l_info in lands_meta.items():
            if "+1/+1 counter" in l_info["text"]:
                theme_lands.add(l_name)

    elif slug in ["graveyard", "reanimator", "self-mill", "dredge"]:
        for l_name, l_info in lands_meta.items():
            if any(term in l_info["text"].lower() for term in ["graveyard", "dredge"]):
                if l_name not in ["Blighted Cataract", "Haunted Fengraf"]:
                    theme_lands.add(l_name)

    elif slug in ["sacrifice", "aristocrats"]:
        for l_name, l_info in lands_meta.items():
            if re.search(r"sacrifice a(nother)? creature", l_info["text"], re.I):
                theme_lands.add(l_name)

    elif slug in ["artifacts", "equipment", "cheerios"]:
        for l_name, l_info in lands_meta.items():
            if any(term in l_info["text"].lower() for term in ["artifact", "equipment", "metalcraft"]):
                theme_lands.add(l_name)

    elif slug in ["enchantress", "auras"]:
        for l_name, l_info in lands_meta.items():
            if "enchantment" in l_info["text"].lower() or "aura" in l_info["text"].lower():
                theme_lands.add(l_name)

    elif slug in ["lands", "landfall"]:
        for l_name, l_info in lands_meta.items():
            if any(term in l_info["text"].lower() for term in ["landfall", "extra land", "play an additional land"]):
                theme_lands.add(l_name)
        theme_lands.update(["Thespian's Stage", "Dark Depths", "Glacial Chasm", "Petrified Field", "Dust Bowl"])

    elif slug in ["infect"]:
        for l_name, l_info in lands_meta.items():
            if "infect" in l_info["text"].lower() or "poison" in l_info["text"].lower():
                theme_lands.add(l_name)

    elif slug in ["cycling"]:
        for l_name, l_info in lands_meta.items():
            if "cycling" in l_info["text"].lower():
                theme_lands.add(l_name)

    # C. Extended Archetypes & Strategy Matches
    elif slug in ["voltron", "equipment"]:
        theme_lands.update(["Rogue's Passage", "Sunhome, Fortress of the Legion", "Slayers' Stronghold", "Hall of the Bandit Lord", "Cathedral of War", "Kessig Wolf Run"])

    elif slug in ["tokens", "go-wide"]:
        theme_lands.update(["Gavony Township", "Kher Keep", "Westvale Abbey", "Windbrisk Heights", "Vitu-Ghazi, the City-Tree"])

    elif slug in ["spellslinger", "storm", "cantrip"]:
        theme_lands.update(["Boseiju, Who Shelters All", "Desolate Lighthouse", "Alchemist's Refuge", "Geier Reach Sanitarium"])

    elif slug in ["lifegain"]:
        theme_lands.update(["Vault of the Archangel", "High Market", "Serra's Sanctum", "Kabira Crossroads"])

    elif slug in ["stax", "pillowfort"]:
        theme_lands.update(["Strip Mine", "Wasteland", "Dust Bowl", "Glacial Chasm", "Maze of Ith", "Kor Haven", "Ghost Quarter"])

    elif slug in ["wheels", "draw"]:
        theme_lands.update(["Geier Reach Sanitarium", "Mikokoro, Center of the Sea", "Reliquary Tower"])

    elif slug in ["flash"]:
        theme_lands.update(["Alchemist's Refuge", "Winding Canyons"])

    elif slug in ["theft"]:
        theme_lands.update(["Homeward Path", "High Market", "Phyrexian Tower"])

    elif slug in ["extra-turns"]:
        theme_lands.update(["Boseiju, Who Shelters All", "Alchemist's Refuge", "Reliquary Tower", "Ancient Tomb"])

    elif slug in ["group-hug"]:
        theme_lands.update(["Mikokoro, Center of the Sea", "Geier Reach Sanitarium", "Forbidden Orchard", "Homeward Path"])

    elif slug in ["chaos"]:
        theme_lands.update(["Desolate Lighthouse", "High Market", "Homeward Path"])

    # Filter down to valid Pre-FIRE names and sort by EDHREC popularity rank
    valid_theme_lands = [name for name in theme_lands if name in lands_meta]
    if valid_theme_lands:
        sorted_theme_lands = sorted(
            valid_theme_lands,
            key=lambda x: lands_meta[x]["rank"]
        )
        theme_specific[slug] = sorted_theme_lands[:6]

# 6. Build Final Payload
payload = {
    "duals": DUAL_CYCLES,
    "tri_lands": TRI_LANDS,
    "fixers": FIXERS,
    "utility": {
        "generic_colorless": generic_colorless,
        "colored_staples": colored_staples,
        "guild_utility": guild_utility,
        "theme_specific": theme_specific
    }
}

print(f"Saving compiled catalog to {OUTPUT_PATH}...")
with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(payload, f, separators=(',', ':'))

print(f"Done. Successfully generated {OUTPUT_PATH} covering {len(theme_specific)} dynamic themes.")