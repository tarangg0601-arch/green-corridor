# Green Corridor — Smart Traffic Management for Ambulances

A full-stack web application that simulates smart traffic management for emergency vehicles. When an ambulance starts a trip, the system tracks its simulated route in real time, calculates arrival times at each traffic signal, and automatically turns signals green before the ambulance arrives. Police checkpoints near upcoming signals receive live alerts so officers can assist manually if needed.

## Architecture

```
┌─────────────────┐     WebSocket (Socket.io)      ┌──────────────────┐
│                 │◄──────────────────────────────►│                  │
│  React Frontend │         REST API (Express)      │  Node.js Backend │
│  (Vite + TW)    │◄──────────────────────────────►│                  │
│                 │                                 │  ┌────────────┐  │
│  • Leaflet Map  │                                 │  │ Simulation │  │
│  • Trip Mgmt    │                                 │  │   Engine   │  │
│  • Alert Feed   │                                 │  └────────────┘  │
│  • Analytics    │                                 │  ┌────────────┐  │
│                 │                                 │  │   SQLite    │  │
└─────────────────┘                                 │  │  Database   │  │
                                                    │  └────────────┘  │
                                                    └──────────────────┘
```

- **Frontend**: React (Vite) + Tailwind CSS + Leaflet.js with OpenStreetMap tiles
- **Backend**: Node.js + Express + Socket.io
- **Database**: SQLite via `sql.js` (WebAssembly SQLite with file persistence to disk)
- **Maps**: Leaflet.js with OpenStreetMap (no API key required)

## Prerequisites

- Node.js 18+ and npm

## Getting Started

### 1. Clone and install

```bash
# Backend
cd backend
cp .env.example .env
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Start the backend

```bash
cd backend
npm run dev
```

The backend starts on `http://localhost:3001`. On first run, it automatically creates the SQLite database and seeds it with sample data (3 routes in Chennai with realistic coordinates, traffic signals, ambulances, and police checkpoints).

### 3. Start the frontend

```bash
cd frontend
npm run dev
```

The frontend starts on `http://localhost:5173`. Open it in your browser.

### 4. Run a simulation

1. Open the dashboard at `http://localhost:5173`
2. In the sidebar, click "Start Trip"
3. Select an ambulance and a route
4. Click "Start" — the ambulance begins moving on the map
5. Watch signals turn green as the ambulance approaches
6. Police alerts appear in the alerts panel in real time
7. The trip completes when the ambulance reaches the destination

## Project Structure

```
green-corridor/
├── backend/
│   └── src/
│       ├── index.js           # Server entry point
│       ├── config.js          # Centralized configuration
│       ├── db/                # Database setup, schema, seed data
│       ├── models/            # Data access layer
│       ├── controllers/       # Request handlers
│       ├── routes/            # Express route definitions
│       ├── services/          # Simulation engine, ETA, signals, alerts
│       └── utils/             # Geo math, logging
├── frontend/
│   └── src/
│       ├── api/               # REST API client functions
│       ├── hooks/             # React hooks (WebSocket, trips)
│       ├── components/        # Reusable UI components
│       └── pages/             # Page-level components
├── FEATURES.md                # Feature list and extension points
└── README.md                  # This file
```

## Configuration

All tunable backend parameters live in `backend/.env` (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Backend server port |
| `DB_PATH` | `./data/green_corridor.db` | SQLite database file location |
| `SIMULATION_TICK_MS` | 2000 | Position update interval (ms) |
| `AMBULANCE_SPEED_KMH` | 45 | Simulated ambulance speed |
| `PRIORITY_THRESHOLD_SECONDS` | 30 | How far ahead to trigger green signal |
| `SIGNAL_GREEN_DURATION_S` | 30 | Normal green phase duration |
| `SIGNAL_RED_DURATION_S` | 45 | Normal red phase duration |

Frontend environment variables can be set in `frontend/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3001/api` | Backend REST API base URL |
| `VITE_WS_URL` | `http://localhost:3001` | Backend Socket.IO WebSocket URL |

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ambulances` | List all ambulances |
| POST | `/api/ambulances` | Register an ambulance |
| GET | `/api/routes` | List all routes |
| GET | `/api/routes/:id` | Route details with signals |
| POST | `/api/routes/custom` | Create on-the-fly custom A → B route via OSRM |
| GET | `/api/trips` | List trips (filterable by status) |
| POST | `/api/trips/start` | Start a new predefined or custom trip |
| POST | `/api/trips/:id/stop` | Stop/cancel a trip |
| POST | `/api/dispatch/call` | Emergency two-leg dispatch (nearest ambulance → pickup → hospital) |
| GET | `/api/alerts` | Recent police alerts |
| PATCH | `/api/alerts/:id/acknowledge` | Acknowledge a police alert |
| GET | `/api/analytics/summary` | Aggregate statistics |

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `ambulance:position` | Server → Client | Real-time position update |
| `signal:stateChange` | Server → Client | Signal turned green/red |
| `alert:new` | Server → Client | New police alert generated |
| `trip:started` | Server → Client | Trip simulation began |
| `trip:updated` | Server → Client | Trip phase or route updated |
| `trip:ended` | Server → Client | Trip completed, cancelled, or failed |

## Routing, Geocoding & Attribution

- **Geocoding**: Uses the free Nominatim OpenStreetMap API with a client-side request throttle (1.1s minimum interval) and in-memory caching.
- **Routing**: Uses the public OSRM (Open Source Routing Machine) driving API to compute real street geometry and driving polylines.
- **Attribution**: Map data © OpenStreetMap contributors, routing powered by OSRM.

## Database Migrations & Startup Recovery

- **Safe Column Migrations**: `initializeSchema` uses `PRAGMA table_info` to detect legacy databases and safely add missing columns (`is_custom`, `phase`, `pickup_lat`, `pickup_lng`, `dest_hospital_id`) via `ALTER TABLE`.
- **Interrupted Trip Recovery**: On server restart, any active trips interrupted by server shutdown are recovered by marking them `cancelled` with an `end_time`, releasing their ambulances back to `idle`, and resetting all signals back to `red`.

## Sample Data

The database is seeded with routes from **Chennai, India**:

1. **Apollo Hospital → Adyar Signal** — ~4 km, 4 signals along Anna Salai
2. **MIOT Hospital → Guindy** — ~3 km, 3 signals along Mount Poonamallee Road
3. **Rajiv Gandhi Hospital → Central Station** — ~3.5 km, 5 signals along EVR Periyar Salai

## License

MIT
