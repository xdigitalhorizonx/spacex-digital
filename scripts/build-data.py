#!/usr/bin/env python3
"""
spacex.digital — data builder.
Pulls LIVE, real SpaceX data from The Space Devs' Launch Library 2 (LL2) and merges a
small block of curated public-record facts (milestones, engine counts). Writes a single
snapshot the site paints instantly from; the site ALSO refreshes live in the browser.

Re-run any time to refresh the baked snapshot:
    python build-data.py
Source: https://thespacedevs.com  (LL2, CC BY 4.0)  |  SpaceX LSP id = 121
No API key required. Uses the dev mirror (higher limit, ~day-cached) for the build;
the browser hits the same API live with localStorage caching + this snapshot as fallback.
"""
import json, urllib.request, urllib.parse, time, os, sys

BASE = "https://lldev.thespacedevs.com/2.2.0"
LSP = 121
UA = {"User-Agent": "spacex.digital-databuild/1.0 (independent tracker)"}
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "data", "spacex-data.json")

def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(3)

def img_of(l):
    img = l.get("image")
    if isinstance(img, dict): return img.get("image_url") or img.get("thumbnail_url")
    return img

def slim(l):
    rocket = ((l.get("rocket") or {}).get("configuration") or {})
    mission = (l.get("mission") or {})
    orbit = (mission.get("orbit") or {})
    pad = (l.get("pad") or {})
    loc = (pad.get("location") or {})
    status = (l.get("status") or {})
    vid = l.get("vidURLs") or []
    return {
        "id": l.get("id"), "name": l.get("name"),
        "status": status.get("name"), "status_abbrev": status.get("abbrev"),
        "net": l.get("net"), "window_start": l.get("window_start"), "window_end": l.get("window_end"),
        "rocket": rocket.get("name"), "rocket_full": rocket.get("full_name"),
        "mission": mission.get("name"), "mission_type": mission.get("type"),
        "mission_desc": (mission.get("description") or "")[:420],
        "orbit": orbit.get("name"), "orbit_abbrev": orbit.get("abbrev"),
        "pad": pad.get("name"), "location": loc.get("name"),
        "image": img_of(l), "failreason": (l.get("failreason") or "")[:240],
        "webcast": (vid[0].get("url") if vid else None),
    }

def launcher(cid, engines, engine_name, crew=None, notes=None):
    d = get(f"{BASE}/config/launcher/{cid}/")
    return {
        "id": d.get("id"), "name": d.get("name"), "full_name": d.get("full_name"),
        "length": d.get("length"), "diameter": d.get("diameter"), "max_stage": d.get("max_stage"),
        "launch_mass": d.get("launch_mass"), "leo_capacity": d.get("leo_capacity"),
        "gto_capacity": d.get("gto_capacity"), "to_thrust": d.get("to_thrust"),
        "total_launch_count": d.get("total_launch_count"), "successful_launches": d.get("successful_launches"),
        "consecutive_successful_launches": d.get("consecutive_successful_launches"),
        "failed_launches": d.get("failed_launches"), "maiden_flight": d.get("maiden_flight"),
        "reusable": d.get("reusable"), "engines": engines, "engine_name": engine_name,
        "crew": crew, "notes": notes,
    }

out = {
    "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "source": "The Space Devs — Launch Library 2 (CC BY 4.0), thespacedevs.com",
    "api_base": "https://ll.thespacedevs.com/2.2.0",  # browser uses prod; build used dev mirror
    "disclaimer": "Independent, unofficial project. Not affiliated with or endorsed by Space Exploration Technologies Corp.",
}

print("agency…")
ag = get(f"{BASE}/agencies/121/")
succ, fail = ag.get("successful_launches") or 0, ag.get("failed_launches") or 0
total_done = succ + fail
out["stats"] = {
    "founding_year": ag.get("founding_year"),
    "total_launch_count": ag.get("total_launch_count"),
    "successful_launches": succ, "failed_launches": fail,
    "pending_launches": ag.get("pending_launches"),
    "consecutive_successful_launches": ag.get("consecutive_successful_launches"),
    "success_rate": round(100.0 * succ / total_done, 1) if total_done else None,
}

print("upcoming…"); time.sleep(1)
up = get(f"{BASE}/launch/upcoming/?lsp__id={LSP}&limit=8&mode=detailed")
out["upcoming"] = [slim(l) for l in up.get("results", [])]
out["upcoming_count"] = up.get("count")

print("previous…"); time.sleep(1)
pv = get(f"{BASE}/launch/previous/?lsp__id={LSP}&limit=40&mode=detailed")
out["previous"] = [slim(l) for l in pv.get("results", [])]
out["previous_count"] = pv.get("count")

