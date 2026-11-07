# FsClient

FsClient is a web-based client for Microsoft Flight Simulator 2024. It provides a remote autopilot panel and a library for saving aircraft positions.

## Server

The Node.js server connects to the simulator through SimConnect, serves the web client, and relays simulator state and control commands over Socket.IO. Saved positions are stored locally in SQLite.

## Client

The browser-based client includes the autopilot control panel, the Saved positions page for capturing, browsing, importing, and exporting positions, and a flight map with manually entered airport codes. The map draws a dense dashed direct route, records the live aircraft position once per second in a two-hour in-memory history, and renders altitude-colored points and segments on a Leaflet canvas (green at ground level through yellow to red at 30,000 feet). It continuously shows position, altitude, heading, distance to destination, aircraft type, callsign, and identifier from the simulator. Airport lookup accepts ICAO and FAA/local airport codes. The map uses Leaflet and OpenStreetMap tiles and requires an internet connection. The pairing page is not functional yet. Autopilot support varies by aircraft, and not all functions work on every aircraft.

## Requirements

- Node.js 24.19.0 or newer
- Microsoft Flight Simulator 2024 with an available SimConnect connection

## Run locally

From the repository root:

```powershell
npm --prefix src install
npm --prefix src start
```

Open [http://localhost:3000](http://localhost:3000) in a browser. To run the tests:

```powershell
npm --prefix src test
```
