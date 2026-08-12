"""
backend/rag/retrieve.py

Takes a student's question, embeds it, and searches Supabase for the most
relevant chunks (courses, degree requirements, student orgs) using the
match_document_chunks() function defined in the schema.

Usage:
    from retrieve import retrieve_context
    results = retrieve_context("What courses should I take for a CS major?")
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

EMBEDDING_MODEL = "text-embedding-3-small"

_openai_client = None
_supabase_client = None


def _get_clients():
    global _openai_client, _supabase_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    if _supabase_client is None:
        _supabase_client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
    return _openai_client, _supabase_client


def embed_query(query: str) -> list:
    openai_client, _ = _get_clients()
    response = openai_client.embeddings.create(model=EMBEDDING_MODEL, input=[query])
    return response.data[0].embedding


def retrieve_context(query: str, source_type: str = None, top_k: int = 5) -> list:
    """
    Returns the top_k most relevant chunks for a query, optionally filtered
    to a specific source_type ('course_catalog', 'degree_requirements',
    'student_org'). Each result includes content, metadata, and a
    similarity score.
    """
    _, supabase_client = _get_clients()

    query_embedding = embed_query(query)

    result = supabase_client.rpc(
        "match_document_chunks",
        {
            "query_embedding": query_embedding,
            "match_count": top_k,
            "filter_source_type": source_type,
        },
    ).execute()

    return result.data


if __name__ == "__main__":
    test_query = sys.argv[1] if len(sys.argv) > 1 else "What courses should I take for a computer science major?"

    print(f"Query: {test_query}\n")
    results = retrieve_context(test_query, top_k=5)

    for i, r in enumerate(results, 1):
        print(f"{i}. [{r['source_type']}] similarity={r['similarity']:.3f}")
        print(f"   {r['content'][:200]}...")
        print()
