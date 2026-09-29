def patch(path, old, new, label):
    c = open(path).read()
    if old in c:
        open(path, 'w').write(c.replace(old, new))
        print(label, 'patched')
    else:
        print(label, 'PATCH FAILED')


patch(
    'course_planner.py',
    "Be specific about course codes where the data supports it.",
    "Be specific about course codes where the data supports it. Only write a course title if it appears in the requirement info above. If no title is given, write just the course code. Never guess a title from memory.",
    'planner',
)

patch(
    'router.py',
    "f\"{i}. {m['name']}: {m['description'][:200]}\"",
    "f\"{i}. {m['description'][:220]}\"",
    'clubs',
)
