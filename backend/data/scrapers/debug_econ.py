import re
from pathlib import Path

full_text = Path("catalog_text.txt").read_text()

# Find a chunk of raw text right around any ECON course mention
idx = full_text.find("ECON 1020")
print(repr(full_text[idx-50:idx+400]))
