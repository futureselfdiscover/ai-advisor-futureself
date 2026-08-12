"""
Reads chunks.json, generates OpenAI embeddings for each chunk, and inserts
them into the Supabase document_chunks table.

Usage:
    python embed_and_store.py --chunks chunks.json --batch-size 100

Requires OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY in backend/.env
"""

import argparse
import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client

# Load .env from backend/ regardless of where this script is run from
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
if not os.environ.get("OPENAI_API_KEY"):
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")

EMBEDDING_MODEL = "text-embedding-3-small"  # 1536 dimensions, matches the schema
BATCH_SIZE = 100


def get_clients():
    openai_key = os.environ.get("OPENAI_API_KEY")
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")

    if not openai_key:
        raise RuntimeError("OPENAI_API_KEY not found in .env")
    if not supabase_url or not supabase_key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY not found in .env")

    openai_client = OpenAI(api_key=openai_key)
    supabase_client = create_client(supabase_url, supabase_key)
    return openai_client, supabase_client


def embed_batch(openai_client, texts, retries=3):
    for attempt in range(retries):
        try:
            response = openai_client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=texts,
            )
            return [item.embedding for item in response.data]
        except Exception as e:
            print(f"    embedding batch failed (attempt {attempt + 1}/{retries}): {e}")
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("Failed to embed batch after retries")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--chunks", default="chunks.json")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--school", default="vanderbilt")
    args = parser.parse_args()

    chunks = json.loads(Path(args.chunks).read_text())
    print(f"Loaded {len(chunks)} chunks from {args.chunks}")

    openai_client, supabase_client = get_clients()

    total_inserted = 0
    for i in range(0, len(chunks), args.batch_size):
        batch = chunks[i:i + args.batch_size]
        texts = [c["content"] for c in batch]

        print(f"Embedding chunks {i}-{i + len(batch)} of {len(chunks)}...")
        embeddings = embed_batch(openai_client, texts)

        rows = []
        for chunk, embedding in zip(batch, embeddings):
            rows.append(
                {
                    "school": args.school,
                    "source_type": chunk["source_type"],
                    "content": chunk["content"],
                    "metadata": chunk.get("metadata", {}),
                    "embedding": embedding,
                }
            )

        try:
            supabase_client.table("document_chunks").insert(rows).execute()
            total_inserted += len(rows)
            print(f"  Inserted {len(rows)} rows (total so far: {total_inserted})")
        except Exception as e:
            print(f"  FAILED to insert batch starting at {i}: {e}")

    print(f"\nDone. {total_inserted}/{len(chunks)} chunks embedded and stored.")


if __name__ == "__main__":
    main()
