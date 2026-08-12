import re
from pathlib import Path

full_text = Path("catalog_text.txt").read_text()

# Real format: "CODE. Title. Description in phrases."
# e.g. "MS-PC 1210. Leadership and Personal Development. Leadership is one..."
PATTERN = re.compile(
    r"(?P<code>[A-Z]{2,6}(?:-[A-Z]{2,4})?\s\d{3,4}[A-Za-z]?)\.\s+"
    r"(?P<title>[A-Z][^.]{2,90})\.\s"
)

matches = list(PATTERN.finditer(full_text))
print(f"Found {len(matches)} matches\n")

for m in matches[:15]:
    print(f"{m.group('code')} | {m.group('title')}")
