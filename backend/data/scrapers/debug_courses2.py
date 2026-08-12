import re
from pathlib import Path

full_text = Path("catalog_text.txt").read_text()

# Course codes are usually 2-6 letters + a number, e.g. "ECON 1010" or "CS 3251"
matches = list(re.finditer(r"\b[A-Z]{2,6}\s\d{4}[A-Za-z]?\b.{0,100}", full_text))
print(f"Found {len(matches)} course-code-like matches\n")

for match in matches[:20]:
    print(repr(match.group()))
    print("---")
