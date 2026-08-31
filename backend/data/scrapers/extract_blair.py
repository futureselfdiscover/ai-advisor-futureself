"""
Extracts Blair School of Music's real degree requirement content
(pages 111-131), which uses a completely different structure than
either Peabody's "Major in X" pattern or the "COURSES OFFERED" marker.
"""

import json
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())

blair_pages = pages[110:131]  # pages 111-131, 0-indexed
full_text = "\n".join(blair_pages)

section = {
    "department_codes": "MUSIC",
    "degree_type": "major",
    "requirement_text": full_text[:6000],
}

Path("blair_requirements.json").write_text(json.dumps([section], indent=2))
print(f"Extracted Blair section: {len(full_text)} characters")
print("\nSample:")
print(full_text[:500])
