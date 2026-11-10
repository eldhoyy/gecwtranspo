# GECW Go

A practical bus and journey planner built for students of Government Engineering College Wayanad.

## Why I built it

I study at GECW, and figuring out which bus to take to campus or home should not mean asking five different people and hoping the timing is right. I built GECW Go to bring the available timetable evidence into one clear place, while being honest when information is incomplete.

## Features

- Search bus journeys by stop name and alias.
- Browse source-backed private-bus and KSRTC timetable evidence.
- See passing stops when the source provides them.
- Official Chalo tracking link only; no direct GPS integration is claimed.
- Mobile-first layout and a PWA manifest.

## Run locally

```bash
npm install
npm run dev
```

Production build: `npm run build`

## Data sources and licences

- [Kerala Private Bus Timing](https://github.com/amith-vp/Kerala-Private-Bus-Timing): public schedule data compiled from RTI-derived material. The upstream project warns of incomplete coverage and possible parsing errors. No explicit licence file was confirmed; check upstream terms before redistribution.
- [Kerala Private Bus Timing API](https://github.com/amith-vp/Kerala-Private-Bus-Timing-API): public route lookup endpoint; no uptime guarantee.
- [KSRTC](https://www.keralartc.com/): published timetable evidence.
- [OpenStreetMap](https://www.openstreetmap.org/copyright): ODbL 1.0, attribution required where used.
- Chalo: official public tracking page link only.

See [/data-sources](/data-sources) for source notes.

## Add a missing bus

Use the report link on a journey result (when available), or open a GitHub issue with the route, time, operator, and evidence. Do not include personal data. An unverified report is a lead, not a published timetable.

## Notes

- A dataset's district coverage does not prove that a particular bus travels to Wayanad.
- Unknown operators are not labelled as private buses.
- Depot departure sheets are reference evidence, not passing-stop timetables.
- Evidebus and MyBusYatra scraping is disabled unless `ENABLE_SCRAPED_SOURCES=true` is set after reviewing their robots.txt and terms.
- Bus times can change. Confirm with the operator before travelling.
