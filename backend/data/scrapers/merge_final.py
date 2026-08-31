import json
from pathlib import Path

as_engineering = json.loads(Path("degree_requirements.json").read_text())
blair = json.loads(Path("blair_requirements.json").read_text())
peabody = json.loads(Path("peabody_requirements.json").read_text())

all_sections = as_engineering + blair + peabody

Path("degree_requirements.json").write_text(json.dumps(all_sections, indent=2))
print(f"Final merged total: {len(all_sections)} sections")
print(f"  - {len(as_engineering)} Arts & Science / Engineering")
print(f"  - {len(blair)} Blair")
print(f"  - {len(peabody)} Peabody")
