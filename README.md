# Family OS

A private, personalized family operating system built around time. The calendar is the primary surface; weather, astronomy, household responsibilities, health records, bills, vehicles, pets and milestones appear only when they matter.

## First release

- Responsive React + TypeScript dashboard and month calendar.
- Family lenses for Dad, Mom, Teen, Child and Family.
- Weather embedded in calendar tiles using the OpenWeather integration pattern from `wojtekmatwiejczyk.ca`, with Open-Meteo fallback.
- Canadian/Ontario holiday theme engine.
- Browser-side Moon phase, next Moon quarter and eclipse calculations with Astronomy Engine.
- Google Identity Services browser token flow with no client secret and access tokens kept in memory only.
- Connected Google account state, token-expiry/reconnect handling, scope visibility and token revocation on disconnect.
- Google Calendar discovery/event loading.
- Incremental Google authorization for Contacts / People and Drive `appDataFolder`; provider/contact sync and Family Vault persistence are separate follow-up integrations.
- Health, Money, Home, Vehicles, Pets and Memories domain modules.
- GitHub Actions CI + Pages deployment, including a mocked Google OAuth lifecycle smoke test against the deployed site.

## Privacy boundaries

Family OS does **not** commit family events, medical records, receipts, addresses or bills to this public repository. Google Calendar is the private scheduling source for connected calendar data. Permissioned Google Drive is the intended future structured-data vault. Demo and local-first records remain in the browser until a cloud adapter is explicitly implemented.

Google OAuth access tokens are never written to localStorage or sessionStorage. They exist only in JavaScript memory and expire. A small non-token account display hint may be kept in sessionStorage for the current browser tab. When Google access expires, Family OS asks the user to reconnect. Disconnect revokes the active Google token and reloads the local app state.

Health features record facts and reminders; they do not diagnose, recommend medication, or change prescription directions. Finance features do not store bank passwords or card credentials. Receipt images are not persisted by default.

## Google Cloud setup

1. Create/select a Google Cloud project.
2. Enable **Google Calendar API**.
3. Enable **Google People API** before using Contacts/provider authorization.
4. Enable **Google Drive API** before using Family Vault / Drive app-data authorization.
5. Configure the Google Auth Platform consent screen for the intended family accounts.
6. Create an **OAuth 2.0 Web application** client.
7. Add `http://localhost:5173` as an authorized JavaScript origin for local development.
8. Add `https://wojo0011.github.io` as the deployed authorized JavaScript origin.
9. Add repository variable `VITE_GOOGLE_CLIENT_ID` containing the Web client ID.
10. Optionally add repository secret `VITE_OPENWEATHER_API_KEY`. Browser-side API keys are visible to clients, so restrict/rotate the key appropriately. Never add a Google client secret.

### Static GitHub Pages auth model

Family OS intentionally uses the Google Identity Services **token model** because the application is hosted as a static GitHub Pages site. There is no refresh token or server-side session. The browser receives a short-lived access token, Family OS keeps it in memory, and the user reconnects when it expires.

Initial Google connection requests identity plus Calendar access. Contacts and Drive app-data permissions are requested separately from the connected-account menu only when the user chooses to enable them.

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
        │       ├── in-memory access token + reconnect/revoke lifecycle
        │       ├── Calendar scopes → Google Calendar
        │       ├── incremental Contacts scope → future provider sync
        │       └── incremental drive.appdata scope → future Family Vault adapter
        │
        ├── Weather → OpenWeather or Open-Meteo fallback
        └── Astronomy Engine
```

> **Family OS should reduce family mental load, never create more of it.**
