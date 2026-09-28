"""
Loads salary_data.json into the Supabase salary_data table.
Safe to rerun: clears existing rows first.

Usage:
    python load_salary_to_supabase.py
"""

import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
if not os.environ.get("SUPABASE_URL"):
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")

BATCH_SIZE = 200


def make_client():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def insert_batch(client, rows, retries=5):
    for attempt in range(retries):
        try:
            client.table("salary_data").insert(rows).execute()
            return client, True
        except Exception as e:
            print(f"  insert failed (attempt {attempt + 1}/{retries}): {e}")
            time.sleep(3 * (attempt + 1))
            client = make_client()
    return client, False


def main():
    records = json.loads(Path("salary_data.json").read_text())
    print(f"Loaded {len(records)} records from salary_data.json")

    client = make_client()
    client.table("salary_data").delete().neq("id", 0).execute()
    print("Cleared existing rows")

    inserted = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        client, ok = insert_batch(client, batch)
        if ok:
            inserted += len(batch)
            print(f"  Inserted {inserted}/{len(records)}")
        else:
            print(f"  FAILED batch starting at {i}")

    result = client.table("salary_data").select("id", count="exact").limit(1).execute()
    print(f"\nDone. Table now has {result.count} rows.")


if __name__ == "__main__":
    main()
