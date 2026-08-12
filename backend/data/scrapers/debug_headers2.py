import re
from pathlib import Path

full_text = Path("catalog_text.txt").read_text()

# Real body headers look like "Major in Human and Organizational Development"
# TOC entries have a trailing page number like "...Development 228"
matches = list(re.finditer(r"Major in [A-Z][A-Za-z&,\s]{2,60}", full_text))
print(f"Found {len(matches)} 'Major in X' matches\n")

for match in matches[:30]:
    print(repr(match.group()))