print("launchers…")
out["launchers"] = {}
time.sleep(1); out["launchers"]["falcon9"]    = launcher(164, 9,  "Merlin 1D", crew=None,
    notes="Workhorse two-stage rocket. First-stage booster returns and lands for reuse.")
time.sleep(1); out["launchers"]["falconheavy"] = launcher(161, 27, "Merlin 1D", crew=None,
    notes="Three Falcon 9 first stages strapped together — the most powerful operational rocket by twin-booster recovery.")
time.sleep(1); out["launchers"]["starship"]    = launcher(527, 33, "Raptor 2", crew=None,
    notes="Fully reusable super-heavy launch system in flight testing. Booster returns to the tower.")
# Starship is in flight testing — keep both the demonstrated (current V2) and design figures, clearly labeled.
out["launchers"]["starship"]["design_leo_capacity"] = 100000   # design target to LEO (fully reusable)
out["launchers"]["starship"]["status_label"] = "In flight testing"
out["launchers"]["starship"]["height_note"] = "Tallest and most powerful rocket ever flown."

# Launch cadence — public-record orbital launches per year (Falcon family + Starship
# orbital attempts). LL2's launch collection only holds recent records, so the famous
# ramp comes from public record (Wikipedia: List of Falcon 9 and Falcon Heavy launches).
# Complete years only (through 2024) to avoid partial-year distortion.
print("annual cadence (public record)…")
out["launches_per_year"] = {
    "2010": 2, "2012": 2, "2013": 3, "2014": 6, "2015": 7, "2016": 8,
    "2017": 18, "2018": 21, "2019": 13, "2020": 26, "2021": 31,
    "2022": 61, "2023": 96, "2024": 134,
}
out["launches_per_year_note"] = "Orbital launches per year, 2010–2024 (public record). Source: Wikipedia — List of Falcon 9 and Falcon Heavy launches."

# ---- curated public-record milestones (verifiable; community/public sources) ----
out["timeline"] = [
    {"year":"2002","title":"SpaceX founded","text":"Elon Musk founds Space Exploration Technologies with the goal of making spaceflight radically cheaper — and, ultimately, life multiplanetary."},
    {"year":"2008","title":"Falcon 1 reaches orbit","text":"On its fourth flight, Falcon 1 becomes the first privately developed, liquid-fueled rocket to reach Earth orbit."},
    {"year":"2010","title":"Falcon 9 debuts · Dragon returns from orbit","text":"Falcon 9 flies for the first time, and Dragon becomes the first commercial spacecraft recovered from orbit."},
    {"year":"2012","title":"Dragon berths with the ISS","text":"Dragon becomes the first commercial spacecraft to deliver cargo to the International Space Station."},
    {"year":"2015","title":"First orbital-class landing","text":"A Falcon 9 first stage returns and lands upright at Cape Canaveral — the first orbital-class booster to be recovered intact."},
    {"year":"2017","title":"First re-flight of an orbital booster","text":"A previously flown Falcon 9 booster launches again — turning reusability from a demo into an operating principle."},
    {"year":"2018","title":"Falcon Heavy maiden flight","text":"The most powerful operational rocket of its era debuts, sending a Tesla Roadster toward the asteroid belt and landing two side boosters in sync."},
    {"year":"2019","title":"Starlink begins","text":"The first operational Starlink batch launches, starting the largest satellite constellation ever built."},
    {"year":"2020","title":"Crew Dragon flies astronauts","text":"Demo-2 carries NASA astronauts to orbit — the first crewed launch from U.S. soil since 2011 and the first by a commercial spacecraft."},
    {"year":"2021","title":"First all-civilian orbital crew","text":"Inspiration4 flies four private citizens to orbit with no professional astronauts aboard."},
    {"year":"2023","title":"Starship's first integrated flight","text":"The full Starship stack — the largest and most powerful rocket ever built — makes its first integrated test flight."},
    {"year":"2024","title":"Super Heavy caught by the tower","text":"On Flight 5, the launch tower's arms catch the returning Super Heavy booster out of the air — a first in spaceflight."},
]
out["sources"] = [
    {"label":"Launch data — The Space Devs (Launch Library 2)","url":"https://thespacedevs.com"},
    {"label":"SpaceX — Wikipedia","url":"https://en.wikipedia.org/wiki/SpaceX"},
]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("WROTE", os.path.abspath(OUT))
print("stats:", out["stats"])
print("next:", (out["upcoming"] or [{}])[0].get("name"), "@", (out["upcoming"] or [{}])[0].get("net"))
print("years:", out["launches_per_year"])
