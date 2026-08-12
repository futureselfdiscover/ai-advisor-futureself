"""
Turns scraped JSON into a flat list of embed-ready chunks.

Usage:
    python chunking.py --course-catalog course_catalog.json \\
                        --degree-requirements degree_requirements.json \\
                        --student-orgs student_orgs.json \\
                        --out chunks.json
"""

import argparse
import json
from pathlib import Path


def chunk_text(text, max_words=200, overlap_words=30):
    words = text.split()
    if len(words) <= max_words:
        return [text.strip()] if text.strip() else []

    chunks = []
    start = 0
    while start < len(words):
        end = start + max_words
        chunk = " ".join(words[start:end])
        chunks.append(chunk.strip())
        start = end - overlap_words
        if start <= 0:
            break

    return [c for c in chunks if c]


def chunk_course_catalog(courses):
    chunks = []
    for course in courses:
        content = f"{course['code']}: {course['title']}. {course.get('description', '')}"
        for piece in chunk_text(content, max_words=200):
            chunks.append(
                {
                    "source_type": "course_catalog",
                    "content": piece,
                    "metadata": {
                        "code": course["code"],
                        "title": course["title"],
                    },
                }
            )
    return chunks


def chunk_degree_requirements(sections):
    chunks = []
    for section in sections:
        pieces = chunk_text(section["requirement_text"], max_words=250, overlap_words=40)
        for piece in pieces:
            chunks.append(
                {
                    "source_type": "degree_requirements",
                    "content": piece,
                    "metadata": {
                        "department": section["department"],
                        "degree_type": section["degree_type"],
                    },
                }
            )
    return chunks


def chunk_student_orgs(orgs):
    chunks = []
    for org in orgs:
        content = f"{org.get('name', 'Unknown org')}: {org.get('description', '') or 'No description available.'}"
        for piece in chunk_text(content, max_words=200):
            chunks.append(
                {
                    "source_type": "student_org",
                    "content": piece,
                    "metadata": {
                        "name": org.get("name"),
                        "category": org.get("category"),
                        "profile_url": org.get("profile_url"),
                    },
                }
            )
    return chunks


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--course-catalog")
    parser.add_argument("--degree-requirements")
    parser.add_argument("--student-orgs")
    parser.add_argument("--out", default="chunks.json")
    args = parser.parse_args()

    all_chunks = []

    if args.course_catalog and Path(args.course_catalog).exists():
        courses = json.loads(Path(args.course_catalog).read_text())
        course_chunks = chunk_course_catalog(courses)
        all_chunks.extend(course_chunks)
        print(f"Course catalog: {len(courses)} courses -> {len(course_chunks)} chunks")

    if args.degree_requirements and Path(args.degree_requirements).exists():
        sections = json.loads(Path(args.degree_requirements).read_text())
        req_chunks = chunk_degree_requirements(sections)
        all_chunks.extend(req_chunks)
        print(f"Degree requirements: {len(sections)} sections -> {len(req_chunks)} chunks")

    if args.student_orgs and Path(args.student_orgs).exists():
        orgs = json.loads(Path(args.student_orgs).read_text())
        org_chunks = chunk_student_orgs(orgs)
        all_chunks.extend(org_chunks)
        print(f"Student orgs: {len(orgs)} orgs -> {len(org_chunks)} chunks")

    Path(args.out).write_text(json.dumps(all_chunks, indent=2))
    print(f"\nTotal: {len(all_chunks)} chunks written to {args.out}")


if __name__ == "__main__":
    main()


def chunk_career_center(pages):
    chunks = []
    for page in pages:
        for piece in chunk_text(page["content"], max_words=200):
            chunks.append(
                {
                    "source_type": "career_center",
                    "content": piece,
                    "metadata": {
                        "title": page["title"],
                        "url": page["url"],
                    },
                }
            )
    return chunks
