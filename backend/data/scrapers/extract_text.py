import pdfplumber
from pathlib import Path

print("Extracting text from catalog.pdf (this takes a minute or two, be patient)...")
with pdfplumber.open("catalog.pdf") as pdf:
    total_pages = len(pdf.pages)
    all_text = []
    for i, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        all_text.append(text)
        if (i + 1) % 20 == 0:
            print(f"  processed {i + 1}/{total_pages} pages...")

Path("catalog_text.txt").write_text("\n".join(all_text))
print(f"Done. Saved {total_pages} pages to catalog_text.txt")
