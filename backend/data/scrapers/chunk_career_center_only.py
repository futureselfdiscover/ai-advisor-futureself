import json
from pathlib import Path
from chunking import chunk_career_center

pages = json.loads(Path("career_center.json").read_text())
chunks = chunk_career_center(pages)

Path("career_center_chunks.json").write_text(json.dumps(chunks, indent=2))
print(f"{len(pages)} pages -> {len(chunks)} chunks")
print(f"Wrote career_center_chunks.json")
