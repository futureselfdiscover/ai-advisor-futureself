import json
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())

# TOC likely spans the first several pages - grab a generous chunk
toc_text = "\n".join(pages[:15])
Path("toc_text.txt").write_text(toc_text)
print(f"Saved {len(toc_text)} characters of TOC text to toc_text.txt")

# Quick check: does it still look like TOC entries by page 15, or has
# it transitioned into real catalog content?
print("\n=== Last 500 chars (page 15 area) ===")
print(pages[14][-500:])
