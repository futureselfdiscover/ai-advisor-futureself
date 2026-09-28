p = 'city_explorer.py'
c = open(p).read()

old1 = "jobs {emp}"
new1 = "employed {emp}"

old2 = "- Only 20 metro areas are covered."
new2 = (
    "- The employed number is how many people currently work in that occupation in that city. "
    "It is not the number of open jobs, so never call it openings or jobs available. "
    "Describe it as the size of the job market or the number of people employed.\n"
    "- Only 20 metro areas are covered."
)

ok1 = old1 in c
ok2 = old2 in c
c = c.replace(old1, new1).replace(old2, new2)
open(p, 'w').write(c)
print('table label patched' if ok1 else 'TABLE LABEL PATCH FAILED', '|', 'prompt rule patched' if ok2 else 'PROMPT PATCH FAILED')
