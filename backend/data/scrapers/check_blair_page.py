import json
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())

print("=== Page 102 ===")
print(pages[101][:1500])
