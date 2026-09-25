# Green Corridor — Feature List

## Implemented Features

### ✅ Ambulance Management
- Register new ambulances (vehicle number, driver name, hospital)
- View all ambulances with current status (idle / en_route / arrived)
- Status automatically updates during trip lifecycle

### ✅ Route & Signal Setup
- 3 predefined routes seeded from real Chennai road coordinates
- Each route has signals placed at actual intersection locations
- Signals have named police checkpoints assigned to them
- Routes viewable on individual mini-maps with signal markers

### ✅ Live Ambulance Tracking
- Real-time simulated GPS position updates via WebSocket (Socket.io)
- Ambulance marker moves smoothly along the route polyline on the map
- Route displayed as a blue polyline, signals as red/green circle markers
- Position broadcast every 2 seconds (configurable via `SIMULATION_TICK_MS`)

### ✅ ETA & Signal Priority Engine
- ETA calculated on every simulation tick using distance-along-route math
- When ETA to a signal drops below threshold (default 30s), signal turns green
- Priority event logged with signal name, timestamp, and ETA at trigger
- Signal reverts to red after the ambulance passes it
- All thresholds configurable via environment variables

### ✅ Police Alert System
- Alerts generated and broadcast via WebSocket when a signal is prioritized
- Alert panel shows live feed of notifications (most recent first)
- Each alert displays signal name, ambulance ID, ETA, and timestamp
- "Acknowledge" button simulates police officer confirmation
- Acknowledged alerts visually grayed out

### ✅ Dashboard
- Three-panel layout: Trip Sidebar | Map View | Alert Panel
- Map view with OpenStreetMap tiles (no API key needed)
- Active trips show progress bar (distance traveled / total)
- ETA countdown for next upcoming signal
- Start new trip via modal form (select ambulance + route)
- Stop/cancel active trips with confirmation

### ✅ Trip History
- View completed and cancelled trips in a sortable table
- Shows ambulance, route, status, start/end time, and duration

### ✅ Basic Analytics
- Summary cards: Total Trips, Signals Prioritized, Estimated Time Saved
- Bar chart showing signals prioritized per trip (via Recharts)
- Time saved calculated assuming 15 seconds saved per prioritized signal

### ✅ Simulation Engine
- Server-side simulation loop with configurable speed and tick interval
- Haversine formula for accurate GPS distance calculations
- Position interpolation along polyline segments
- Pre-computed signal distances for efficient ETA checks
- Multiple simultaneous trips supported independently

### ✅ Real-time Updates
- WebSocket events for position, signal state changes, alerts, trip lifecycle
- Frontend auto-updates all panels without polling

### ✅ Clean Architecture
- Separated backend: models → controllers → routes → services
- ETA/priority logic isolated in `etaService.js`
- Simulation loop isolated in `simulationService.js`
- Signal management isolated in `signalService.js`
- Centralized config with environment variable overrides
- SQLite database with auto-initialization and seeding

### ✅ Custom Route Creation
- Geocodes user-provided start/end addresses using Nominatim API (with in-memory caching and rate-limiting)
- Generates real driving routes dynamically using the OSRM public routing API
- Automatically plots virtual traffic signals along the route (every ~900m)
- UI seamlessly toggles between predefined routes and on-the-fly custom ones
- OSRM attribution included on the frontend per their usage policy

### ✅ Emergency Ambulance Dispatch (Two-Leg Routing)
- "Call Ambulance" flow that accepts an emergency pickup address.
- Geocodes the emergency location and identifies the nearest idle ambulance and the nearest hospital.
- Automatically calculates a two-leg journey:
  - **Leg 1**: Routes the ambulance from its current base to the emergency pickup location.
  - **Pickup Phase**: Simulates a 15-second delay at the scene.
  - **Leg 2**: Routes the ambulance from the pickup location to the destination hospital.
- Auto-generates virtual traffic signals for both legs.
- UI displays current trip phases (e.g., "En route to pickup", "At pickup location", "En route to hospital") and the destination hospital name.

---

## Extension Points

### Overpass API for Real Traffic Signals
> Instead of generating virtual traffic signals at fixed intervals for custom routes, query OpenStreetMap for actual traffic signal nodes:
> - Integrate with the free Overpass API
> - Query for `node["highway"="traffic_signals"]` along the calculated OSRM polyline
> - Map these real signal coordinates into the `signals` table for a hyper-realistic simulation
> - File to modify: `backend/src/services/routingService.js`

### Multi-Ambulance Conflict Resolution
> When two ambulances approach the same signal from different routes, a priority conflict arises. To handle this:
> - Extend `etaService.js` to check if a signal already has an active priority from another trip
> - Add a priority ranking system (e.g., by ETA — closer ambulance wins)
> - Add a `conflict_events` table to log resolution decisions
> - File to modify: `backend/src/services/etaService.js`

### Real GPS Integration
> Replace the simulation engine with real GPS data:
> - Add a `POST /api/ambulances/:id/position` endpoint for GPS device updates
> - Modify `simulationService.js` to accept external position updates instead of computing them
> - The ETA service works the same way — it only needs current position and route
> - File to modify: `backend/src/services/simulationService.js`

### Traffic Density Awareness
> Factor in current traffic conditions to improve ETA accuracy:
> - Add a `traffic_density` field to signals
> - Adjust simulated speed based on nearby traffic density
> - Use variable speed in ETA calculations instead of constant speed
> - File to modify: `backend/src/services/etaService.js`, `backend/src/utils/geo.js`

### Mobile App for Police Officers
> Build a companion mobile app for checkpoint officers:
> - Subscribe to alerts for specific signals via WebSocket
> - Push notifications for incoming ambulances
> - One-tap acknowledge functionality
> - The backend already supports this — just needs a mobile frontend consuming the same WebSocket events

### Detailed Analytics Dashboard
> Expand the analytics page with more metrics:
> - Average response time per route
> - Heat map of most-prioritized signals
> - Time-of-day analysis for trip frequency
> - File to modify: `backend/src/models/priorityEvent.js` (add more aggregate queries), `frontend/src/pages/AnalyticsPage.jsx`
