# Access Granted

NYC subway accessibility, explained in plain language. A solo AI Community Sprint project by Melissa Noel.

## What works

- Search all 445 station/transfer-complex cards by name, line or any of the five boroughs. The Nov 15, 2026 import covers all 496 GTFS station records (493 distinct MTA station IDs, including 21 Staten Island Railway stations) in the official source. Multiple station/service records in a transfer complex stay together without losing their restrictions.
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

Coverage: all NYC subway and Staten Island Railway station records in the official MTA station and station-complex datasets. Current cards: Manhattan 121, Bronx 68, Brooklyn 156, Queens 79, Staten Island 21. Counts describe transfer-complex cards, not platforms or individual street entrances. Ferries, LIRR, Metro-North, PATH and AirTrain are not included.

`node scripts/import-stations.js` downloads and validates the official station records, complex membership, historical entrance inventory, and MTA accessible-station entrance reference. It requires no AI or paid key. It rejects truncated feeds, duplicate GTFS IDs, mismatched complex members and an unexpected reference-page structure before replacing the snapshot. Optional `--source-dir PATH` reads previously downloaded source files for reproducible local checks. `data/import-report.json` records source hashes, source dates, coverage and any unmatched entrance references. `data/station-notes.json` preserves reviewed aliases and dated entrance fallbacks. Raw inventory coordinates/types are not interpreted as an accessible path and are excluded from Gemini context.

The November 15 import matches all 147 accessible-reference sections, producing entrance notes for 137 of the 140 cards listed with some accessibility. Middle Village–Metropolitan Av, Rockaway Blvd and Rockaway Park–Beach 116 St have no usable accessible-entrance description in that reference; their cards explicitly keep entrance details unknown. The separate entrance inventory was last updated December 5, 2025, and its original date remains visible. An import date is an automated retrieval/validation time, not a claim that someone physically audited every station. No card implies current equipment operation from station-level ADA flags.

West Farms Sq and 145 St are not listed ADA accessible in the checked data. Court Sq and Borough Hall/Court St retain service and direction restrictions. The app must never imply that every station or transfer is accessible.

**Station reference plus MTA elevator and escalator reports; not a route planner.** `/api/stations/:stationId/equipment` joins MTA equipment and outage feeds by exact station complex and equipment IDs. It includes equipment locations and serves both tabs from one timestamp. It shows current reports and separately labeled upcoming work, the fetch timestamp, and the official MTA link. Successful feeds are cached up to one minute; the page checks on station selection, manual refresh, and every five minutes while visible. Feed failures and stations with no matching equipment remain unknown (particularly important for Staten Island coverage), and no reports never means guaranteed elevator operation. Station reference data, closures, opening hours, and current train service are not automatically refreshed. The AI guide reads the station reference only and directs current-condition questions to the separate status panel. No complete step-free journey is guaranteed. Entrance entry/exit fields remain unknown when the source does not establish them.

Automatic **station-reference** refresh is not implemented. `pnpm data:review` compares source flags read-only; it does not update records, stamp a verification date or refresh entrance notes. A future daily process needs validation and durable storage or an automated reviewed data update/redeploy. Failed checks must retain the prior dated snapshot.

## AI and tools

`system.md` supplies the actual runtime system prompt. `src/station-tools.js` implements `search_stations` and `get_station_accessibility`. The search endpoint invokes the first; station selection and the question endpoint invoke the second. The server chooses these read-only tools deterministically; this MVP does not use an autonomous model tool-calling loop. `tool-definitions.json` documents the inputs/outputs.

The selected source record and server-created demonstration mode are passed to Gemini. A question cannot submit its own source record. Replies follow `{ answer, canConfirm, nextStep }`. The server validates replies and adds its own reference-only/demo disclosure. `canConfirm` concerns the specific dated-reference claim, not model confidence or a travel-safety guarantee. Sample mode always returns false. Model output still requires testing and can be wrong; source cards remain the reference.

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

## Approved interface

The station card starts with an access conclusion, important restrictions, four feature choices, and the AI question area. Wheelchair access and equipment details open on demand; vision and hearing support remain explicitly marked Coming soon. One outlined Close details control returns focus to its feature button. Reduced-motion users skip the brief opening/closing transition. All cards retain source dates. Full-network coverage uses the existing layout. Ferry operations are a separate NYC DOT service and are not included in railway status.

App feedback currently displays `feedback@accessgranted.example`, explicitly labeled as an inactive placeholder. It has no mailto link and collects no messages. The source planning document preserves the teacher’s checklist and historical plan; it is not evidence that real-user testing or presentation submissions have been completed.
