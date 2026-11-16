"""
backend/data/scrapers/audit_programs.py

Checks programs.json against the official majors/minors lists from admissions.vanderbilt.edu.
Update OFFICIAL when the admissions site changes.
"""
import json
import re
import sys
from pathlib import Path

D = Path(__file__).resolve().parent
OFFICIAL = {
    "major": {
        "Blair School of Music": ["Jazz Studies", "Music Composition", "Music Education", "Music Integrated Studies",
                                  "Music Performance", "Musical Arts"],
        "College of Connected Computing": ["AI Design and Practice", "Computer Science", "Data Science"],
        "School of Engineering": ["Biomedical Engineering", "Chemical Engineering", "Civil Engineering",
                                  "Electrical and Computer Engineering", "Engineering Science",
                                  "Environmental Engineering", "Mechanical Engineering"],
        "Peabody College": ["Child Development", "Child Studies", "Cognitive Studies", "Elementary Education",
                            "Human and Organizational Development", "Language Sciences", "Secondary Education",
                            "Special Education"],
        "College of Arts and Science": [
            "African American and Diaspora Studies", "Anthropology", "Architecture and the Built Environment", "Art",
            "Asian American and Asian Diaspora Studies", "Asian Studies", "Biochemistry and Chemical Biology",
            "Biological Sciences", "Chemistry", "Cinema and Media Arts", "Classical and Mediterranean Studies",
            "Climate and Environmental Studies", "Communication of Science and Technology", "Communication Studies",
            "Culture, Advocacy, and Leadership", "Earth and Environmental Sciences", "Economics",
            "Economics and History", "English", "European Studies", "French", "Gender and Sexuality Studies",
            "German Studies", "History", "History of Art", "Integrative Biology", "Jewish Studies",
            "Latin American, Caribbean, and Latinx Studies", "Law, History, and Society", "Mathematics",
            "Medicine, Health, and Society", "Molecular and Cellular Biology", "National Security", "Neuroscience",
            "Philosophy", "Physics", "Political Science", "Psychology", "Public Policy Studies", "Religious Studies",
            "Romance Languages, Cultures, and Diasporas", "Russian Studies", "Sociology", "Spanish",
            "Spanish and Portuguese", "Theatre"],
    },
    "minor": {
        "College of Arts and Science": [
            "African American and Diaspora Studies", "Anthropology", "Arabic Language",
            "Architecture and the Built Environment", "Art", "Asian American and Asian Diaspora Studies",
            "Asian Studies", "Astronomy", "Biological Sciences", "Brazilian Studies", "Caribbean Studies", "Chemistry",
            "Chinese Language and Culture", "Cinema and Media Arts", "Communication of Science and Technology",
            "Communication Studies", "Culture, Advocacy, and Leadership", "Earth and Environmental Sciences",
            "Economics", "Creative Writing", "Literary Studies", "Environmental and Sustainability Studies",
            "European Studies", "French", "Gender and Sexuality Studies", "German Studies", "History",
            "History of Art", "Islamic Studies", "Italian Studies", "Japanese Language and Culture", "Jewish Studies",
            "Korean Language and Culture", "Latin American and Latinx Studies", "Mathematics",
            "Medicine, Health, and Society", "Mediterranean Archaeology", "Mediterranean Studies", "Museum Studies",
            "Nanoscience and Nanotechnology", "National Security", "Neuroscience", "Philosophy", "Physics",
            "Political Economy", "Political Science", "Portuguese", "Psychology",
            "Quantum Information Science and Engineering", "Religious Studies", "Russian Studies",
            "Scientific Computing", "Sociology", "South Asian Language and Culture", "Spanish",
            "Spanish for the Professions", "Theatre"],
        "Blair School of Music": ["Music Composition", "Music", "Music Performance", "Musicology"],
        "College of Connected Computing": ["Computer Science", "Computing Society", "Data Science", "Generative AI",
                                           "Scientific Computing"],
        "School of Engineering": ["Digital Fabrication", "Electrical and Computer Engineering",
                                  "Energy and Environmental Systems", "Engineering Management",
                                  "Environmental Engineering", "Innovation and Design Strategy",
                                  "Materials Science and Engineering", "Nanoscience and Nanotechnology",
                                  "Nuclear Energy Systems"],
        "Peabody College": ["Child Development", "Child Psychology and Mental Health", "Cognitive Studies",
                            "Educational Studies", "Human and Organizational Development", "Language Sciences",
                            "Multilingual and Multicultural Studies", "Quantitative Methods", "Literacy Education",
                            "Special Education", "Teaching Linguistically Diverse Students"],
        "Owen (Business)": ["Business"],
        "Law School": ["Legal Studies"],
    },
}
STOP = {"and", "the", "of", "in", "for", "a"}
FACT = "https://admissions.vanderbilt.edu/academics/fact-sheet/?program="
FACT_IDS = {"AI Design and Practice": 1265, "Data Science": 1266, "National Security": 1267, "Music Education": 1225,
            "Music Performance": 1100, "Music Composition": 1098, "Jazz Studies": 1209, "Musical Arts": 1205,
            "Music Integrated Studies": 1101, "Language Sciences": 1244, "English": 1037,
            "Romance Languages, Cultures, and Diasporas": 1264, "Integrative Biology": 1245,
            "Molecular and Cellular Biology": 1122, "Climate and Environmental Studies": 1226}
LISTS = {"major": "https://admissions.vanderbilt.edu/major/", "minor": "https://admissions.vanderbilt.edu/academics/minors/"}
SYN = [("artificial intelligence", "ai"), ("literature", "literary studies"), ("+", " "),
       ("environmental and sustainability studies", "climate and environmental studies"),
       ("museum and market studies", "museum studies"), ("reading/literacy", "literacy")]


def toks(s):
    s = s.lower().replace("&", "and")
    for a, b in SYN:
        s = s.replace(a, b)
    return {t for t in re.sub(r"[^a-z0-9 ]", " ", s).split() if t not in STOP}


def matches(t, h):
    return bool(h) and (t <= h or (len(h) >= 2 and h <= t))


def official_link(name, kind):
    return FACT + str(FACT_IDS[name]) if kind == "major" and name in FACT_IDS else LISTS[kind]


def main():
    progs = json.load(open(D / "programs.json"))
    missing = {"major": [], "minor": []}
    for kind, schools in OFFICIAL.items():
        have = [toks(p["subject"]) for p in progs if p["kind"] == kind and not p.get("placeholder")]
        for school, names in schools.items():
            for n in names:
                if not any(matches(toks(n), h) for h in have):
                    missing[kind].append(f"{n} ({school})")
    json.dump(OFFICIAL, open(D.parent / "official_programs.json", "w"), indent=2)
    total = {k: sum(len(v) for v in s.values()) for k, s in OFFICIAL.items()}
    for kind in ("major", "minor"):
        print(f"{kind.upper()}S: {total[kind] - len(missing[kind])} of {total[kind]} official found in the catalog")
        for m in missing[kind]:
            print(f"   NOT IN CATALOG (advisor links the official page instead): {m}")
    print(f"AUDIT_MISSING_MAJORS={len(missing['major'])} AUDIT_MISSING_MINORS={len(missing['minor'])}")


if __name__ == "__main__":
    main()
