# Deploying and releasing

## The web app and API

The web app and the API are one Cloudflare Worker named `cadence`, served on the custom domain timer.serendeep.app (`wrangler.jsonc`). `workers.dev` and preview URLs are off, because the WCA redirect URI and the CORS list name only the custom domain.

```bash
npm run deploy          # tsc -b, vite build, wrangler deploy
npx wrangler tail cadence --format pretty   # live logs
```

The Worker needs three secrets, set once:

| Secret | What it is |
| --- | --- |
| `WCA_APPLICATION_ID` | the Cadence application's id on worldcubeassociation.org |
| `WCA_SECRET` | that application's secret |
| `SESSION_SECRET` | a long random string that signs sign-in tokens; changing it signs everyone out |

Pipe each one from `.env.local`, so it never appears on a command line or in shell history:

```bash
grep '^WCA_SECRET=' .env.local | cut -d= -f2- | tr -d '\n' | npx wrangler secret put WCA_SECRET
```

The WCA application must have `https://timer.serendeep.app/api/auth/wca/callback` as its redirect URI and the `public` scope.

The Durable Object class `UserStore` was created by migration `v1` (`new_sqlite_classes`). Renaming or removing it needs a new migration entry; never edit `v1`.

Installed web apps pick up a new deploy the next time they load. They show a Reload button rather than switching mid-session.

## Desktop releases

The `desktop` workflow builds every push on macOS (Intel runner), Windows and Linux to catch packaging breaks. Releases come from tags:

```bash
npm version patch       # or minor; commits and tags vX.Y.Z
git push --follow-tags
```

The `release` workflow runs the tests, builds all three platforms and uploads them to a **draft** release on GitHub. Installed apps only see an update once you publish the draft, so check that every platform's files are attached first.

What each platform gets:

- **Windows:** a one-click NSIS installer, per user, with no admin prompt. It updates itself. The build is unsigned, so `verifyUpdateCodeSignature` is off.
- **macOS:** `.dmg` and `.zip` for arm64 and x64, unsigned. Squirrel.Mac refuses unsigned updates, so the app links to the release page instead.
- **Linux:** AppImage (updates itself), `.deb` and `.pacman` (the update links to the release page; the package manager owns the install).

The desktop app keeps its data in the `better-cstimer` folder under the system's app data directory when one exists, so installs from before the rename keep their solves.
