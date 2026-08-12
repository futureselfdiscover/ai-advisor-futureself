"""
Retries embedding + inserting only the chunk batches that failed during
the first run (network errors: broken pipe, SSL issues).

Usage:
    python retry_failed_batches.py
"""

import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
if not os.environ.get("OPENAI_API_KEY"):
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")

EMBEDDING_MODEL = "text-embedding-3-small"
FAILED_START_INDICES = [300, 1400, 2000, 2400, 2600, 2700, 2800, 4700]
BATCH_SIZE = 100


def get_clients():
    openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    supabase_client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    return openai_client, supabase_client


def embed_batch(openai_client, texts, retries=5):
    for attempt in range(retries):
        try:
            response = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
            return [item.embedding for item in response.data]
        except Exception as e:
            print(f"    embedding failed (attempt {attempt + 1}/{retries}): {e}")
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("Failed to embed batch after retries")


def insert_batch(supabase_client, rows, retries=5):
    for attempt in range(retries):
        try:
            supabase_client.table("document_chunks").insert(rows).execute()
            return True
        except Exception as e:
            print(f"    insert failed (attempt {attempt + 1}/{retries}): {e}")
            time.sleep(3 * (attempt + 1))
            supabase_client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    return False


def main():
    chunks = json.loads(Path("chunks.json").read_text())
    openai_client, supabase_client = get_clients()

    total_inserted = 0
    for start in FAILED_START_INDICES:
        batch = chunks[start:start + BATCH_SIZE]
        texts = [c["content"] for c in batch]

        print(f"Retrying chunks {start}-{start + len(batch)}...")
        embeddings = embed_batch(openai_client, texts)

        rows = []
        for chunk, embedding in zip(batch, embeddings):
            rows.append(
                {
                    "school": "vanderbilt",
                    "source_type": chunk["source_type"],
                    "content": chunk["content"],
                    "metadata": chunk.get("metadata", {}),
                    "embedding": embedding,
                }
            )

        success = insert_batch(supabase_client, rows)
        if success:
            total_inserted += len(rows)
            print(f"  Inserted {len(rows)} rows (total retried so far: {total_inserted})")
        else:
            print(f"  STILL FAILED after retries for batch starting at {start} - will need another pass")

    print(f"\nDone. {total_inserted}/{len(FAILED_START_INDICES) * BATCH_SIZE} retried chunks inserted.")


if __name__ == "__main__":
    main()
