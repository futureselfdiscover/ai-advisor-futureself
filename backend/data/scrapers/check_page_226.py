import json
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())

# Page 226 in the catalog's own numbering (1-indexed)
print("=== Page 226 ===")
print(pages[225][:1500])
