# Sync and sign-in

Sync is optional. Without signing in, nothing about a user's solves reaches the server.

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

An account is a WCA website account, keyed by its numeric id from `/api/v0/me` (not the competitor id, which only competitors have). Each account gets one `UserStore` Durable Object, found with `USERS.getByName(<id>)`.

A device holds a bearer token:

```
<WCA user id>.<token id>.<HMAC-SHA256 of the first two, base64url>
```

The HMAC key is the `SESSION_SECRET` Worker secret. The token id is also a row in the user's `tokens` table, so a token can be revoked (sign out, Delete synced data) and stops working after 180 days without use. Tokens sit in localStorage under `cadence:sync`.

## Web sign-in

1. `signIn()` makes a random nonce, stores it under `cadence:sign-in` with the time, and goes to `/api/auth/wca/login?nonce=<nonce>`.
2. The Worker sets an `HttpOnly` cookie `__Host-cadence_oauth=<state>.web.<nonce>` for ten minutes and redirects to WCA's authorize page with the registered redirect URI, `https://timer.serendeep.app/api/auth/wca/callback`.
3. WCA sends the user back to the callback. The Worker checks that `state` matches the cookie, exchanges the code with the client secret, reads `/api/v0/me`, creates a token in the user's store and redirects to `/#/settings?auth=<token>&nonce=<nonce>`.
4. On load, `readRedirect()` removes the token from the address bar and accepts it only if the nonce matches the stored one from the last 15 minutes. Each nonce works once.

The token travels only in the URL fragment, which browsers never send to servers or put in `Referer`. The nonce stops a crafted link carrying someone else's token from signing a device into that account and uploading its solves there.

## Desktop sign-in

The app calls `window.desktop.signIn()`. Electron opens a modal window on `/api/auth/wca/login?client=desktop` in an in-memory session. The window may only navigate to the WCA site and timer.serendeep.app. The Worker finishes at `/auth/desktop#token=…` (or `#error=…`); Electron catches that redirect before it loads, closes the window and hands the token back. No nonce is needed, because the token never passes through a page.

## Records

Everything syncs as records:

```json
{ "kind": "solve", "uid": "6f1c…", "updated": 1793870214499, "deleted": false, "data": { "time": 9120, "penalty": "ok", "sessionUid": "53ab…" } }
```

- `kind` is `session`, `solve` or `settings` (a single record with uid `settings`).
- `updated` is the editing device's clock in milliseconds.
- `deleted: true` is a tombstone and has no `data`.
- A solve names its session by `sessionUid`, never by local id.

## The sync request

`POST /api/sync` with `{ since, changes }`:

1. The server applies each change if its `updated` is newer than what it holds. An equal value means it already has that edit.
2. Every applied change gets the next value of the account's version counter.
3. It answers with the records whose version is above `since`, up to about 4 MB per answer, as `{ version, more, changes }`.

The client repeats until it has nothing left to push and `more` is false.

On the device (`pushAndPull` in `sync.ts`):

- Local changes are rows with `updated` above `pushedAt` (the start of the last full push, minus a second of overlap), plus the tombstones and the settings if they changed.
- Sessions go before solves, and changes go up 200 at a time.
- Incoming records are applied in one Dexie transaction without counting as local edits. Sessions come before solves. The newest edit wins, and a local deletion newer than an incoming edit wins too.
- A session deleted elsewhere is kept if it holds solves that haven't been pushed yet. Its `updated` is bumped, so it comes back on the other devices.
- Tombstones are deleted once the server has them.

Sync runs two seconds after a local edit, when the app returns to the foreground, when the device comes online, every five minutes, and on Sync now.

## Limits

| Limit | Value |
| --- | --- |
| Sign-in requests per IP | 20 a minute each for starting and finishing |
| API requests per account | 120 a minute |
| Request body | 8 MB |
| Changes per request | 500 |
| One record | 64 KB |
| One account | 500,000 records or 512 MB |

Going over the account limit rolls back the whole request and returns 507. The app then says new solves stay on the device.

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

CORS allows `https://timer.serendeep.app`, `app://bundle` (the desktop app) and `http://localhost:5173` (development).
