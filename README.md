# Access Granted

NYC subway accessibility, explained in plain language. A solo AI Community Sprint project by Melissa Noel.

## What works

- Search 12 selected station locations/complexes by name, line or borough.
- Read independently usable station cards, documented entrance locations, service/direction flags, sources and dates.
- Switch between light mode and the approved near-black dark mode. Only the appearance preference persists on the device.
- Ask Gemini about the selected record through a server-side API. Request and response validation use Zod. Cards stay available if AI is unavailable.
- Try a clearly labeled, separately stored **sample outage for demonstration**. It never changes factual station records.

## Run locally

Use Node.js 22 or newer and pnpm. From this repository:

```sh
pnpm install --ignore-scripts
cp .env.example .env
# Add your key privately in .env; never commit it.
pnpm start
```

Open `http://127.0.0.1:8770`. No Gemini key is needed for station cards or the sample scenario. `GEMINI_API_KEY` enables AI; `GEMINI_MODEL` is an optional model identifier, never a replacement for the key. The default model alias is `gemini-3.5-flash-lite`.

## Deploy to Vercel

1. Push this repository to GitHub and import `nyc-transit-accessibility-companion` into Vercel.
2. Use the **Express** framework preset and repository root. No frontend build command is required. Static files are in `public/`; `server.js` exports the Express application.
3. In Vercel Environment Variables, privately add `GEMINI_API_KEY` for Production and Preview. Optionally set `GEMINI_MODEL` if your key needs a different supported Gemini model.
4. Deploy. If a secret is added later, redeploy so it is available to the running version.
5. Open the public link in a signed-out browser and on another phone. Check cards, a real AI question, sample labeling and failure states.

No database, Unsplash account or image key is needed for this MVP. No keys are included in the frontend. `.env`, `.vercel`, and dependencies are ignored by Git. The health endpoint returns only whether the Gemini secret is present, never its value. Live Gemini calls must be tested once the key is configured in the chosen environment.

## Where the information comes from

`data/stations.json` contains a dated reference snapshot checked against [MTA Subway Stations on NY Open Data](https://data.ny.gov/Transportation/MTA-Subway-Stations/39hk-dx4f) and the [MTA accessible-station reference](https://www.mta.info/accessibility/stations). Each record carries original station/complex/platform identifiers and provenance dates. `sourceUpdatedAt` belongs to the source; `snapshotVerifiedAt` is the real source-check time. Neither confirms equipment operation.

Coverage: 34 St–Hudson Yards; 145 St serving A/C/B/D; Times Sq–42 St (including its Port Authority connection restrictions); West Farms Sq–E Tremont Av; 149 St–Hostos (the proposed Grand Concourse location); 161 St–Yankee Stadium; Atlantic Av–Barclays Ctr; Jay St–MetroTech; Borough Hall/Court St; Jackson Hts/74 St–Broadway; Court Sq/Court Sq–23 St; Queensboro Plaza.

West Farms Sq and 145 St are not listed ADA accessible in the checked data. Court Sq and Borough Hall/Court St retain service and direction restrictions. The app must never imply that every station or transfer is accessible.

**Not a live-status service or route planner.** Elevator operation, closures, opening hours, and current train service are not checked. The UI links to the [official MTA elevator-status page](https://www.mta.info/elevator-escalator-status). No complete step-free journey is guaranteed. Entrance entry/exit fields remain unknown when the source does not establish them.

Automatic refresh is **not implemented**. `pnpm data:review` compares source flags read-only; it does not update records, stamp a verification date or refresh entrance notes. A future daily process needs validation and durable storage or an automated reviewed data update/redeploy. Failed checks must retain the prior dated snapshot.

## AI and tools

`system.md` supplies the actual runtime system prompt. `src/station-tools.js` implements `search_stations` and `get_station_accessibility`. The search endpoint invokes the first; station selection and the question endpoint invoke the second. The server chooses these read-only tools deterministically; this MVP does not use an autonomous model tool-calling loop. `tool-definitions.json` documents the inputs/outputs.

The selected source record and server-created demonstration mode are passed to Gemini. A question cannot submit its own source record. Replies follow `{ answer, canConfirm, nextStep }`. The server validates replies and adds its own not-checked/demo disclosure. `canConfirm` concerns the specific dated-reference claim, not model confidence or a travel-safety guarantee. Sample mode always returns false. Model output still requires testing and can be wrong; source cards remain the reference.

Questions are limited to 600 characters; at most six history entries are passed, held only in page memory. Changing stations or modes clears the conversation, and stale responses cannot appear under a different station. The app does not deliberately persist/log questions. Hosting and Google may process request metadata/content under their policies; do not enter personal information.

A per-process limiter allows 8 AI requests per minute per IP. On serverless hosting, this is a basic courtesy limit, **not a durable global spending cap**. Before broad public promotion, configure provider quotas and platform-level rate limits. Provider errors are replaced by friendly messages and never returned verbatim.

## Validation and demo

```sh
pnpm check
```

Tests cover source restrictions, aliases, sample isolation, request validation, missing keys, provider failures, output validation, rapid usage and current-condition disclaimers. Provider calls are injected/mocked in tests; successful tests do not prove that a real key is valid.

Manual acceptance: search the tester’s three stations; open an entrance and a restricted direction; switch themes; test mobile and keyboard operation; ask a real station question; switch station mid-question; show sample-outage labeling; demonstrate a friendly failure. Record actual tester feedback rather than marking the teacher’s checklist complete in advance.

The original teacher-provided setup and demo checklists remain unchanged in the MVP planning document. Planning documents are included alongside source; they are not served from `public/`.

## Identity

Original AG route-line SVG; no copied MTA map or logo. Service identifiers use independently styled rectangular labels with familiar transit colors, not imported official artwork. An independent class project, not affiliated with or endorsed by MTA. Review [MTA licensing guidance](https://www.mta.info/developers) before using official maps/symbols in wider publication.
