import json
from pathlib import Path

entries = json.loads(Path("toc_entries.json").read_text())

matches = [e for e in entries if "blair" in e["name"].lower() or "music" in e["name"].lower()]
print(f"Found {len(matches)} Blair/Music-related TOC entries\n")

for m in matches[:15]:
    print(f"  {m['name']}: page {m['page']}")
