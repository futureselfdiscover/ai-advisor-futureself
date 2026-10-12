"""
backend/tests/test_router_wording.py

Checks that differently worded questions reach the right feature, and that
program questions resolve to the right catalog program. Uses only the cheap
gpt-4o-mini routing calls, not full answers.

Usage (from backend/):
    python tests/test_router_wording.py
"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

base = Path(__file__).resolve().parents[1]
sys.path.append(str(base / "advisor"))
from router import pick_feature
from requirements import find_program

TARGET = 0.90


def run_case(case):
    pick = pick_feature(case["message"])
    program = None
    if case.get("program"):
        program = find_program(pick["program"] or case["message"])
    return pick, program


def main():
    cases = json.loads((Path(__file__).parent / "router_wording_cases.json").read_text())
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(run_case, cases))

    passed, misses = 0, []
    for case, (pick, program) in zip(cases, results):
        ok = pick["feature"] == case["feature"]
        if case.get("program"):
            ok = ok and bool(program) and case["program"] in program.lower().replace("&", "and")
        passed += ok
        if not ok:
            misses.append(f"  want {case['feature']:<21} {case.get('program') or '':<22} "
                          f"got {pick['feature']:<21} {program or '':<30} | {case['message']}")

    n = len(cases)
    if misses:
        print("MISSES:")
        print("\n".join(misses))
        print()
    print(f"Wording accuracy: {passed}/{n} ({passed / n:.0%})   target {TARGET:.0%}")
    print("PASS" if passed / n >= TARGET else "FAIL")
    sys.exit(0 if passed / n >= TARGET else 1)


if __name__ == "__main__":
    main()
