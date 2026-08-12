import re
from pathlib import Path

full_text = Path("catalog_text.txt").read_text()

# Check known majors that should exist but weren't captured
test_names = ["Economics", "Computer Science", "Mechanical Engineering", "English", "Psychology"]

for name in test_names:
    idx = full_text.find(name)
    if idx == -1:
        print(f"'{name}' not found at all in text\n")
        continue
    print(f"=== First mention of '{name}' ===")
    print(repr(full_text[max(0, idx-80):idx+150]))
    print()
