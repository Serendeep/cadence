# Architecture

Cadence is one React app that runs in three places: a browser tab, an installed web app (PWA), and Electron on the desktop. A Cloudflare Worker serves the web app and the optional sync API from timer.serendeep.app.

## Where things live

```
src/            the app (React 19, TypeScript, Vite)
  pages/        screen orchestration and timer views: TimerPage, FocusView, LabView, SolvesPage, InsightsPage, SettingsPage
  components/   shared UI and feature UI: dialogs, solve details, account settings, import preview, timer controls, charts
  hooks/        useTimerEngine (keyboard, touch and external timers), useSessionData
  lib/          everything without UI: storage, devices, cube model, statistics, sync
electron/       desktop shell: window, app:// protocol, Bluetooth chooser, updates, WCA sign-in window
worker/         Cloudflare Worker: static files, /api/log, WCA sign-in, sync, the UserStore Durable Object
public/         icons and other files copied as is
```

## Storage

Solves and sessions live in IndexedDB through Dexie (`src/lib/db.ts`). Settings live in localStorage under `better-cstimer:settings` (`src/lib/settings.ts`). Settings are checked key by key on read, so one bad value can't break the app.

Both names still say `better-cstimer`, the app's first name, so existing installs keep their data.

| Table | Key | Notes |
| --- | --- | --- |
| `sessions` | `++id`, `&uid` | name, event, created, order |
| `solves` | `++id`, `&uid`, `[sessionId+date]` | time in ms, penalty, scramble, date, splits, smart-cube `moves` and `rotations` as `{m, t}` |
| `tombstones` | `&uid` | deletions waiting to reach other devices |

### Row identity

Every row has three fields that sync depends on:

- `id`: a local number, different on each device.
- `uid`: a UUID shared by all devices.
- `updated`: the time of the row's last edit.

Dexie hooks fill in `uid` and `updated` on every write, so callers don't have to. Schema version 2 added `uid`, `updated` and `tombstones`; existing rows got a fresh `uid` and `updated = 0`.

The first-launch "Main" session is the one exception. It always gets the fixed uid `default-main-333`, so every device's first "Main" is the same session to sync instead of a new copy. Earlier versions did make copies, so `removeEmptyMainsOnce` deletes empty extra "Main" 3x3 sessions once per device. A signed-out device does this at launch. A signed-in device waits for a full sync, so no session is removed while its solves are still arriving.

All writes go through the functions in `db.ts`.

- `deleteSolve` and `deleteSession` leave tombstones.
- `addSolve` stamps a fresh `updated`, so a solve restored with Undo beats its own deletion.

## The timer

`src/lib/timerMachine.ts` is a pure reducer. Press, release, tick and cancel events go in, and the next state comes out: idle, holding, ready, inspecting, running or stopped.

`useTimerEngine` feeds it from the keyboard, touch and external timers. It also runs the frame loop that drives the display and the inspection voice. External timers report their own state and the engine mirrors it. A stop packet that carries a time records the solve even if the start packet was lost.

### Timer views

- `pages/TimerPage.tsx` owns scramble history, saving, and choosing between `FocusView` and `LabView`.
- `pages/timerTypes.ts` defines the inputs both views share.
- Both views use `components/TimerConfigBar.tsx` and `components/ScrambleLine.tsx`. Neither imports the timer page.
- `FocusView` also owns typed entry.

The smart cube view keeps a finished result on screen until the stored history catches up. It clears that temporary result when the session or the latest saved solve changes, so deleting a solve can't bring an old result back.

## UI ownership

Where to make a change:

| Change | Module |
| --- | --- |
| Dialog sizing, animation, Escape and keyboard focus | `components/Dialog.tsx`, `hooks/useModalFocus.ts`, `.dialog` in `styles/app.css` |
| Solve list, paging and session actions | `pages/SolvesPage.tsx` |
| Solve details, penalties, comments and replay | `components/SolveDrawer.tsx` |
| Settings navigation and import/export execution | `pages/SettingsPage.tsx` |
| WCA account, sync status and account deletion controls | `components/AccountSettings.tsx` |
| Import preview and confirmation | `components/ImportDialog.tsx` |
| Shared settings row layout | `components/SettingsRow.tsx` |

Two rules keep screens independent:

- Shared UI belongs in `components/`. Importing it from a page ties unrelated screens together.
- Pages compose these modules directly, without re-exporting them.

`useSessionData` owns session reads and statistics. It hides confirmed local deletions from the visible history straight away, then drops that temporary filter once IndexedDB catches up. Keep this in the hook so the timer and the solve list always agree.

## Devices

`src/lib/deviceStore.ts` owns the connections and fans events out to listeners: moves, timer statuses and orientation.

| Driver | File |
| --- | --- |
| GAN cubes (through gan-web-bluetooth), other brands (through cubing.js) | `devices.ts` |
| MoYu cubes | `moyu.ts` |
| GAN Smart Timer | `ganTimer.ts` |
| Stackmat | `stackmat.ts` |

[device-protocols.md](device-protocols.md) describes the wire formats.

Electron has no Bluetooth chooser of its own. Its `select-bluetooth-device` event sends the device list to the renderer, which shows Cadence's chooser.

## The smart cube lab

`src/lib/cube.ts` is a small sticker model of a 3x3. It applies face turns and checks the cross, F2L and OLL on any face. Four modules build on it:

- `smartSolve.ts` follows the physical cube through the scramble, spotting wrong turns and half-done double turns. It arms the timer and finishes the solve when the model is solved.
- `cfop.ts` finds the phase ends. It picks the face whose F2L was finished first, and each phase ends the first time its state is reached on that face. "First reached" matters: F2L inserts lift cross edges out for a move, so the cross can't be read as "solved from here on".
- `orientation.ts` turns the cube's gyroscope quaternion into screen axes, relative to the reading taken at Reset orientation. `components/Cube.tsx` eases the 3D cube towards it.
- `rotations.ts` snaps the orientation to the nearest of the 24 square positions and reports a rotation once a new position holds for 250 ms. A change within 300 ms of a face turn on the same axis is a slice or wide move, and is ignored. `solverFrame()` renames moves after each rotation, because smart cubes name turns by centre colour, not by where the face is.

## Statistics and Insights

- `stats.ts` computes WCA averages, rolling averages and the session summary. Averages drop the best and worst, and more than one DNF makes the average a DNF.
- `insights.ts` groups solves by day and phase for the Insights page.

## Web app and desktop

On the web, `vite-plugin-pwa` builds a service worker that caches the app for offline use. It asks before reloading into a new version and never caches `/api/`. `pwa.ts` handles the install prompt.

On the desktop, Electron loads the built app from a custom `app://` scheme, which gives it a real origin for IndexedDB and Bluetooth. It also:

- turns on Chromium's experimental web platform features, for Bluetooth advertisements on Linux;
- checks GitHub Releases for updates, with `electron/updateMode.cjs` deciding between installing and only linking.

## The Worker

`worker/index.ts` routes requests:

- `/api/log` goes to the diagnostics logger.
- Other `/api/*` paths go to `api.ts`. [sync.md](sync.md) describes sign-in and sync.
- Everything else is a static file from `dist/`.

Diagnostics (`src/lib/diag.ts`) are off unless the user turns them on. Batches go to `/api/log` and show up in Workers Logs, one line per entry.

Client sync requests time out after 30 seconds. A timeout releases the syncing state and allows a retry. The client moves its saved push checkpoint forward only after a full sync succeeds. `src/lib/syncTimeout.test.ts` covers a stalled request followed by a successful retry.
