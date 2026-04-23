"""
Compare WOTC's Avatar Jumpstart theme decklists (scraped from the raw
announcement HTML) against our seed data in lib/ev-jumpstart-tla.ts.

Prints a per-theme diff:
  MISSING     — card listed by WOTC but not in our seed for this theme
  EXTRA       — card in our seed but not in WOTC for this theme (should
                be rare: only the appended Appa basic)

Ignores WOTC's "6 Plains / 1 Plains Appa" style basic entries; we map
those to the single added basic per theme.
"""

import re, html, sys, io, json, os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ── Load WOTC HTML and extract readable text ──────────────────────────
with open("./tla_wotc.html", "r", encoding="utf-8") as f:
    doc = f.read()
doc = re.sub(r"<script[\s\S]*?</script>", "", doc, flags=re.IGNORECASE)
doc = re.sub(r"<style[\s\S]*?</style>", "", doc, flags=re.IGNORECASE)
doc = re.sub(r"<br\s*/?>", "\n", doc, flags=re.IGNORECASE)
doc = re.sub(r"</(p|h1|h2|h3|h4|h5|li|tr|div|td|section|header)>", "\n", doc, flags=re.IGNORECASE)
doc = re.sub(r"<(h[1-5])[^>]*>", "\n\n### ", doc, flags=re.IGNORECASE)
doc = re.sub(r"<[^>]+>", "", doc)
doc = html.unescape(doc)
doc = re.sub(r"[​‌]", "", doc)
lines = [l.strip() for l in doc.splitlines() if l.strip()]
text = "\n".join(lines)

# ── Parse WOTC themes ─────────────────────────────────────────────────
# Each theme starts with a line like "0001_MTGTLA_JSTheme: Aang Jumpstart Theme Card"
# Cards follow, one per line, until the next theme header.
THEME_HEADER_RE = re.compile(
    # Permissive: WOTC's own HTML has variants like "Librarian Theme Card Card"
    # (broken copy) vs the standard "Foo Jumpstart Theme Card". Accept either.
    r"^\d{4}_MTGTLA_JSTheme:\s+(.+?)\s+(?:Jumpstart\s+)?Theme\s+Card(?:\s+Card)?\s*$"
)
# Basic land lines come in two forms:
#   "6 Plains [hash]"
#   "Plains Appa [hash]"    ← no leading count, just the variant label
BASIC_LAND_LINE_RE = re.compile(
    r"^(?:\d+\s+)?(Plains|Island|Swamp|Mountain|Forest)(?:\s+Appa)?\s*(?:\[[^\]]*\])?\s*$"
)
# Stop parsing when we hit obvious page-footer content. Only used AFTER
# the first theme has been recognised (the word "Announcements" also
# appears in the top nav).
TERMINATORS = ("Find a store", "Club Support", "简体中文", "Announcements", "Yip yip!")

wotc_themes = []  # list of (name, cards: set[str])
current = None
done = False
for line in text.splitlines():
    if done:
        break
    # Only honour terminators once parsing has started — "Find a store"
    # and "Announcements" appear in the page header too.
    if current is not None:
        for term in TERMINATORS:
            if line.startswith(term):
                done = True
                break
    if done:
        break
    m = THEME_HEADER_RE.match(line)
    if m:
        if current:
            wotc_themes.append(current)
        current = {"name": m.group(1).strip(), "cards": []}
        continue
    if current is None:
        continue
    # Skip WOTC's basic-land count lines; we handle basics separately
    if BASIC_LAND_LINE_RE.match(line):
        continue
    # Skip anything that isn't a plausible card name
    if len(line) < 3 or line.startswith("###"):
        continue
    if line in ("White", "Blue", "Black", "Red", "Green", "Multicolor"):
        continue
    # Heuristic: skip footer boilerplate. Match whole-phrase, not substring —
    # "Coast" as substring would strip the legit card "Coastal Piracy".
    if line.startswith("Magic: The Gathering") or line.startswith("Wizards of the Coast"):
        continue
    # Allow the card name
    current["cards"].append(line)
