import re
from pathlib import Path

full_text = Path("catalog_text.txt").read_text()

matches = list(re.finditer(r".{0,80}\bCredit Hours?\b.{0,20}", full_text))
print(f"Found {len(matches)} 'Credit Hours' mentions\n")

for match in matches[:20]:
    print(repr(match.group()))
    print("---")
