"""
Pulls one row (if any exist) from fsd_profile to see its actual column
structure, so we know whether it already covers what Week 5's student
profile system needs.

Usage:
    python inspect_fsd_profile.py
"""

from client import get_client


def main():
    client = get_client()

    print("Checking fsd_profile table structure...\n")
    result = client.table("fsd_profile").select("*").limit(1).execute()

    if result.data:
        print("Found a sample row. Columns present:")
        for key, value in result.data[0].items():
            print(f"  {key}: {type(value).__name__} = {repr(value)[:80]}")
    else:
        print("Table exists but has 0 rows, so column names can't be inferred this way.")
        print("Check the Table Editor in Supabase directly instead - it shows the schema even with no data.")


if __name__ == "__main__":
    main()
