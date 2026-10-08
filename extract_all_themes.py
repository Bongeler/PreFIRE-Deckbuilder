import os
import json
from collections import Counter

THEMES_DIR = "data/themes"

theme_counts = Counter()
theme_labels = {}

for root, _, files in os.walk(THEMES_DIR):
    for file in files:
        if not file.endswith(".json"):
            continue
        file_path = os.path.join(root, file)
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                themes = data.get("themes", {})
                for slug, details in themes.items():
                    theme_counts[slug] += 1
                    if slug not in theme_labels:
                        theme_labels[slug] = details.get("label", slug)
        except Exception:
            continue

print(f"Total unique themes found across all Pre-FIRE commanders: {len(theme_counts)}\n")

# Display themes ordered by how many commanders use them
print("Top 50 Most Common Themes/Tribes:")
for slug, count in theme_counts.most_common(50):
    print(f"- {slug:<25} ({theme_labels[slug]}): {count} commanders")

# Dump full list to a reference file
output_path = "all-detected-themes.json"
sorted_themes = {
    slug: {"label": theme_labels[slug], "commander_count": count}
    for slug, count in theme_counts.most_common()
}

with open(output_path, "w", encoding="utf-8") as f:
    json.dump(sorted_themes, f, indent=2)

print(f"\nSaved full sorted list to {output_path}")