# spacex.digital — build summary

**What it is:** an independent, unofficial **live SpaceX mission tracker & data hub** for the owned domain
`spacex.digital`. Mission-control aesthetic, real data, genuinely interactive. Self-contained static site
(no build step, no server) — deploy the folder as-is.

**Path:** `clients/spacex-digital/website/home-v1/` · `index.html` + `styles.css` + `app.js` + `assets/`

## Sections (a bento data-hub, not a marketing skeleton)
1. **Hero — live T‑minus countdown** to the next scheduled launch (mission, vehicle, pad, orbit, window, GO/TBD badge), ticking every second over a cinematic night-launch hero.
2. **The record** — animated stat bento: 699 launches · 97.9% success · 184 consecutive · 604 Falcon 9 flights · manifest · since 2002.
3. **The fleet** — to‑scale SVG silhouettes (Falcon 9 · Falcon Heavy · Starship 123 m) + an **interactive comparison** (Height / Payload→LEO / Thrust / Flights) + boxed spec cards.
4. **Launch cadence** — the exponential ramp, 2→134 orbital launches/yr (2010–2024).
5. **Flight log** — searchable / filterable explorer of 48+ real upcoming & recent missions, webcast links.
6. **Milestones** — 2002 → 2024 timeline.
7. **FAQ** — honest Q&A (schema‑mirrored `FAQPage`).
8. **About** — Earth‑from‑orbit CTA band + the independent/unofficial disclaimer + data sources.

## Data — real, live, honest
- **Source:** The Space Devs **Launch Library 2** (`ll.thespacedevs.com`, CC BY 4.0, no key, CORS `*`). SpaceX LSP id 121.
- **Model:** a baked snapshot (`assets/data/spacex-data.json`) paints instantly and is the offline fallback; the browser then **refreshes live** (localStorage‑cached ~30 min) and stamps an honest "as of" time. Live figures come from the API; historical cadence & milestones are public record, source‑noted. **No fabricated or placeholder data anywhere** — real data or a labeled empty state.
- **Refresh the snapshot anytime:** `python scripts/build-data.py` (re-pulls live, rewrites the JSON).

## Interactivity
Live countdown · animated count‑ups · metric‑toggle rocket comparison · animated cadence chart ·
search + filter flight log · hero starfield (perf‑capped, pauses off‑screen) · a hidden **launch‑sequence
easter egg** (type `LAUNCH` or the Konami code → 3‑2‑1‑liftoff). All reduced‑motion‑safe.

## Quality
- AA contrast verified by math on **every** text/background pair (worst case 4.9:1).
- Responsive: measured **zero horizontal overflow at 390 px**; clean at 480/768/1280.
- Fresh type trio (Space Grotesk · JetBrains Mono · Hanken Grotesk) — not reused from prior builds.
- Self‑scored **~93/100** vs the agency DESIGN‑BAR (ship gate 90).

## TODO (pre‑publish — owner decisions)
- **Trademark posture (owner call):** the site is framed unmistakably as *independent / unofficial* with
  disclaimers top‑area + footer, its own wordmark, no official SpaceX logo, and full data attribution — the
  defensible posture for a fan/informational site. Confirm you're comfortable publishing under the SpaceX
  name on `spacex.digital`. (Not legal advice.)
- **Snapshot freshness:** for a high‑traffic day, run `build-data.py` on a schedule (or a tiny cron) so the
  instant‑paint snapshot stays current; live refresh already keeps active visitors up to date.
- Optional: add analytics, a privacy/contact page, and a real favicon PNG set if desired.

## Deploy
Static — push the folder to Vercel/Netlify/any host and point `spacex.digital` at it. No env, no build.
