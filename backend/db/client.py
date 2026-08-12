import os
from typing import Optional
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_client: Optional[Client] = None


def get_client() -> Client:
    """Returns a cached Supabase client, creating it on first call."""
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY must be set in .env. "
                "Get these from whoever set up the Supabase project."
            )
        _client = create_client(url, key)
    return _client
