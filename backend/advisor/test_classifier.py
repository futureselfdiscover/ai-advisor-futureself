"""
backend/intent/test_classifier.py

Runs 50 labeled test prompts through classify_intent() and reports
accuracy against the roadmap's 90% target.

Usage:
    python test_classifier.py
"""

from classify_intent import classify_intent

TEST_CASES = [
    ("What courses should I take for a computer science major?", "academic_planning"),
    ("What are the requirements for a chemistry major?", "academic_planning"),
    ("How many credit hours do I need to graduate?", "academic_planning"),
    ("Is ECON 1010 a prerequisite for intermediate micro?", "academic_planning"),
    ("Can I double major in econ and CS?", "academic_planning"),
    ("What's a good elective about climate change?", "academic_planning"),
    ("Do I need calculus for a psych major?", "academic_planning"),
    ("How do I declare a minor?", "academic_planning"),
    ("What classes fulfill the AXLE requirement?", "academic_planning"),
    ("Should I take organic chemistry this semester or next?", "academic_planning"),

    ("How do I get an internship in finance?", "career_coaching"),
    ("Can the career center help me with my resume?", "career_coaching"),
    ("What events does the career center run?", "career_coaching"),
    ("How do I network with alumni?", "career_coaching"),
    ("What skills do I need for a consulting job?", "career_coaching"),
    ("Where can I find job postings for VU students?", "career_coaching"),
    ("How do I prepare for a case interview?", "career_coaching"),
    ("Is it too late to apply for summer internships?", "career_coaching"),
    ("How do I get career advice as an international student?", "career_coaching"),
    ("What's the best way to reach out to a recruiter?", "career_coaching"),

    ("Are there any clubs for entrepreneurship?", "campus_life"),
    ("Is there a pre-med club?", "campus_life"),
    ("What organizations exist for international students?", "campus_life"),
    ("Are there any dance clubs on campus?", "campus_life"),
    ("How do I join a fraternity or sorority?", "campus_life"),
    ("What's available for pre-law students?", "campus_life"),
    ("Are there any music performance groups?", "campus_life"),
    ("How do I start my own student org?", "campus_life"),
    ("Is there a club for people interested in sustainability?", "campus_life"),
    ("What intramural sports can I join?", "campus_life"),

    ("What should I do about grad school applications?", "post_grad"),
    ("How do I get a fellowship after graduation?", "post_grad"),
    ("Should I take a gap year before law school?", "post_grad"),
    ("What's it like applying to PhD programs?", "post_grad"),
    ("How early should I start studying for the MCAT?", "post_grad"),

    ("What's the weather like today?", "out_of_scope"),
    ("How's your day going?", "out_of_scope"),
    ("Tell me a joke", "out_of_scope"),
    ("Write me a python script to sort a list", "out_of_scope"),
    ("What's the capital of France?", "out_of_scope"),
    ("Can you help me with my math homework for a class I'm not taking at Vanderbilt?", "out_of_scope"),
    ("Who won the game last night?", "out_of_scope"),
    ("What's your favorite movie?", "out_of_scope"),
    ("Can you write me a poem?", "out_of_scope"),
    ("Are you a real person?", "out_of_scope"),

    ("I don't know what I want to do with my life", "clarification_needed"),
    ("Can you help me?", "clarification_needed"),
    ("I'm lost, not sure where to start", "clarification_needed"),
    ("I have no idea what major to pick", "clarification_needed"),
    ("Everything feels overwhelming, what do I do", "clarification_needed"),
]


def main():
    correct = 0
    misses = []

    for query, expected in TEST_CASES:
        result = classify_intent(query)
        actual = result["category"]

        if actual == expected:
            correct += 1
        else:
            misses.append((query, expected, actual))

    total = len(TEST_CASES)
    accuracy = correct / total * 100

    print(f"Accuracy: {correct}/{total} ({accuracy:.1f}%)")
    print(f"Target: 90%\n")

    if misses:
        print(f"Misclassified ({len(misses)}):")
        for query, expected, actual in misses:
            print(f"  '{query}'")
            print(f"    expected: {expected}, got: {actual}")
    else:
        print("No misclassifications!")


if __name__ == "__main__":
    main()
