import json
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())

# Search early pages for something that looks like a real table of contents
for i in range(min(30, len(pages))):
    text = pages[i]
    if "Table of Contents" in text or "CONTENTS" in text.upper():
        print(f"=== Page {i+1} ===")
        print(text[:1000])
        print()
