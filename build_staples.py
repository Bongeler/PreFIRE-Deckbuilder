import json
import os

CARDS_PATH = "oracle-cards-20261008090159.jsonl"
ROLES_PATH = "card-roles.json"
PREFIRE_PATH = "prefire-names.json"
THEMES_DIR = "data/themes"
OUTPUT_PATH = "prefire-staples.json"

# 1. Load Pre-FIRE names & roles
print("Loading reference datasets...")
with open(PREFIRE_PATH, "r", encoding="utf-8") as f:
    raw = json.load(f)
    prefire_names = set(raw if isinstance(raw, list) else raw.keys())

with open(ROLES_PATH, "r", encoding="utf-8") as f:
    card_roles = json.load(f)

# 2. Extract EDHREC rank & color identity from Cards JSONL
print("Reading card metadata from oracle-cards...")
card_meta = {}

with open(CARDS_PATH, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        c = json.loads(line)
        name = c.get("name")
        if name in card_roles and name not in card_meta:
            card_meta[name] = {
                "color_identity": c.get("color_identity", []),
                # Higher edhrec_rank number = less popular; default high if missing
                "rank": c.get("edhrec_rank", 999999)
            }

# 3. Mine theme affiliations directly from the local scraped theme files
print("Mining theme tags from local scraped data...")
card_theme_counts = {}

if os.path.exists(THEMES_DIR):
    for root, _, files in os.walk(THEMES_DIR):
        for file in files:
            if not file.endswith(".json"):
                continue
            file_path = os.path.join(root, file)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    themes = data.get("themes", {})
                    for theme_slug, theme_obj in themes.items():
                        theme_cards = theme_obj.get("data", {}).get("cards", [])
                        for c_name in theme_cards:
                            if c_name in card_roles:
                                if c_name not in card_theme_counts:
                                    card_theme_counts[c_name] = {}
                                card_theme_counts[c_name][theme_slug] = card_theme_counts[c_name].get(theme_slug, 0) + 1
            except Exception:
                continue

# Assign themes to a card if it appeared in that theme across 2+ commanders
card_assigned_themes = {}
for c_name, t_counts in card_theme_counts.items():
    assigned = [t for t, count in t_counts.items() if count >= 2]
    if assigned:
        card_assigned_themes[c_name] = assigned

# 4. Group staples by functional bucket and sort by popularity
print("Grouping staples by functional bucket...")
staples_by_role = {
    "ramp": [],
    "removal_creature": [],
    "removal_noncreature": [],
    "board_wipe": [],
    "draw": []
}

for name, roles in card_roles.items():
    meta = card_meta.get(name, {"color_identity": [], "rank": 999999})
    themes = card_assigned_themes.get(name, [])

    entry = {
        "name": name,
        "colors": meta["color_identity"],
        "rank": meta["rank"],
        "themes": themes
    }

    for role in roles:
        if role in staples_by_role:
            staples_by_role[role].append(entry)

# Sort each bucket by EDHREC popularity rank (lowest rank number = most played)
for role in staples_by_role:
    staples_by_role[role].sort(key=lambda x: x["rank"])

# 5. Save output
print(f"Saving compiled staples to {OUTPUT_PATH}...")
with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
    json.dump(staples_by_role, f, separators=(',', ':'))

print("Done. Staples pool successfully built and indexed.")