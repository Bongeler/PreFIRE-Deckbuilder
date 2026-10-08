import json
import time
import requests

# Load reference datasets
print("Loading reference datasets...")
with open("prefire-names.json", "r", encoding="utf-8") as f:
    prefire_data = json.load(f)
    prefire_names = set(prefire_data if isinstance(prefire_data, list) else prefire_data.keys())

with open("card-roles.json", "r", encoding="utf-8") as f:
    card_roles = json.load(f)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PreFIRE-Autobuilder/1.0"
}

def fetch_json(url):
    try:
        res = requests.get(url, headers=HEADERS, timeout=10)
        if res.status_code == 200:
            return res.json()
        elif res.status_code == 404:
            return None
        else:
            print(f"Warning: HTTP {res.status_code} on {url}")
            return None
    except Exception as e:
        print(f"Fetch failed for {url}: {e}")
        return None

def extract_cards_and_distribution(payload):
    extracted_cards = []
    seen = set()

    # Dig into cardlists container
    cardlists = payload.get("container", {}).get("json_dict", {}).get("cardlists", [])
    if not cardlists:
        cardlists = payload.get("cardlists", [])

    for section in cardlists:
        for card_obj in section.get("cardviews", []):
            name = card_obj.get("name")
            if name and name in prefire_names and name not in seen:
                seen.add(name)
                extracted_cards.append(name)

    # Calculate functional distribution across top Pre-FIRE non-land cards
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

# --- TEST RUN ---
commander_slug = "muldrotha-the-gravetide"
base_url = f"https://json.edhrec.com/pages/commanders/{commander_slug}.json"

print(f"Fetching base data for {commander_slug}...")
base_data = fetch_json(base_url)

if not base_data:
    print("Failed to reach EDHREC base endpoint.")
    exit()

# Extract top themes with at least 50 recorded decks
raw_taglinks = base_data.get("panels", {}).get("taglinks", [])
valid_themes = [t for t in raw_taglinks if t.get("count", 0) >= 50]

print(f"Found {len(valid_themes)} valid themes with >= 50 decks.")

# Process Base / Default list
print("Processing Default list...")
default_result = extract_cards_and_distribution(base_data)

# Test fetch the top 3 themes
themes = {}
for tag in valid_themes[:3]:
    theme_slug = tag.get("slug")
    theme_label = tag.get("value")
    deck_count = tag.get("count")

    print(f"Fetching theme: {theme_label} (slug: '{theme_slug}', decks: {deck_count})...")
    time.sleep(0.3)
    theme_url = f"https://json.edhrec.com/pages/commanders/{commander_slug}/{theme_slug}.json"
    theme_data = fetch_json(theme_url)
    
    if theme_data:
        themes[theme_slug] = {
            "label": theme_label,
            "deck_count": deck_count,
            "data": extract_cards_and_distribution(theme_data)
        }

# Display summary
print("\n--- RESULTS SUMMARY ---")
print(f"Default list: {len(default_result['cards'])} cards extracted.")
print(f"Default targets: {default_result['targets']}")

for slug, t_info in themes.items():
    print(f"\nTheme: {t_info['label']} ({slug})")
    print(f"  Target Quotas: {t_info['data']['targets']}")
    print(f"  Top 5 Cards: {t_info['data']['cards'][:5]}")