if current:
    # The final-append was inside the loop; avoid double-append
    if not wotc_themes or wotc_themes[-1] is not current:
        wotc_themes.append(current)

print(f"Parsed {len(wotc_themes)} theme blocks from WOTC HTML.\n")

# Debug: uncomment to dump a specific theme
if os.environ.get("DEBUG_THEME"):
    target = os.environ["DEBUG_THEME"]
    for t in wotc_themes:
        if t["name"] == target:
            print(f"\n[DEBUG] WOTC {t['name']} cards:")
            for c in t["cards"]:
                print(f"    - {c}")

# Group variants: consecutive entries with the same name are variants 1, 2, ...
wotc_by_key = {}  # key = "name#variant" → cards list
name_count = {}
for t in wotc_themes:
    n = t["name"]
    name_count[n] = name_count.get(n, 0) + 1
    key = f"{n}#{name_count[n]}"
    wotc_by_key[key] = t["cards"]

# ── Parse seed file ───────────────────────────────────────────────────
with open("./lib/ev-jumpstart-tla.ts", "r", encoding="utf-8") as f:
    seed_src = f.read()

# Capture each theme object: name, variant, cards
THEME_OBJ_RE = re.compile(
    r'\{\s*name:\s*"([^"]+)",\s*variant:\s*(\d+),\s*color:\s*"[^"]+",\s*tier:\s*"[^"]+",\s*cards:\s*\[([^\]]*)\],?\s*\}',
    re.DOTALL,
)
seed_by_key = {}
for m in THEME_OBJ_RE.finditer(seed_src):
    name, variant, raw_cards = m.group(1), int(m.group(2)), m.group(3)
    names = re.findall(r'"((?:\\.|[^"\\])*)"', raw_cards)
    seed_by_key[f"{name}#{variant}"] = names

print(f"Parsed {len(seed_by_key)} theme variants from seed file.\n")

# The basic lands we added to each theme as the "Appa" placeholder.
APPA_BASIC_NAMES = {"Plains", "Island", "Swamp", "Mountain", "Forest"}

# ── Diff ──────────────────────────────────────────────────────────────
# Iterate in seed order (by name+variant). Report every diff.
all_good = True
for key in sorted(seed_by_key.keys()):
    seed_cards = seed_by_key[key]
    wotc_cards = wotc_by_key.get(key)
    if wotc_cards is None:
        print(f"[NO-WOTC-MATCH] {key}  — no corresponding WOTC theme entry found")
        all_good = False
        continue

    seed_set = set(seed_cards)
    wotc_set = set(wotc_cards)

    # Normalize WOTC names by restoring commas where WOTC dropped them.
    # Strategy: if a WOTC name doesn't match any seed name exactly but
    # there's a seed name whose lowercase-no-punct form matches, accept.
    def _norm(s):
        return re.sub(r"[^a-z0-9' ]", "", s.lower()).replace("  ", " ").strip()

    seed_norm = {_norm(c): c for c in seed_cards}
    wotc_matched_to_seed = set()
    wotc_unmatched = []
    for w in wotc_cards:
        nm = _norm(w)
        if nm in seed_norm:
            wotc_matched_to_seed.add(seed_norm[nm])
        else:
            wotc_unmatched.append(w)

    # Missing = WOTC card not matched to any seed card
    # Extra = seed card not matched to any WOTC card (except our Appa basic)
    missing = wotc_unmatched
    extra = [c for c in seed_cards if c not in wotc_matched_to_seed and c not in APPA_BASIC_NAMES]

    if missing or extra:
        all_good = False
        print(f"=== {key} ===")
        if missing:
            print(f"  MISSING ({len(missing)}): {missing}")
        if extra:
            print(f"  EXTRA   ({len(extra)}): {extra}")

if all_good:
    print("✅ Every seed theme matches its WOTC decklist exactly (modulo basic-land collapse to one Appa entry).")
else:
    print("\n❌ Diffs found above — fix the seed and re-run.")
