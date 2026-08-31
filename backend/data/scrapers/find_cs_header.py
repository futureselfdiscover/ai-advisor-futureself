import json
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())
early_pages = pages[:456]
full_text = "\n".join(early_pages)

idx = full_text.find("The computer science major provides")
print(full_text[max(0, idx - 2500):idx + 100])
