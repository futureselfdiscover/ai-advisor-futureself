import json
import re
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())

# Look for college/school section markers
markers = [
    "College of Arts and Science",
    "School of Engineering",
    "Blair School of Music",
    "Bachelor of Arts",
    "Bachelor of Science",
    "Bachelor of Engineering",
    "Bachelor of Musical Arts",
]

for marker in markers:
    found_pages = []
    for i, page_text in enumerate(pages):
        if marker in page_text:
            found_pages.append(i + 1)  # 1-indexed
    if found_pages:
        # Just show the range, not every single page
        print(f"'{marker}': pages {found_pages[0]}-{found_pages[-1]} ({len(found_pages)} pages)")
    else:
        print(f"'{marker}': not found")
