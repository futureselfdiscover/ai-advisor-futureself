"""
backend/tests/test_intent.py

Runs every prompt in intent_test_prompts.json through the classifier and
reports accuracy. The plan's target is 90% before moving on.

Usage (from backend/):
    python tests/test_intent.py
"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

base = Path(__file__).resolve().parents[1]
sys.path.append(str(base / "advisor"))
from classify_intent import classify_intent

TARGET = 0.90

# career_coaching and post_grad go through the same features in router.py,
# so mixing those two up doesn't change what the student gets back.
SAME_ROUTE = {"career_coaching": "career", "post_grad": "career"}


def route_group(category: str) -> str:
    return SAME_ROUTE.get(category, category)


def main():
    cases = json.loads((Path(__file__).parent / "intent_test_prompts.json").read_text())

    with ThreadPoolExecutor(max_workers=8) as pool:
        got = list(pool.map(lambda c: classify_intent(c["message"])["category"], cases))

    exact = routed = blocked = 0
    misses = []
    for case, actual in zip(cases, got):
        expected = case["expected"]
        if actual == expected:
            exact += 1
        if route_group(actual) == route_group(expected):
            routed += 1
        else:
            misses.append((expected, actual, case["message"]))
        if actual == "out_of_scope" and expected != "out_of_scope":
            blocked += 1

    n = len(cases)
    if misses:
        print("MISSES (expected -> got):")
        for expected, actual, message in misses:
            print(f"  {expected:<22} -> {actual:<22} | {message}")
        print()

    print(f"Exact category:      {exact}/{n} ({exact / n:.0%})")
    print(f"Routing accuracy:    {routed}/{n} ({routed / n:.0%})   target {TARGET:.0%}")
    print(f"Valid questions blocked as out of scope: {blocked}")

    passed = routed / n >= TARGET and blocked == 0
    print("PASS" if passed else "FAIL")
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
