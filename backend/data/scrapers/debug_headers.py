import re
from pathlib import Path

full_text = Path("catalog_text.txt").read_text()

matches = list(re.finditer(r".{0,60}\bMajor\b.{0,60}", full_text))
print(f"Found {len(matches)} lines containing 'Major'\n")

for match in matches[:20]:
    print(repr(match.group()))
    print("---")
