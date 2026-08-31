import json
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())

# Keep extending until entries stop looking like "Name ####" pairs
for i in range(14, 40):
    text = pages[i]
    print(f"=== Page {i+1} (first 200 chars) ===")
    print(text[:200])
    print()
