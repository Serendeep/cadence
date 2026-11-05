# Architecture

Cadence is one React app that runs in three places: a browser tab, an installed web app (PWA), and Electron on the desktop. A Cloudflare Worker serves the web app and the optional sync API from timer.serendeep.app.

```
src/            the app (React 19, TypeScript, Vite)
  pages/        one file per screen: TimerPage, LabView, SolvesPage, InsightsPage, SettingsPage
  components/   shared UI: charts, the 3D cube, menus, result rows
  hooks/        useTimerEngine (keyboard, touch and external timers), useSessionData
  lib/          everything without UI: storage, devices, cube model, statistics, sync
electron/       desktop shell: window, app:// protocol, Bluetooth chooser, updates, WCA sign-in window
worker/         Cloudflare Worker: static files, /api/log, WCA sign-in, sync, the UserStore Durable Object
public/         icons and other files copied as is
```

## Storage

Solves and sessions live in IndexedDB through Dexie (`src/lib/db.ts`). The database is still named `better-cstimer`, the app's first name, so existing installs keep their data. Settings are in localStorage under `better-cstimer:settings` (`src/lib/settings.ts`), checked key by key on read so a bad value can't break the app.

| Table | Key | Notes |
| --- | --- | --- |
| `sessions` | `++id`, `&uid` | name, event, created, order |
| `solves` | `++id`, `&uid`, `[sessionId+date]` | time in ms, penalty, scramble, date, splits, smart-cube `moves` and `rotations` as `{m, t}` |
| `tombstones` | `&uid` | deletions waiting to reach other devices |

Each row has a local numeric `id` and a `uid` (a UUID shared by all devices), plus `updated`, the time of its last edit. Dexie hooks fill both in on every write, so callers don't have to. Version 2 of the schema added `uid`, `updated` and `tombstones`; existing rows got a fresh `uid` and `updated = 0`.

All writes go through the functions in `db.ts`. `deleteSolve` and `deleteSession` leave tombstones; `addSolve` stamps a fresh `updated`, so a solve restored with Undo beats its own deletion.

## The timer

`src/lib/timerMachine.ts` is a pure reducer: press, release, tick and cancel events go in, and the next state comes out (idle, holding, ready, inspecting, running, stopped). `useTimerEngine` feeds it from the keyboard, touch and external timers and runs the frame loop that drives the display and the inspection voice. External timers report their own state; the engine mirrors it, and a stop packet that carries a time records the solve even if the start packet was lost.

## Devices

`src/lib/deviceStore.ts` owns the connections and fans events out to listeners: moves, timer statuses and orientation. The drivers live in `devices.ts` (GAN cubes through gan-web-bluetooth, other brands through cubing.js), `moyu.ts`, `ganTimer.ts` and `stackmat.ts`. [device-protocols.md](device-protocols.md) describes the wire formats.

In Electron, `select-bluetooth-device` sends the device list to the renderer, which shows its own chooser, because Electron has none.

## The smart cube lab

`src/lib/cube.ts` is a small sticker model of a 3x3 that applies face turns and checks the cross, F2L and OLL on any face.

- `smartSolve.ts` follows the physical cube through the scramble (spotting wrong turns and half-done double turns), arms the timer, and finishes the solve when the model is solved.
- `cfop.ts` finds the phase ends. It picks the face whose F2L was finished first. Each phase ends the first time its state is reached on that face, because F2L inserts lift cross edges out for a move, so the cross can't be read as "solved from here on".
- `orientation.ts` turns the cube's gyroscope quaternion into screen axes, relative to the reading taken when you pressed Reset orientation. `components/Cube.tsx` eases the 3D cube towards it.
- `rotations.ts` snaps the orientation to the nearest of the 24 square positions and reports a rotation once a new position holds for 250 ms. A change within 300 ms of a face turn on the same axis is a slice or wide move and is ignored. `solverFrame()` renames moves after each rotation, because smart cubes name turns by centre colour, not by where the face is.

## Statistics and Insights

`stats.ts` computes WCA averages (best and worst dropped, more than one DNF makes the average a DNF), rolling averages and the session summary. `insights.ts` groups solves by day and phase for the Insights page.

## Web app and desktop

`vite-plugin-pwa` builds a service worker that caches the app for offline use. It asks before reloading into a new version and never caches `/api/`. `pwa.ts` handles the install prompt.

Electron loads the built app from a custom `app://` scheme, so it has a real origin for IndexedDB and Bluetooth. It turns on Chromium's experimental web platform features (Bluetooth advertisements on Linux) and checks GitHub Releases for updates (`electron/updateMode.cjs` decides between installing and only linking).

## The Worker

`worker/index.ts` routes `/api/log` to the diagnostics logger and other `/api/*` paths to `api.ts`; everything else is a static file from `dist/`. Sign-in and sync are described in [sync.md](sync.md).

Diagnostics (`src/lib/diag.ts`) are off unless the user turns them on. Batches go to `/api/log` and appear in Workers Logs, one line per entry.
