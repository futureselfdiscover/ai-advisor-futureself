import json
import re
from collections import defaultdict
from pathlib import Path

pages = json.loads(Path("catalog_pages.json").read_text())

# Look at the first 3 lines of each page - running headers usually live there
def first_lines(text, n=3):
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    return lines[:n]

# For each page, check if any of its first few lines repeats on the
# next page too - that's a strong signal it's a running section header
header_runs = []
current_header = None
run_start = None

for i, page_text in enumerate(pages):
    lines = first_lines(page_text)
    # A likely header: short (2-8 words), not just numbers, appears in first lines
    candidates = [l for l in lines if 2 <= len(l.split()) <= 8 and not l[0].isdigit()]

    match_found = None
    if current_header:
        for c in candidates:
            if c == current_header:
                match_found = c
                break

    if match_found:
        continue  # still in the same section
    else:
        if current_header and run_start is not None and i - run_start >= 2:
            header_runs.append({"header": current_header, "start_page": run_start + 1, "end_page": i})
        current_header = candidates[0] if candidates else None
        run_start = i

print(f"Found {len(header_runs)} repeating section headers (2+ consecutive pages)\n")
for h in header_runs:
    print(f"  pages {h['start_page']}-{h['end_page']}: {h['header']}")
