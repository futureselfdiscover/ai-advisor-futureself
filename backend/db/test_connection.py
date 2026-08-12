from client import get_client


def main():
    print("Connecting to Supabase...")
    client = get_client()
    print("Connected.")

    tables_to_check = ["documents", "document_chunks", "student_profiles"]

    for table in tables_to_check:
        try:
            result = client.table(table).select("*", count="exact").limit(1).execute()
            count = result.count if hasattr(result, "count") else "?"
            print(f"  '{table}' table found ({count} rows)")
        except Exception as e:
            print(f"  '{table}' table NOT found or errored: {e}")
            print(f"     -> Did you run supabase/schema.sql in the Supabase SQL editor?")

    print("\nDone. If all three tables showed up, you're fully connected and ready for Week 2 data.")


if __name__ == "__main__":
    main()
