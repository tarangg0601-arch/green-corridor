# Green Corridor — Smart Traffic Management for Emergency Vehicles

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.19.0-brightgreen.svg)](https://nodejs.org)
[![Frontend: React](https://img.shields.io/badge/Frontend-React_18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Backend: Express](https://img.shields.io/badge/Backend-Express_4-lightgrey?logo=express)](https://expressjs.com/)

Green Corridor is an emergency-vehicle traffic-priority demonstration system. It simulates ambulance movement along road routes, estimates arrival times at upcoming signals, and gives an approaching ambulance priority at relevant intersections by changing their simulated state to green. The application also provides custom route planning, two-stage ambulance dispatch, live map updates, police-alert notifications, trip history, and analytics.

> **Project scope:** Green Corridor demonstrates emergency-vehicle coordination in a local web application. Ambulance movement, route progress, and intersection-state changes are modelled by the application for project evaluation and demonstration.

---

## Contents

- [Problem and objective](#problem-and-objective)
- [Features](#features)
- [How the system works](#how-the-system-works)
- [Technology stack](#technology-stack)
- [Project structure](#project-structure)
- [Run the project locally](#run-the-project-locally)
- [Environment configuration](#environment-configuration)
- [Tests and production build](#tests-and-production-build)
- [API reference](#api-reference)
- [Seed data](#seed-data)
- [External services and attribution](#external-services-and-attribution)
- [Runtime and deployment notes](#runtime-and-deployment-notes)
- [Troubleshooting](#troubleshooting)
- [Development notes](#development-notes)
- [License](#license)

## Problem and objective

Emergency vehicles can lose valuable time in congested urban traffic. A coordinated green corridor can help reduce delays by preparing intersections before an emergency vehicle reaches them.

Green Corridor demonstrates this concept in a local web application. A user can start a trip on a predefined corridor, create a custom route between two locations, or call an ambulance to a pickup point. The backend simulates vehicle movement, calculates signal ETAs, applies signal priority, and sends real-time updates to the frontend.

The purpose of the project is to demonstrate the software workflow and coordination logic behind an emergency traffic-priority system. It is not a replacement for a real traffic-management or emergency-dispatch platform.

## Features

### Emergency trips and ambulance dispatch

- Start a trip using a predefined route.
- Preview and start a custom A-to-B route.
- Call an ambulance using an address or latitude/longitude coordinates.
- Select the nearest available ambulance based on the registered base-hospital location.
- Route the ambulance from its base to the pickup location, wait for 15 seconds at pickup, and then route it to the nearest configured hospital.
- Track trip phases: `to_pickup`, `at_pickup`, `to_hospital`, and `completed`.
- Cancel an active trip and release the ambulance back to the `idle` state.

### Route planning

- Use Nominatim to convert typed addresses into coordinates.
- Use OSRM to calculate a driving route and return its distance, duration, and geometry.
- Preview a custom route without saving it to the database.
- Save a custom route when the user proceeds to start the trip.
- Generate virtual signal points along custom route geometry.
- Enforce a configurable maximum route distance (default: 25 km).

### Signal priority and alerts

- Calculate the ETA from a simulated ambulance to upcoming signals.
- Trigger emergency green priority when the signal is within the configured ETA threshold (default: 30 seconds).
- Revert priority after the ambulance passes the signal, while considering other trips that may still need it.
- Simulate normal red/green cycling on registered active-trip corridors.
- Suspend normal cycling while emergency priority holds a signal.
- Broadcast alert events to connected dashboard clients over Socket.IO.
- View and acknowledge stored alerts in the dashboard.

### Dashboard, history, and analytics

- View ambulance positions and active trip routes on a Leaflet map.
- See the live state of signals associated with active trips.
- Browse predefined routes and their signal locations.
- Review completed and cancelled trips.
- View signal-priority counts and trip analytics.

### Reliability features

- Serialize external routing and geocoding requests to respect public-service rate limits.
- Apply request timeouts and support cancellation of in-flight routing operations.
- Recover interrupted active trips on backend startup.
- Restore orphaned ambulances to `idle` and reset stale green signal states during recovery.
- Apply non-destructive schema migrations for supported legacy database columns.

## How the system works

### 1. Predefined or custom trip

1. The user selects an idle ambulance.
2. The user chooses a predefined route or enters a start and end address for a custom route.
3. For a custom route, the frontend requests a preview. The backend geocodes the addresses, asks OSRM for a driving route, checks the configured distance limit, and generates virtual signal points.
4. The custom route is persisted when the user starts the trip.
5. The simulation advances the ambulance along the route polyline and calculates ETAs for upcoming signals.

### 2. Emergency ambulance dispatch

The dispatch workflow uses two route legs:

1. **Emergency request:** The user enters a pickup address or coordinates.
2. **Nearest hospital:** The backend finds the configured hospital closest to the pickup point using straight-line (Haversine) distance.
3. **Nearest available ambulance:** The backend considers idle ambulances whose registered base hospital can be resolved, then selects the one closest to the pickup point using the base-hospital coordinates. The ambulance is reserved as `en_route`.
4. **Leg 1 — base to pickup:** OSRM calculates the driving route from the ambulance's base hospital to the pickup point. The backend checks the route-distance limit before creating the dispatch trip and route signals.
5. **Pickup wait:** On arrival, the trip enters `at_pickup` and waits 15 seconds to represent patient boarding.
6. **Leg 2 — pickup to hospital:** The backend calculates the route from the pickup point to the selected hospital. If routing fails or the configured distance limit is exceeded, the trip is terminated safely and the ambulance is released.
7. **Completion:** On arrival at the hospital, the trip is marked `completed` and the ambulance returns to `idle`.

### 3. Signal ETA and priority

The simulation periodically advances the ambulance along its route. For each upcoming signal, ETA is calculated from the remaining route distance and configured simulation speed:

\[
\text{ETA (seconds)} = \frac{\text{Distance to signal (km)}}{\text{Speed (km/h)} / 3600}
\]

When the ETA is within `PRIORITY_THRESHOLD_SECONDS`, the signal is given emergency priority and an alert event is broadcast. After the ambulance passes, the priority hold is released unless another active trip still requires the same signal.

Normal signal cycling is a separate simulation service. It operates on signals registered to active trip routes, with emergency priority taking precedence over the normal cycle.

## Technology stack

| Area | Technologies |
|---|---|
| Frontend | React 18, Vite 5, React Router, Tailwind CSS |
| Map | Leaflet, React-Leaflet, OpenStreetMap tiles |
| Charts | Recharts |
| HTTP client | Axios |
| Backend | Node.js, Express 4 |
| Real-time updates | Socket.IO |
| Database | SQLite through `sql.js` |
| External routing | OpenStreetMap Nominatim and OSRM |
| Tests | Node.js built-in test runner (`node:test`, `node:assert`) |

## Project structure

```text
green-corridor/
├── backend/
│   ├── data/                  # Created at runtime; local SQLite database
│   ├── src/
│   │   ├── config.js          # Environment-based configuration
│   │   ├── index.js           # Express and Socket.IO server bootstrap
│   │   ├── controllers/       # API request handlers
│   │   ├── db/                # Database connection, schema, migrations, seed data
│   │   ├── models/            # Database access functions
│   │   ├── routes/            # Express route definitions
│   │   ├── services/          # Simulation, ETA, signal cycling, routing, geocoding
│   │   └── utils/             # Geographic helpers, request queues, logging
│   ├── tests/                 # Backend automated tests
│   ├── .env.example
│   ├── package.json
│   └── package-lock.json
├── frontend/
│   ├── src/
│   │   ├── api/               # REST API helpers
│   │   ├── components/        # Reusable UI and map components
│   │   ├── hooks/             # WebSocket and application hooks
│   │   ├── pages/             # Dashboard, ambulances, routes, history, analytics
│   │   └── utils/             # Frontend helpers
│   ├── tests/                 # Frontend helper tests
│   ├── .env.example
│   ├── package.json
│   └── package-lock.json
├── scripts/                   # PowerShell integration/verification scripts
├── .env.example               # Root-level backend environment template
├── FEATURES.md                # Implemented features and extension points
├── LICENSE
└── README.md
```

## Run the project locally

The frontend and backend run as two separate processes. Keep both terminals open while using the application.

### Prerequisites

- **Git** to clone the repository.
- **Node.js:** Version `>=18.19.0`, as specified by the backend package. A currently supported Node.js LTS release is recommended.
- **npm:** Installed with Node.js.
- **Internet access:** Required for live address geocoding, OSRM driving routes, and OpenStreetMap map tiles.

Check your installed versions:

```bash
node --version
npm --version
git --version
```

### Step 1 — Clone the repository

Open PowerShell, Windows Terminal, macOS Terminal, or a Linux shell and run:

```bash
git clone https://github.com/tarangg0601-arch/green-corridor.git
cd green-corridor
```

### Step 2 — Install backend dependencies

```bash
cd backend
npm ci
```

`npm ci` installs the exact dependency versions recorded in `backend/package-lock.json`.

Create the backend environment file from the template. Do this only if `backend/.env` does not already exist.

**Windows PowerShell:**

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

**macOS / Linux:**

```bash
[ -f .env ] || cp .env.example .env
```

The default backend configuration is suitable for a local run. See [Environment configuration](#environment-configuration) if you need to change ports, database location, simulation speed, or external service URLs.

### Step 3 — Install frontend dependencies

Open a second terminal, or return to the repository root in the current terminal:

```bash
cd ../frontend
npm ci
```

Create the frontend environment file if it does not already exist.

**Windows PowerShell:**

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

**macOS / Linux:**

```bash
[ -f .env ] || cp .env.example .env
```

### Step 4 — Start the backend

Open **Terminal 1** with the current directory set to the cloned `green-corridor` repository root, then run:

```bash
cd backend
npm start
```

For development with Node's watch mode, use:

```bash
npm run dev
```

By default, the API and Socket.IO server listen on:

```text
http://localhost:3001
```

On the first start, the backend creates `backend/data/green_corridor.db`, initializes the schema, and seeds the sample hospitals, ambulances, routes, signals, and checkpoints. The database is stored locally and is not included in the Git repository. Existing local database files are reused on subsequent starts.

Keep this terminal running.

### Step 5 — Start the frontend

Open **Terminal 2** with the current directory set to the cloned `green-corridor` repository root, then run:

```bash
cd frontend
npm run dev
```

Vite prints the local development URL. By default, open:

```text
http://localhost:5173
```

Keep the frontend and backend terminals running together. The frontend uses `VITE_API_URL` for REST requests and `VITE_WS_URL` for Socket.IO connections.

### Step 6 — Check that the backend is responding

With the backend running, open these URLs in a browser:

- `http://localhost:3001/api/ambulances` — sample ambulance records.
- `http://localhost:3001/api/hospitals` — configured hospitals.
- `http://localhost:3001/api/routes` — available routes.
- `http://localhost:3001/api/alerts/summary` — dashboard summary data.

Then open `http://localhost:5173` and use the dashboard.

### Local run checklist

- [ ] Backend starts without an initialization error.
- [ ] Frontend starts and opens in the browser.
- [ ] The dashboard displays seeded routes and ambulances.
- [ ] The browser can load the map tiles (internet connection required).
- [ ] A predefined trip can be started and stopped.
- [ ] A custom route preview can be generated (internet connection required).
- [ ] An ambulance dispatch can be submitted using a pickup location (internet connection required for address geocoding/routing).

## Environment configuration

### Backend — `backend/.env`

The backend loads environment variables from `backend/.env` when it is started from the `backend` directory. Begin with `backend/.env.example`.

| Variable | Default | Description |
|---|---:|---|
| `PORT` | `3001` | Backend HTTP and Socket.IO port. |
| `DB_PATH` | `./data/green_corridor.db` | SQLite database file path, relative to the backend working directory unless an absolute path is provided. |
| `SIMULATION_TICK_MS` | `2000` | Interval between ambulance simulation updates. |
| `AMBULANCE_SPEED_KMH` | `45` | Simulated ambulance speed. |
| `PRIORITY_THRESHOLD_SECONDS` | `30` | ETA threshold for emergency signal priority. |
| `SIGNAL_GREEN_DURATION_S` | `30` | Normal-cycle green duration in seconds. |
| `SIGNAL_RED_DURATION_S` | `45` | Normal-cycle red duration in seconds. |
| `MAX_ROUTE_DISTANCE_KM` | `25` | Maximum accepted custom/dispatch route-leg distance. |
| `OSRM_BASE_URL` | Public OSRM demo server | Optional OSRM base URL override. |
| `NOMINATIM_BASE_URL` | Public Nominatim server | Optional Nominatim base URL override. |
| `HTTP_TIMEOUT_MS` | `8000` | Timeout for an external HTTP request. |

The last three variables are optional overrides supported by the backend configuration; they are not required for the default local setup.

### Frontend — `frontend/.env`

Begin with `frontend/.env.example`.

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3001/api` | Base URL for backend REST requests. |
| `VITE_WS_URL` | `http://localhost:3001` | Base URL for Socket.IO. |

Vite reads frontend environment variables when the development server starts. Restart Vite after changing the `.env` file.

## Tests and production build

Run the commands from the relevant project directory.

### Backend tests

```bash
cd backend
npm test
```

The backend test command uses Node's built-in test runner. The suites cover dispatch and hospital validation, API errors, the ambulance journey, cancellation, ETA/geographic helpers, request throttling, route-distance validation, routing timeouts, signal cycling, and startup recovery/migrations.

Some tests that call public Nominatim or OSRM endpoints require internet access. If those services are unavailable or rate-limited, the live integration check may be skipped; mocked tests do not replace a successful live-service check.

### Frontend tests

```bash
cd frontend
npm test
```

### Frontend production build

```bash
cd frontend
npm run build
```

Vite writes the production assets to `frontend/dist/`. To preview the built frontend locally:

```bash
npm run preview
```

The backend and frontend are separate applications; building the frontend does not start the backend.

## API reference

The backend uses the `/api` prefix. The following endpoints are mounted in the current application.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/ambulances` | List ambulances. |
| `POST` | `/api/ambulances` | Register an ambulance. Requires `vehicleNumber`, `driverName`, and a configured `hospital`. |
| `GET` | `/api/hospitals` | List configured hospitals and coordinates. |
| `GET` | `/api/routes` | List routes and their signals. |
| `GET` | `/api/routes/:id` | Get a route by ID. |
| `POST` | `/api/routes/preview` | Calculate a custom route preview without persisting it. |
| `POST` | `/api/routes/custom` | Create and persist a custom route. |
| `GET` | `/api/trips` | List trips; optional `status` query filter. |
| `GET` | `/api/trips/:id` | Get trip details. |
| `POST` | `/api/trips/start` | Start a trip using `ambulanceId` and `routeId`. |
| `POST` | `/api/trips/:id/stop` | Stop/cancel an active trip. |
| `POST` | `/api/dispatch/call` | Request an ambulance using an address or coordinates. |
| `GET` | `/api/alerts` | List recent alerts; supports a `limit` query parameter. |
| `PATCH` | `/api/alerts/:id/acknowledge` | Acknowledge an alert. |
| `GET` | `/api/alerts/summary` | Retrieve summary and analytics data. |

### Example requests

List hospitals:

```bash
curl http://localhost:3001/api/hospitals
```

Preview a route by address:

```bash
curl -X POST http://localhost:3001/api/routes/preview \
  -H "Content-Type: application/json" \
  -d '{"startAddress":"Apollo Hospital, Chennai","endAddress":"Chennai Central Station"}'
```

Call an ambulance using coordinates:

```bash
curl -X POST http://localhost:3001/api/dispatch/call \
  -H "Content-Type: application/json" \
  -d '{"lat":13.0604,"lng":80.2496}'
```

Start a predefined trip (replace the IDs with valid values returned by the API):

```bash
curl -X POST http://localhost:3001/api/trips/start \
  -H "Content-Type: application/json" \
  -d '{"ambulanceId":1,"routeId":1}'
```

On Windows PowerShell, `curl` may be an alias for `Invoke-WebRequest`. You can use `Invoke-RestMethod` for the same requests. For example:

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/hospitals"
```

For endpoints that create records or start simulations, use the request bodies shown above and ensure that the referenced ambulance and route exist.

## Seed data

On a new database, the backend seeds five Chennai hospitals, three sample ambulances, three predefined route geometries, their signal points, and checkpoint/officer records.

The predefined sample corridors are:

| Corridor | Approximate distance from seeded polyline |
|---|---:|
| Apollo Hospital to Adyar Signal | 6.31 km |
| MIOT Hospital to Guindy | 4.08 km |
| Rajiv Gandhi Government Hospital to Central Station | 5.38 km |

Distances are approximate measurements of the coordinates stored in the sample polylines, not live traffic distances. Actual OSRM distances may differ.

## External services and attribution

- **OpenStreetMap:** Map tiles and map data are provided by OpenStreetMap contributors. See [OpenStreetMap Copyright and License](https://www.openstreetmap.org/copyright).
- **Nominatim:** Used for address geocoding. See the [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/).
- **OSRM:** Used for driving-route calculation through the public OSRM demo service. See the [OSRM project](https://project-osrm.org/).

The application displays routing attribution in the custom-route interface. Public geocoding and routing services are shared services with usage limits and no availability guarantee. The backend serializes calls to these services; do not remove the rate limiting or send bulk requests to the public endpoints. For sustained or production use, arrange a suitable hosted provider or operate your own services in accordance with their licenses and policies.

## Runtime and deployment notes

Green Corridor models emergency-vehicle coordination in a local software simulation. Ambulance positions advance along route geometry, and traffic-signal states are represented and updated by the application. Custom-route signal points are generated at approximately 900-metre intervals along the calculated road geometry.

For ambulance selection, an idle ambulance is treated as being stationed at its registered base hospital. The nearest-ambulance calculation therefore uses base-hospital coordinates.

The default maximum accepted route-leg distance is 25 km and can be configured through `MAX_ROUTE_DISTANCE_KM`.

Address geocoding and driving-route calculation use the public Nominatim and OSRM demo services by default. Their usage policies and availability apply; the application serializes outbound requests and applies request timeouts. Internet access is required for address lookup, route calculation, and map tiles. For sustained deployments, choose an appropriately hosted provider or operate your own instances in accordance with the relevant usage policies and licenses.

The documented setup is intended for local evaluation and demonstration. Before running the application in a shared or network-facing environment, configure the allowed frontend origin, access controls, database storage, and operational monitoring for that environment. Green Corridor is a software demonstration and should not be used to control real-world traffic or emergency response.

## Troubleshooting

### Backend does not start

- Check that the installed Node.js version satisfies the backend requirement (`node --version`).
- Confirm that backend dependencies were installed with `npm ci` from the `backend` directory.
- Confirm that `backend/.env` exists and contains valid values.
- Check whether port `3001` is already in use. If so, change `PORT` in `backend/.env` and update `VITE_API_URL` and `VITE_WS_URL` in `frontend/.env` to match.

### Frontend cannot reach the backend

- Make sure the backend terminal is still running.
- Check `VITE_API_URL` and `VITE_WS_URL` in `frontend/.env`.
- Restart the Vite development server after changing frontend environment variables.
- Check the browser console and backend terminal for connection errors.

### Custom route or ambulance dispatch fails

- Confirm the computer has internet access.
- Check whether the address can be resolved by Nominatim.
- Try a shorter route within `MAX_ROUTE_DISTANCE_KM`.
- Public Nominatim/OSRM services may temporarily reject or delay requests due to their usage policies or service availability.

### Map tiles do not appear

- Check internet access and browser network requests.
- Map tiles are loaded from OpenStreetMap tile servers and are not bundled into the repository.

### Database already contains old local data

The backend reuses the database at `DB_PATH`. It does not reseed an existing database as though it were a new installation. If you need a clean demo database, stop the backend first and make a backup of the existing database before replacing or removing it. Never delete a database that contains data you need.

## Development notes

This project was built with AI-assisted development (Google Antigravity) from a detailed specification, then reviewed, tested and debugged.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
