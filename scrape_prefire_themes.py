import json
import os
import time
import itertools
import requests

# Paths
PREFIRE_PATH = "prefire-names.json"
CARDS_PATH = "oracle-cards-20261008090159.jsonl"
ROLES_PATH = "card-roles.json"
OUTPUT_DIR = "data/themes"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PreFIRE-Autobuilder/1.0"
}

# The 15 original Commander 2016 open Partners
C16_PARTNERS = [
    "Akiri, Line-Slinger", "Bruse Tarl, Boorish Herder", "Ikra Shidiqi, the Usurper",
    "Ishai, Ojutai Dragonspeaker", "Kraum, Ludevic's Opus", "Kydele, Chosen of Kruphix",
    "Ludevic, Necro-Alchemist", "Ravos, Soultender", "Reyhan, Last of the Abzan",
    "Sidar Kondo of Jamuraa", "Silas Renn, Seeker Adept", "Tana, the Bloodsower",
    "Thrasios, Triton Hero", "Tymna the Weaver", "Vial Smasher the Fierce"
]

# The 5 Battlebond Partner With pairs
BBD_PAIRS = [
    ("Khorvath Brightflame", "Sylvia Brightspear"),
    ("Krav, the Unredeemed", "Regna, the Redeemer"),
    ("Okaun, Eye of Chaos", "Zndrsplt, Eye of Wisdom"),
    ("Pir, Imaginative Rascal", "Toothy, Imaginary Friend"),
    ("Virtus the Veiled", "Gorm the Great")
]

def clean_slug(name):
    name = name.lower()
    for char in ["'", ",", "\"", "(", ")", ":", "."]:
        name = name.replace(char, "")
    name = name.replace(" // ", "-").replace(" / ", "-")
    name = name.replace(" ", "-")
    while "--" in name:
        name = name.replace("--", "-")
    return name.strip("-")

def get_partner_slug(name_a, name_b):
    slug_a = clean_slug(name_a)
    slug_b = clean_slug(name_b)
    pair = sorted([slug_a, slug_b])
    return f"{pair[0]}-{pair[1]}"

def fetch_json(url):
    try:
        res = requests.get(url, headers=HEADERS, timeout=12)
        if res.status_code == 200:
            return res.json()
        elif res.status_code == 404:
            return None
        elif res.status_code == 429:
            print("Rate limited (429). Sleeping 5 seconds...")
            time.sleep(5)
            return fetch_json(url)
        else:
            return None
    except Exception:
        return None

# 1. Load Pre-FIRE sets & roles
print("Loading reference datasets...")
with open(PREFIRE_PATH, "r", encoding="utf-8") as f:
    raw = json.load(f)
    prefire_names = set(raw if isinstance(raw, list) else raw.keys())

with open(ROLES_PATH, "r", encoding="utf-8") as f:
    card_roles = json.load(f)

# 2. Extract Pre-FIRE Commanders from Cards JSONL
print("Scanning cards dataset for eligible Pre-FIRE commanders...")
solo_commanders = set()

with open(CARDS_PATH, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        c = json.loads(line)
        name = c.get("name")
        type_line = c.get("type_line", "")
        oracle_text = c.get("oracle_text", "")

        if name in prefire_names:
            is_legendary_creature = "Legendary" in type_line and "Creature" in type_line
            is_planeswalker_cmd = "can be your commander" in oracle_text
            if is_legendary_creature or is_planeswalker_cmd:
                solo_commanders.add(name)

print(f"Found {len(solo_commanders)} solo Pre-FIRE commanders.")

# 3. Assemble Master Helmet Queue (Solo + C16 Partners + BBD Pairs)
helmet_queue = []

# Solo
for name in sorted(solo_commanders):
    helmet_queue.append({
        "type": "solo",
        "name": name,
        "slug": clean_slug(name)
    })

# C16 105 Pairs
for a, b in itertools.combinations(C16_PARTNERS, 2):
    helmet_queue.append({
        "type": "partner",
        "name": f"{a} & {b}",
        "slug": get_partner_slug(a, b)
    })

# BBD 5 Pairs
for a, b in BBD_PAIRS:
    helmet_queue.append({
        "type": "partner_with",
        "name": f"{a} & {b}",
        "slug": get_partner_slug(a, b)
    })

print(f"Total helmet combinations to scrape: {len(helmet_queue)}")

def extract_cards_and_distribution(payload):
    extracted_cards = []
    seen = set()

    cardlists = payload.get("container", {}).get("json_dict", {}).get("cardlists", [])
    if not cardlists:
        cardlists = payload.get("cardlists", [])

    for section in cardlists:
        for card_obj in section.get("cardviews", []):
            name = card_obj.get("name")
            if name and name in prefire_names and name not in seen:
                seen.add(name)
                extracted_cards.append(name)

    targets = {
        "ramp": 0,
        "removal_creature": 0,
        "removal_noncreature": 0,
        "board_wipe": 0,
        "draw": 0,
        "engine": 0
    }

    for name in extracted_cards[:63]:
        roles = card_roles.get(name, [])
        if not roles:
            targets["engine"] += 1
        else:
            for r in roles:
                if r in targets:
                    targets[r] += 1

    return {
        "targets": targets,
        "cards": extracted_cards[:50]
    }

# 4. Scrape Loop
os.makedirs(OUTPUT_DIR, exist_ok=True)
total = len(helmet_queue)

for idx, helmet in enumerate(helmet_queue, 1):
    slug = helmet["slug"]
    first_char = slug[0] if slug[0].isalnum() else "_"
    dest_dir = os.path.join(OUTPUT_DIR, first_char)
    os.makedirs(dest_dir, exist_ok=True)
    out_file = os.path.join(dest_dir, f"{slug}.json")

    # Resume support: skip if already scraped
    if os.path.exists(out_file):
        continue

    print(f"[{idx}/{total}] Scraping: {helmet['name']} ({slug})...")
    base_url = f"https://json.edhrec.com/pages/commanders/{slug}.json"
    base_data = fetch_json(base_url)
    time.sleep(0.3)

    if not base_data:
        # Some obscure partner pairings have 0 recorded decks
        continue

    default_data = extract_cards_and_distribution(base_data)

    # Filter top 10 themes with >= 50 recorded decks
    raw_taglinks = base_data.get("panels", {}).get("taglinks", [])
    valid_themes = [t for t in raw_taglinks if t.get("count", 0) >= 50][:10]

    scraped_themes = {}
    for tag in valid_themes:
        theme_slug = tag.get("slug")
        theme_label = tag.get("value")
        theme_count = tag.get("count")

        if not theme_slug:
            continue

        theme_url = f"https://json.edhrec.com/pages/commanders/{slug}/{theme_slug}.json"
        theme_data = fetch_json(theme_url)
        time.sleep(0.3)

        if theme_data:
            scraped_themes[theme_slug] = {
                "label": theme_label,
                "count": theme_count,
                "data": extract_cards_and_distribution(theme_data)
            }

    # Write sharded result to disk
    result_payload = {
        "name": helmet["name"],
        "slug": slug,
        "type": helmet["type"],
        "default": default_data,
        "themes": scraped_themes
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result_payload, f, separators=(',', ':'))

print("\nScraping complete. All theme data is compiled in data/themes/")