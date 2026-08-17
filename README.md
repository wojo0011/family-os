# Family OS

A private, personalized family operating system built around time. The calendar is the primary surface; weather, astronomy, household responsibilities, health records, bills, vehicles, pets and milestones appear only when they matter.

## First release

- Responsive React + TypeScript dashboard and month calendar.
- Family lenses for Dad, Mom, Teen, Child and Family.
- Weather embedded in calendar tiles using the OpenWeather integration pattern from `wojtekmatwiejczyk.ca`, with Open-Meteo fallback.
- Canadian/Ontario holiday theme engine.
- Browser-side Moon phase, next Moon quarter and eclipse calculations with Astronomy Engine.
- Google Identity Services token flow with no client secret and access tokens kept in memory.
- Google Calendar discovery/event loading and Google Drive `appDataFolder` preference-vault wiring.
- Health, Money, Home, Vehicles, Pets and Memories domain shells.
- Chart.js utility-spend visualization.
- Lazy browser OCR receipt scanning with Tesseract.js and mandatory human confirmation.
- Motion animations with reduced-motion support.
- Vitest coverage for core calendar and holiday rules.
- GitHub Actions CI + Pages deployment.

## Privacy boundaries

Family OS does **not** commit family events, medical records, receipts, addresses or bills to this public repository. Google Calendar is the private scheduling store. Permissioned Google Drive is the intended structured-data vault. Demo data is in-memory and clearly identified as demo.

Health features record facts and reminders; they do not diagnose, recommend medication, or change prescription directions. Finance features do not store bank passwords or card credentials. Receipt images are not persisted by default.

## Google Cloud setup

1. Create/select a Google Cloud project.
2. Enable **Google Calendar API** and **Google Drive API**.
3. Configure the Google Auth Platform consent screen for the intended family accounts.
4. Create an **OAuth 2.0 Web application** client.
5. Add `http://localhost:5173` for local development.
6. Add `https://wojo0011.github.io` as the deployed JavaScript origin.
7. Add repository variable `VITE_GOOGLE_CLIENT_ID` containing the Web client ID.
8. Optionally add repository secret `VITE_OPENWEATHER_API_KEY`. Browser-side API keys are visible to clients, so restrict/rotate the key appropriately. Never add a Google client secret.

### Calendar strategy

Create/share calendars such as `Family`, `Dad`, `Mom`, `Teen`, and `Child`. Each signed-in person only receives calendars/events allowed by Google permissions. Family OS combines what that account can access, so private information is permissioned at the source rather than hidden with CSS.

## Development

```bash
npm install
cp .env.example .env
npm run dev
```

Validation:

```bash
npm test
npm run build
```

## Deployment

`.github/workflows/ci-pages.yml` runs tests and builds on pushes/PRs. On `main`, it uploads `dist` and deploys with GitHub Pages Actions. In **Settings → Pages**, select **GitHub Actions** as the source if needed.

## Architecture

```text
GitHub Pages / React
        │
        ├── Google Identity Services
        │       ├── Calendar scopes → Google Calendar
        │       └── drive.appdata → private viewer preferences
        │
        ├── Weather → OpenWeather or Open-Meteo fallback
        ├── Astronomy Engine
        ├── Tesseract.js OCR
        └── Chart.js + Motion
```

> **Family OS should reduce family mental load, never create more of it.**
