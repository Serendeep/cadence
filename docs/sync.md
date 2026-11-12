# Sync and sign-in

Sync is optional. Without signing in, nothing about a user's solves reaches the server.

With sign-in, each WCA account gets its own small database on the server. Devices push their edits there and pull everyone else's, and the newest edit wins.

## Pieces

| Where | File | Job |
| --- | --- | --- |
| Browser and desktop app | `src/lib/sync.ts` | signs in, finds local changes, pushes and pulls, applies what comes back |
| Worker | `worker/api.ts` | routes, CORS, rate limits, WCA OAuth, bearer tokens |
| Worker | `worker/auth.ts` | signs and checks tokens |
| Worker | `worker/wca.ts` | talks to the WCA website |
| Durable Object | `worker/userStore.ts` | one SQLite database per WCA account |
| Desktop | `electron/main.cjs` | runs the WCA sign-in in its own window |

## Accounts and tokens

An account is a WCA website account, keyed by its numeric id from `/api/v0/me`. That's not the competitor id, which only competitors have. Each account gets one `UserStore` Durable Object, found with `USERS.getByName(<id>)`.

A signed-in device holds a bearer token:

```
<WCA user id>.<token id>.<HMAC-SHA256 of the first two, base64url>
```

- The HMAC key is the `SESSION_SECRET` Worker secret.
- The token id is also a row in the user's `tokens` table. That's what lets a token be revoked (sign out, Delete synced data), and it stops working after 180 days without use.
- Devices keep the token in localStorage under `cadence:sync`.

## Web sign-in

1. `signIn()` makes a random nonce, stores it under `cadence:sign-in` with the time, and goes to `/api/auth/wca/login?nonce=<nonce>`.
2. The Worker sets an `HttpOnly` cookie `__Host-cadence_oauth=<state>.web.<nonce>` for ten minutes. It then redirects to WCA's authorize page with the registered redirect URI, `https://timer.serendeep.app/api/auth/wca/callback`.
3. WCA sends the user back to the callback. The Worker checks that `state` matches the cookie, exchanges the code with the client secret and reads `/api/v0/me`. It creates a token in the user's store and redirects to `/#/settings?auth=<token>&nonce=<nonce>`.
4. On load, `readRedirect()` removes the token from the address bar. It accepts the token only if the nonce matches the one stored in the last 15 minutes. Each nonce works once.

Why it's built this way:

- **The token travels only in the URL fragment.** Browsers never send the fragment to servers or put it in `Referer`.
- **The nonce blocks planted tokens.** Without it, a crafted link carrying someone else's token could sign a device into that account and upload its solves there.

## Desktop sign-in

1. The app calls `window.desktop.signIn()`.
2. Electron opens a modal window on `/api/auth/wca/login?client=desktop`, in an in-memory session. The window may only navigate to the WCA site and timer.serendeep.app.
3. The Worker finishes at `/auth/desktop#token=…` (or `#error=…`).
4. Electron catches that redirect before it loads, closes the window and hands the token back.

No nonce is needed, because the token never passes through a page.

## Records

Everything syncs as records:

```json
{ "kind": "solve", "uid": "6f1c…", "updated": 1793870214499, "deleted": false, "data": { "time": 9120, "penalty": "ok", "sessionUid": "53ab…" } }
```

- `kind` is `session`, `solve` or `settings`. Settings are a single record with uid `settings`.
- `updated` is the editing device's clock in milliseconds.
- `deleted: true` marks a tombstone, which has no `data`.
- A solve names its session by `sessionUid`, never by local id.
- The first-launch "Main" session has the fixed uid `default-main-333` on every device, so it syncs as one session. See [architecture.md](architecture.md#row-identity).

## The sync request

The client sends `POST /api/sync` with `{ since, changes }`. The server:

1. Applies each change whose `updated` is newer than what it holds. An equal value means it already has that edit.
2. Gives every applied change the next value of the account's version counter.
3. Answers `{ version, more, changes }` with the records whose version is above `since`, up to about 4 MB per answer.

The client repeats until it has nothing left to push and `more` is false.

### On the device

`pushAndPull` in `sync.ts` does the device's half.

**Pushing**

- Local changes are rows with `updated` above `pushedAt`, plus the tombstones, plus the settings if they changed. `pushedAt` is the start of the last full push, minus a second of overlap.
- Sessions go before solves, and changes go up 200 at a time.
- Tombstones are deleted once the server has them.

**Pulling**

- Incoming records are applied in one Dexie transaction, without counting as local edits. Sessions come before solves.
- The newest edit wins. A local deletion newer than an incoming edit wins too.
- A session deleted elsewhere is kept if it holds solves that haven't been pushed yet. Its `updated` is bumped, so it comes back on the other devices.

### When sync runs

- two seconds after a local edit
- when the app returns to the foreground
- when the device comes online
- every five minutes
- on Sync now

## Limits

| Limit | Value |
| --- | --- |
| Sign-in requests per IP | 20 a minute each for starting and finishing |
| API requests per account | 120 a minute |
| Request body | 8 MB |
| Changes per request | 500 |
| One record | 64 KB |
| One account | 500,000 records or 512 MB |

Going over the account limit rolls back the whole request and returns 507. The app then tells the user that new solves stay on the device.

## Endpoints

| Method and path | Auth | Answer |
| --- | --- | --- |
| `GET /api/auth/wca/login?nonce=…` or `?client=desktop` | none | redirect to WCA |
| `GET /api/auth/wca/callback` | state cookie | redirect into the app with a token or an error |
| `GET /api/me` | bearer | `{ id, wcaId, name, avatar }` |
| `POST /api/sync` | bearer | `{ version, more, changes }` |
| `POST /api/auth/logout` | bearer | revokes this device's token |
| `DELETE /api/account` | bearer | erases the account's store and every token |
| `POST /api/log` | none | diagnostics, only from devices that opted in |

CORS allows three origins: `https://timer.serendeep.app`, `app://bundle` (the desktop app) and `http://localhost:5173` (development).
