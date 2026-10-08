import json
import os
import re

def main():
    themes_root = "data/themes"
    cards_path = "oracle-cards-20261008090159.jsonl"

    if not os.path.exists(themes_root):
        print("data/themes folder not found!")
        return

    # 1. Load card oracle texts & types for fast lookup
    print("Building card text index...")
    card_info = {}
    if os.path.exists(cards_path):
        with open(cards_path, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip(): continue
                c = json.loads(line)
                name = c.get("name")
                if name and name not in card_info:
                    text = c.get("oracle_text", "").lower()
                    type_line = c.get("type_line", "").lower()
                    card_info[name] = {"text": text, "type": type_line}
    else:
        print(f"Warning: {cards_path} not found. Will fall back to name matching.")

    # 2. Comprehensive Archetype & Tribal Rules
    archetypes = {
        "aristocrats": ["sacrifice a creature", "whenever a creature dies", "whenever another creature dies"],
        "lifegain": ["gain life", "gains life", "lifelink", "life total"],
        "+1-+1-counters": ["+1/+1 counter", "proliferate"],
        "tokens": ["create", "creature token", "token creature"],
        "reanimator": ["return", "from your graveyard to the battlefield", "reanimate"],
        "artifacts": ["artifact", "equipment", "metalcraft", "affinity for artifacts"],
        "enchantress": ["enchantment", "aura", "constellation"],
        "spellslinger": ["instant or sorcery", "instants and sorceries", "prowess"],
        "voltron": ["equipped creature", "enchanted creature", "aura", "equipment"],
        "landfall": ["landfall", "whenever a land enters the battlefield"],
        "graveyard": ["graveyard", "dredge", "flashback", "threshold"],
        "zombies": ["zombie"],
        "vampires": ["vampire"],
        "goblins": ["goblin"],
        "elves": ["elf"],
        "wizards": ["wizard"],
        "dragons": ["dragon"]
    }

    updated_count = 0

    print("Scanning and tagging commanders in data/themes...")
    for root, _, files in os.walk(themes_root):
        for filename in files:
            if not filename.endswith(".json"):
                continue

            file_path = os.path.join(root, filename)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    payload = json.load(f)
            except Exception:
                continue

            themes = payload.get("themes", {})
            default_cards = payload.get("default", {}).get("cards", [])

            # Only add themes if none exist, or if it only has 1 theme
            if len(themes) <= 1 and default_cards:
                inferred = dict(themes)

                for arch_slug, patterns in archetypes.items():
                    if arch_slug in inferred:
                        continue

                    matched = []
                    for c_name in default_cards:
                        info = card_info.get(c_name, {})
                        full_search_text = info.get("text", "") + " " + info.get("type", "") + " " + c_name.lower()

                        if any(re.search(rf"\b{re.escape(pat)}\b", full_search_text) for pat in patterns):
                            matched.append(c_name)

                    # If commander's synergy list contains at least 5 cards matching this theme
                    if len(matched) >= 5:
                        inferred[arch_slug] = {
                            "label": arch_slug.replace("-", " ").title(),
                            "deck_count": len(matched) * 4,
                            "data": {
                                "targets": payload.get("default", {}).get("targets", {}),
                                "cards": matched + [c for c in default_cards if c not in matched]
                            }
                        }

                if len(inferred) > len(themes):
                    payload["themes"] = inferred
                    with open(file_path, "w", encoding="utf-8") as f:
                        json.dump(payload, f, separators=(',', ':'))
                    updated_count += 1

    print(f"Done! Successfully updated theme profiles for {updated_count} commanders.")

if __name__ == "__main__":
    main()