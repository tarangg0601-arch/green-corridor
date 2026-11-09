# Green Corridor — Smart Traffic Management for Ambulances

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.19.0-brightgreen.svg)](https://nodejs.org)

Green Corridor is an automated smart emergency traffic management demonstration system designed to minimize transit delays for emergency vehicles. When an emergency trip or emergency dispatch is initiated, the system continuously tracks vehicle progress along its route, calculates dynamic arrival times (ETA) at every upcoming traffic signal, and automatically transitions signals to **green** before the vehicle arrives. Nearby police checkpoints receive instant alerts with distance and ETA metrics so traffic personnel can clear intersections in advance.

---

## 1. Problem Statement and Purpose

Traffic congestion in urban centers frequently causes severe delays for emergency ambulances, directly impacting patient survival rates during critical "golden hour" medical crises. Traditional sirens rely on driver courtesy and manual observation, which fail at gridlocked junctions.

Green Corridor addresses this problem by providing:
- **Automated Traffic Light Preemption**: Signals automatically flip to green when an approaching emergency ambulance crosses an ETA proximity threshold (default: 30 seconds ahead).
- **Intelligent Emergency Dispatch**: Given an emergency pickup location, the system automatically dispatches the nearest available idle ambulance, routes it to the patient, waits 15 seconds for patient stabilization/boarding, and navigates directly to the nearest hospital.
- **Police Checkpoint Notifications**: Law enforcement and traffic officers near upcoming signals receive real-time alerts via WebSocket to secure intersections manually if needed.
- **Normal Signal Cycling & Priority Override**: Intersections cycle through standard red/green phases during active trips and immediately yield to emergency green-corridor priority, resuming from a safe red phase once the vehicle passes.

---

## 2. Key Features

- **Real-Time Simulation Engine**: High-frequency vehicle simulation (default: 2000 ms ticks at 45 km/h) tracking position along high-fidelity route polylines.
- **Two-Leg Emergency Dispatch**: Automated multi-stage dispatch workflow (`to_pickup` -> 15s wait at `at_pickup` -> `to_hospital` -> `completed`).
- **Dynamic Routing & Virtual Signal Generation**: Integration with OpenStreetMap (Nominatim for geocoding and OSRM for driving routes) with synthetic signal generation every ~900 meters.
- **Route Preview without Persistence**: Preview custom A → B routes, distances, and virtual signal counts without creating permanent database records.
- **Configurable Maximum Route Distance**: Enforces a configurable distance ceiling (`MAX_ROUTE_DISTANCE_KM`, default: 25 km) returning HTTP 422 before saving invalid routes or stranding ambulances.
- **Rate-Limited External Requests**: Internal request queue ensuring compliant spacing (>= 1.1s) for public Nominatim and OSRM servers.
- **Robust Abort and Timeout Handling**: Response-body timeouts and user cancellations cleanly restore ambulances to `idle` and reset signals to `red`.
- **Startup Recovery & Safe Schema Migrations**: Detects interrupted trips upon startup, safely terminates them with `end_time`, restores orphaned ambulances to `idle`, resets green signals, and applies non-destructive schema migrations.

---

## 3. Technology Stack

- **Backend**:
  - Runtime: Node.js (>= 18.19.0 required for test-runner mock timers; tested with Node.js LTS)
  - Framework: Express 4.18
  - Real-Time Communication: Socket.IO 4.7
  - Database: SQLite via `sql.js` (WebAssembly SQLite engine with automated disk flushing)
  - Testing: Built-in Node test runner (`node:test`, `node:assert`)
- **Frontend**:
  - Framework: React 18 with Vite 5 (ES Modules)
  - Styling: Tailwind CSS
  - Mapping: Leaflet.js with React-Leaflet and OpenStreetMap tiles
  - Charts & Data Viz: Recharts
  - HTTP Client: Axios

---

## 4. Architecture and Project Structure

```
green-corridor/
├── backend/
│   ├── data/                  # SQLite database storage (green_corridor.db)
│   ├── src/
│   │   ├── config.js          # Centralized configuration & environment loader
│   │   ├── index.js           # Server bootstrap and route registration
│   │   ├── socketManager.js   # Socket.IO instance management
│   │   ├── controllers/       # HTTP request handlers (routes, trips, dispatch, alerts, ambulances)
│   │   ├── db/                # DB connection, schema migrations, helpers, seed data
│   │   ├── models/            # Data access objects (trips, routes, signals, ambulances, events)
│   │   ├── routes/            # Express routers
│   │   ├── services/          # Simulation engine, ETA calculation, signal cycling, geocoding, routing
│   │   └── utils/             # Haversine distance, geo math, request queue, logger
│   └── tests/                 # Automated test suites using node:test
├── frontend/
│   ├── src/
│   │   ├── api/               # Axios REST API client modules
│   │   ├── components/        # UI components (Map, Sidebar, Alerts, Ambulances, Signals)
│   │   ├── hooks/             # WebSocket and state management hooks
│   │   ├── pages/             # Dashboard, Predefined Routes, Trip History, Analytics
│   │   └── utils/             # Alert normalizer and helper functions
│   └── tests/                 # Frontend helper unit tests (ES modules)
├── scripts/                   # PowerShell verification and integration test scripts
├── .env.example               # Root environment variable template
├── LICENSE                    # MIT License
└── README.md                  # System documentation
```

---

## 5. Emergency Dispatch Workflow

1. **Patient Call**: User enters an emergency address or coordinates in the Emergency Dispatch modal (`POST /api/dispatch/call`).
2. **Nearest Hospital Selection**: System scans all registered hospitals and identifies the closest hospital to the patient using Haversine calculation.
3. **Nearest Idle Ambulance Selection**: System identifies all ambulances in `idle` state, calculates distance from their base hospitals to the patient, and selects the nearest unit. The ambulance is immediately reserved as `en_route`.
4. **Leg 1 (Base -> Pickup)**: OSRM calculates the driving polyline to the patient. If the distance exceeds `MAX_ROUTE_DISTANCE_KM`, the request is rejected with HTTP 422 and the ambulance reverts to `idle`. Otherwise, virtual signals are generated and simulation begins with trip phase `to_pickup`.
5. **Arrival at Pickup**: When the ambulance reaches the patient, the trip transitions to `at_pickup`. Any Leg 1 green signals are reverted. The ambulance pauses for **15 seconds** to board the patient.
6. **Leg 2 (Pickup -> Hospital)**: After 15 seconds, the system queries OSRM for a route from the pickup location to the nearest hospital. If route calculation fails or exceeds the distance limit, the trip safely terminates with an explicit reason (`leg2_distance_exceeded` or `leg2_routing_timeout`) and releases the ambulance. If successful, phase updates to `to_hospital` and simulation continues.
7. **Destination Arrival**: When the ambulance reaches the hospital, the trip marks as `completed`, the final phase is set to `completed`, the ambulance status resets to `idle`, and all signals return to standard state.

---

## 6. Custom Routes & External API Integrations

- **Nominatim Geocoding**: Converts freeform addresses (e.g. "Marina Beach, Chennai") into latitude and longitude coordinates.
- **OSRM Driving Routes**: Generates real driving polylines between coordinates.
- **Request Serialization Queue**: A dedicated queue (`backend/src/utils/requestQueue.js`) enforces a minimum interval of 1100 ms between outbound calls to comply with OpenStreetMap server usage policies.
- **Virtual Signal Generation**: `routingService.generateVirtualSignals` places virtual checkpoints at ~900-meter intervals along custom routes, omitting the final 200 meters.
- **Non-Persistent Previews**: `POST /api/routes/preview` computes polylines, distances, and virtual signals without inserting rows into `routes` or `signals`. Custom routes are persisted only when the user clicks "Start Trip".

---

## 7. Traffic Signal Control & Normal Cycling

- **ETA Calculation**: On every simulation tick, `etaService.processSignals` evaluates the ambulance's distance from each upcoming signal and calculates arrival time based on configured speed:
  $$\text{ETA (seconds)} = \frac{\text{Distance to Signal (km)}}{\text{Speed (km/h)} / 3600}$$
- **Green Preemption**: When ETA falls below `PRIORITY_THRESHOLD_SECONDS` (default: 30s), the signal triggers priority to `green`, logs a `priority_events` record, and broadcasts an alert to police checkpoints.
- **Reversion on Passing**: When the ambulance passes a signal (with a 50m tolerance), the signal reverts to `red`, unless another active trip currently requires that signal.
- **Normal Signal Cycling**: Intersections along active trip routes run a background cycle (`SIGNAL_RED_DURATION_S` -> `SIGNAL_GREEN_DURATION_S`). Emergency preemption suspends the normal cycle and locks the signal green. When emergency priority is released, the signal resumes cycling safely from `red`. Inactive seeded routes do not cycle randomly.

---

## 8. Dashboard, Alerts, Analytics & History

- **Interactive Live Map**: Displays real-time vehicle movement, route polylines, and signal states. Only signals belonging to active trip corridors are rendered on the map.
- **Predefined Routes Page**: Displays configured corridors (`is_custom = 0`) with lightweight, lazy-rendered Leaflet previews to minimize DOM load.
- **Police Alert Feed**: Lists incoming preemption alerts. Supports both WebSocket live events and REST history normalization, eliminating `Invalid Date` discrepancies. Officers can acknowledge alerts directly (`PATCH /api/alerts/:id/acknowledge`).
- **Analytics**: Displays total trips facilitated (completed trips), cancelled trips, total signals prioritized, and estimated time saved (documented at 15 seconds saved per prioritized signal wait).
- **Trip History**: Detailed logs showing ambulance vehicle numbers, route names, destination hospitals, total signals cleared, status (`completed` or `cancelled`), start times, and journey durations.

---

## 9. Database Architecture

SQLite is managed via `sql.js` in memory and periodically persisted to disk at `backend/data/green_corridor.db`.

```
hospitals (id, name, lat, lng)
    ▲
    │ (hospital name string match)
ambulances (id, vehicle_number, driver_name, hospital, status)
    ▲
    │ (ambulance_id)
trips (id, ambulance_id, route_id, status, phase, pickup_lat, pickup_lng, dest_hospital_id, start_time, end_time)
    │
    ├────────► routes (id, name, start_name, end_name, polyline, is_custom)
    │              ▲
    │              │ (route_id)
    │          signals (id, route_id, name, lat, lng, order_in_route, current_state)
    │              ▲
    │              │ (signal_id)
    └────────► priority_events (id, trip_id, signal_id, triggered_at, eta_at_trigger, acknowledged)
```

---

## 10. Installation & Setup

### Prerequisites

- **Node.js**: Version **>= 18.19.0** (required for `node:test` mock timers).
- **npm**: Version 8+ or 9+.
- Operating Systems: Windows (PowerShell), macOS, or Linux.

### 1. Clone & Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd green-corridor

# Install Backend Dependencies
cd backend
npm install

# Install Frontend Dependencies
cd ../frontend
npm install
```

### 2. Environment Configuration

Create `.env` files from their respective `.env.example` templates:

**Backend (`backend/.env`):**
```env
PORT=3001
DB_PATH=./data/green_corridor.db
SIMULATION_TICK_MS=2000
AMBULANCE_SPEED_KMH=45
PRIORITY_THRESHOLD_SECONDS=30
SIGNAL_GREEN_DURATION_S=30
SIGNAL_RED_DURATION_S=45
MAX_ROUTE_DISTANCE_KM=25
```

**Frontend (`frontend/.env`):**
```env
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=http://localhost:3001
```

---

## 11. Running the Application

### Start the Backend Server

```bash
cd backend
npm start
# Or for development with auto-reload:
npm run dev
```
Backend runs on `http://localhost:3001`. On first run, it initializes the SQLite database and seeds default hospitals, ambulances, and Chennai corridors.

### Start the Frontend Client

```bash
cd frontend
npm run dev
```
Frontend runs on `http://localhost:5173`. Open your browser to access the dashboard.

---

## 12. Running Tests

Both backend and frontend utilize native Node test runners with cross-platform scripts (`node --test`).

```bash
# Run backend test suites (13 tests)
cd backend
npm test

# Run frontend test suites (4 tests)
cd ../frontend
npm test

# Verify frontend production build
npm run build
```

---

## 13. API Reference

### Ambulances
- `GET /api/ambulances` — List all ambulances.
- `POST /api/ambulances` — Register an ambulance (`{ vehicleNumber, driverName, hospital }`). Returns 400 if hospital is invalid; returns 409 if vehicle number already exists.

### Hospitals
- `GET /api/hospitals` — List all registered hospitals with geographical coordinates.

### Routes
- `GET /api/routes` — List all routes with embedded signal lists.
- `GET /api/routes/:id` — Get details of a single route.
- `POST /api/routes/preview` — Preview a custom route without persisting to the database (`{ startAddress, endAddress }` or `{ startLat, startLng, endLat, endLng }`). Returns 422 if distance exceeds `MAX_ROUTE_DISTANCE_KM`.
- `POST /api/routes/custom` — Create and persist a custom route with virtual signals.

### Trips & Dispatch
- `GET /api/trips?status=active|completed|cancelled` — List trips filtered by status.
- `GET /api/trips/:id` — Get trip details including priority events.
- `POST /api/trips/start` — Start a trip (`{ ambulanceId, routeId }`).
- `POST /api/trips/:id/stop` — Cancel an active trip.
- `POST /api/dispatch/call` — Emergency dispatch (`{ address }` or `{ lat, lng }`). Automatically reserves nearest ambulance and routes two legs.

### Alerts & Analytics
- `GET /api/alerts?limit=50` — List recent priority alerts.
- `PATCH /api/alerts/:id/acknowledge` — Mark a police alert as acknowledged.
- `GET /api/alerts/summary` — Aggregate statistics (completed trips, cancelled trips, signals prioritized, chart data).

---

## 14. Seed Data & Route Distances

The database is seeded with real road geometries in **Chennai, India**, calculated accurately using `geo.totalRouteDistance`:

1. **Apollo Hospital to Adyar Signal**: **6.31 km**, 4 traffic signals along Anna Salai.
2. **MIOT Hospital to Guindy**: **4.08 km**, 3 traffic signals along Mount Poonamallee Road.
3. **Rajiv Gandhi Hospital to Central Station**: **5.38 km**, 5 traffic signals along EVR Periyar Salai.

---

## 15. Known Limitations

- **Simulated GPS**: Vehicle movement and positions are mathematically interpolated along OSRM polylines; the system does not interface with real-world GPS trackers.
- **Virtual Signals**: On custom routes, virtual signals are generated at ~900m mathematical intervals and do not correspond to verified real-world physical signal infrastructure.
- **Base Hospital Ambulance Relocation**: Ambulances are assumed to be stationed at their registered hospital base when in `idle` state.
- **Authentication**: This is an educational and engineering demonstration prototype; no user authentication or RBAC is implemented. Do not deploy to an unsecured public network.
- **Public OSRM & Nominatim Services**: Routing and geocoding rely on free public OpenStreetMap endpoints which are rate-limited and offer no SLA. For production use, self-host local OSRM and Nominatim instances.

---

## 16. Development Notes

This project was built with AI-assisted development (Google Antigravity) from a detailed specification, then reviewed, tested and debugged.

### Troubleshooting
- **Port Conflicts**: If port 3001 or 5173 is occupied, adjust `PORT` in `backend/.env` or specify `--port` in Vite.
- **Database Reset**: To reset the database to clean seed state, delete `backend/data/green_corridor.db` and restart the backend.
- **Node.js Version**: If running backend tests fails with timer errors, ensure your active Node version is `>= 18.19.0`.

---

## 17. License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
