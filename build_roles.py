import json
import os
import re

# File paths
PREFIRE_PATH = "prefire-names.json"
CARDS_PATH = "oracle-cards-20261008090159.jsonl"
TAGS_PATH = "oracle-tags-20261008090035.jsonl"
OUTPUT_PATH = "card-roles.json"

# Define tag slugs that correspond to functional roles
TAG_CATEGORIES = {
    "ramp": {
        "ramp", "mana-rock", "mana-dork", "mana-acceleration", 
        "land-ramp", "mana-producer", "search-land"
    },
    "removal_creature": {
        "removal-creature", "spot-removal-creature", "destroy-creature", 
        "exile-creature", "bounce-creature"
    },
    "removal_noncreature": {
        "removal-artifact", "removal-enchantment", "removal-planeswalker", 
        "disenchant", "naturalize", "shatter"
    },
    "board_wipe": {
        "board-wipe", "wrath", "mass-removal", "board-wipe-creature", 
        "board-wipe-artifact", "board-wipe-enchantment"
    },
    "draw": {
        "draw", "card-advantage", "cantrip", "recurring-draw", "wheel"
    }
}

# 1. Load Pre-FIRE valid names
print("Loading prefire-names.json...")
with open(PREFIRE_PATH, "r", encoding="utf-8") as f:
    prefire_data = json.load(f)

# Handle both array format and dictionary format
if isinstance(prefire_data, list):
    prefire_names = set(prefire_data)
elif isinstance(prefire_data, dict):
    prefire_names = set(prefire_data.keys())
else:
    raise ValueError("Unexpected structure in prefire-names.json")

print(f"Loaded {len(prefire_names)} legal Pre-FIRE card names.")

# 2. Map oracle_id -> clean card name
print("Scanning cards to map oracle_ids...")
oracle_to_name = {}
prefire_cards_meta = {}

with open(CARDS_PATH, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        card = json.loads(line)
        name = card.get("name")
        oracle_id = card.get("oracle_id")

        if name in prefire_names and oracle_id:
            oracle_to_name[oracle_id] = name
            # Store CMC and text for fallback tagging
            if name not in prefire_cards_meta:
                prefire_cards_meta[name] = {
                    "cmc": card.get("cmc", 0),
                    "type": card.get("type_line", ""),
                    "text": card.get("oracle_text", "")
                }

print(f"Mapped {len(oracle_to_name)} Pre-FIRE card IDs.")

# 3. Process Tagger Oracle Tags
print("Reading tags and matching roles...")
card_roles = {name: set() for name in prefire_cards_meta.keys()}

with open(TAGS_PATH, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        tag_obj = json.loads(line)
        slug = tag_obj.get("slug", "").lower()
        taggings = tag_obj.get("taggings", [])

        # Check which role(s) this slug maps to
        matched_roles = []
        for role_name, slugs in TAG_CATEGORIES.items():
            if slug in slugs:
                matched_roles.append(role_name)

        if not matched_roles or not taggings:
            continue

        for tagging in taggings:
            o_id = tagging.get("oracle_id")
            if o_id in oracle_to_name:
                card_name = oracle_to_name[o_id]
                for role in matched_roles:
                    card_roles[card_name].add(role)

# 4. Fallback Oracle Text Check (catches older staples missing community tags)
print("Applying fallback rule sweeps for untagged staples...")
for name, meta in prefire_cards_meta.items():
    text = meta["text"]
    type_line = meta["type"]
    cmc = meta["cmc"]

    # Basic Ramp fallback (mana dorks and rocks <= 3 CMC)
    if "Land" not in type_line and cmc <= 3 and ("{T}: Add " in text or "{T}: add " in text):
        card_roles[name].add("ramp")

    # Basic Board Wipe fallback
    if re.search(r"destroy all (creatures|nonland permanents)", text, re.I) or \
       re.search(r"exile all (creatures|nonland permanents)", text, re.I):
        card_roles[name].add("board_wipe")

    # Basic Draw fallback
    if re.search(r"\bdraw(s)?\s+(a|\d+|two|three|X)\s+card", text, re.I):
        card_roles[name].add("draw")

# 5. Format and Save Output
print("Formatting and saving to card-roles.json...")
output_dict = {}
for name, roles in card_roles.items():
    if roles:  # Only store cards that have at least one functional utility role
        output_dict[name] = sorted(list(roles))

with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(output_dict, f, indent=2)

print(f"Done. Classified {len(output_dict)} functional Pre-FIRE utility cards into {OUTPUT_PATH}.")