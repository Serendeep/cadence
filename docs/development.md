# Development

## Setup

You need Node 22 and npm.

```bash
npm install
npm run dev          # the web app at http://localhost:5173
npm run desktop      # the same app inside Electron, with hot reload
```

In development, the web app talks to the production sync server at timer.serendeep.app, which accepts requests from `http://localhost:5173`. Signing in with WCA from localhost doesn't work, though, because WCA sends you back to the production site. To work on sync, run the [local sync server](#running-the-sync-server-locally).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run desktop` | Electron pointed at the Vite dev server |
| `npm test` | Vitest, once |
| `npm run lint` | oxlint |
| `npm run build` | type-checks every project (`tsc -b`), then builds the web app into `dist/` |
| `npm run deploy` | build, then `wrangler deploy` |
| `npm run dev:worker` | build, then run the Worker locally with sync and a test sign-in |
| `npm run dist:linux`, `dist:win`, `dist:mac` | desktop packages into `release/` |

### Type-checking

Use `npx tsc -b`.

`tsc --noEmit -p .` checks nothing here. The root `tsconfig.json` only references three projects:

- `tsconfig.app.json`: the app
- `tsconfig.node.json`: the Vite config
- `tsconfig.worker.json`: the Worker

## Running the sync server locally

`npm run dev:worker -- --port 8787` serves the built app and the API from one local Worker. Its Durable Object is stored under `.wrangler/`.

### Secrets

The local Worker reads secrets from `.env.local`:

```
WCA_APPLICATION_ID=…
WCA_SECRET=…
SESSION_SECRET=…   # any long random string, e.g. openssl rand -base64 32
```

`.env.local` is git-ignored. Never prefix these with `VITE_`, or Vite would put them into the browser bundle.

### Test sign-in

The local Worker is built with `__DEV_LOGIN__` set to true, which turns on a test sign-in:

```bash
curl 'localhost:8787/api/dev/login?id=42'          # {"token": "..."}
curl localhost:8787/api/sync -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"since":0,"changes":[]}'
```

To sign the browser in with that token, store a nonce the way `signIn()` does, then open `#/settings?auth=<token>&nonce=<nonce>`. [sync.md](sync.md#web-sign-in) explains the nonce.

Production builds set `__DEV_LOGIN__` to false, so the route isn't in the bundle.

### Seeing old code?

The service worker from an earlier build is serving it. Unregister it in DevTools > Application.

## Faking devices

In development, `window.__devices` lets you drive the UI without hardware:

```js
__devices.set({ cube: { name: 'WCU_MY32_TEST', battery: 80 } })  // pretend a cube is connected
__devices.move("R'")                                              // a face turn from the cube
__devices.orient({ x: 0, y: 0.38, z: 0, w: 0.92 })               // a gyroscope reading
```

Set Settings > input to smart cube first, so the timer page shows the lab.

## Tests

Tests sit next to the code as `*.test.ts` and run in Node. They cover:

- statistics and the timer state machine
- the cube model, CFOP detection, rotation detection, and the solver-frame rewrite (checked against cubing.js)
- device packet parsing and csTimer import
- token signing and sync request validation

A new parser or protocol, or anything that touches sign-in or stored data, should come with a test that fails when the logic breaks.

## Conventions

- **Commits** are one line in Conventional Commits form, such as `fix: end the cross phase when the cross is first solved`.
- **Comments** explain why, in one line. The code says what.
- **User-facing text** is plain and specific: say what happened and what to do next.
- **User data** on the device is never deleted or rewritten without a way back: Undo, a backup, or a confirmation.
