import re
from pathlib import Path
import json

pages = json.loads(Path("catalog_pages.json").read_text())
full_text = "\n".join(pages)

matches = list(re.finditer(r"\nEconomics\n", full_text))
print(f"Found {len(matches)} standalone 'Economics' lines\n")

for m in matches[:3]:
    start = max(0, m.start() - 100)
    end = m.end() + 500
    print("=" * 60)
    print(repr(full_text[start:end]))
    print()
