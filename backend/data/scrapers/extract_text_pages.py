import pdfplumber
import json
from pathlib import Path

print("Extracting text page-by-page...")
with pdfplumber.open("catalog.pdf") as pdf:
    pages = []
    for i, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        pages.append(text)
        if (i + 1) % 50 == 0:
            print(f"  {i + 1}/{len(pdf.pages)}...")

Path("catalog_pages.json").write_text(json.dumps(pages))
print(f"Done. Saved {len(pages)} pages to catalog_pages.json")
