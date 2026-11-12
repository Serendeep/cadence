# Deploying and releasing

Cadence ships in two ways. The web app and API deploy from your machine to Cloudflare. The desktop apps build in GitHub Actions from a version tag.

## The web app and API

Both are one Cloudflare Worker named `cadence`, served on the custom domain timer.serendeep.app (see `wrangler.jsonc`). `workers.dev` and preview URLs are off, because the WCA redirect URI and the CORS list name only the custom domain.

```bash
npm run deploy                              # tsc -b, vite build, wrangler deploy
npx wrangler tail cadence --format pretty   # live logs
```

Installed web apps pick up a new deploy the next time they load. They show a Reload button rather than switching mid-session.

### Secrets

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

### The WCA application

It must have `https://timer.serendeep.app/api/auth/wca/callback` as its redirect URI, and the `public` scope.

### The Durable Object

Migration `v1` (`new_sqlite_classes`) created the `UserStore` class. Renaming or removing the class needs a new migration entry. Never edit `v1`.

## Desktop releases

Two GitHub workflows handle the desktop apps:

- **`desktop`** checks macOS packaging on branch pushes.
- **`release`** builds Windows, macOS and Linux from tags.

To cut a release:

```bash
npm version patch       # or minor; commits and tags vX.Y.Z
git push --follow-tags
```

The `release` workflow runs the tests, builds all three platforms and uploads them to a **draft** release on GitHub. Installed apps see the update only once you publish the draft, so first check that every platform's files are attached.

### What each platform gets

| Platform | Files | Updates |
| --- | --- | --- |
| Windows | one-click NSIS installer, per user, no admin prompt | installs itself; the build is unsigned, so `verifyUpdateCodeSignature` is off |
| macOS | `.dmg` and `.zip` for arm64 and x64, unsigned | links to the release page, because Squirrel.Mac refuses unsigned updates |
| Linux | AppImage | installs itself |
| Linux | `.deb` and `.pacman` | links to the release page, because the package manager owns the install |

### Where desktop data lives

The desktop app keeps its data in the `better-cstimer` folder under the system's app data directory when one exists. That way, installs from before the rename keep their solves.
