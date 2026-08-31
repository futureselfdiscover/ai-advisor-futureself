"""
Runs a batch of realistic student questions through retrieve_context()
to sanity-check retrieval quality across all data sources before
building the AI layer on top.

Usage:
    python test_retrieval_batch.py
"""

from retrieve import retrieve_context

TEST_QUERIES = [
    # Course catalog
    "What courses should I take for a computer science major?",
    "Is there a class about African American history?",
    "What intro economics classes are there?",
    "Are there any music theory courses?",
    "What's a good elective about climate change?",

    # Degree requirements
    "What do I need to complete a child development major?",
    "What are the requirements for a chemistry major?",
    "How many credit hours do I need for special education?",

    # Student orgs
    "Are there any clubs for people interested in entrepreneurship?",
    "What organizations exist for international students?",
    "Are there any dance clubs on campus?",
    "Is there a pre-med club?",

    # Career center
    "How do I find an internship through the career center?",
    "Can the career center help me with my resume?",
    "What events does the career center run?",
    "How do I get career advice as an international student?",

    # Mixed / ambiguous - testing whether relevant results surface even
    # when the query doesn't name a category outright
    "I'm interested in psychology, what should I look into?",
    "I want to work in finance after graduation, what should I do now?",
    "I'm not sure what major to pick, can you help?",
    "What's available for pre-law students?",
]


def main():
    for query in TEST_QUERIES:
        print(f"\n{'=' * 70}")
        print(f"Q: {query}")
        print('=' * 70)

        results = retrieve_context(query, top_k=3)

        if not results:
            print("  NO RESULTS FOUND")
            continue

        for r in results:
            print(f"  [{r['source_type']}] sim={r['similarity']:.3f} | {r['content'][:120]}...")


if __name__ == "__main__":
    main()
