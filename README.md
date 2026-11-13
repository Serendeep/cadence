<img src="build/icon.svg" width="64" height="64" alt="">

# Cadence

A speedcubing timer for the desktop, the browser and your phone. It stays out of the way while you solve, then tells you what changed.

**Open it at [timer.serendeep.app](https://timer.serendeep.app)**, or get the desktop app from [Releases](https://github.com/Serendeep/cadence/releases/latest).

## What it does

- **Focus timer.** Everything but the time fades while you solve. Hold space (or touch) until the time turns green, let go to start, press any key to stop.
- **WCA inspection.** A voice calls out 8 s and 12 s, and Cadence applies +2 or DNF for you.
- **Every WCA event**, with scrambles and previews from cubing.js.
- **Your choice of input.** Keyboard and touch, a Stackmat through the audio jack, the GAN Smart Timer, or a Bluetooth smart cube (GAN Gen 2, 3 and 4, MoYu V10 AI / MoYu32, MoYu WeiLong AI, GiiKER, GoCube, QiYi, HeyKube).
- **Smart cube lab.** A 3D cube follows your turns, and on cubes with a gyroscope, how you hold it. Cadence guides the scramble, times from your first turn until the cube is solved, splits the solve into CFOP or Roux phases, counts rotations and keeps every move for a 3D replay.
- **Insights.** Averages from ao5 to ao1000, rolling progress, the spread of your times, daily trends, phase breakdowns and a PB timeline.
- **Coach.** Optional. It finds what costs you the most time and sets up drills for it.
- **Coming from csTimer?** Drop your csTimer export on the Settings page. Importing the same file again adds nothing, so you can keep topping up from newer exports.
- **Sync, if you want it.** Sign in with a WCA account to keep everything the same across devices. Without signing in, nothing leaves your device.

## Install

**Phone or browser.** Open [timer.serendeep.app](https://timer.serendeep.app).

- In Chrome or Edge, tap Install when offered, or use Settings > Account > Install the app.
- On an iPhone, tap Share, then Add to Home Screen.

The installed app works offline and updates itself. A Reload button appears when a new version is ready.

**Computer.** Download the file for your system from [Releases](https://github.com/Serendeep/cadence/releases/latest). The builds aren't code-signed, so each system asks once before the first launch.

| System | What to do |
| --- | --- |
| Windows | Run the `.exe`. It installs for your user only, with no admin prompt, and opens when done. If SmartScreen says "Windows protected your PC", click More info, then Run anyway. |
| macOS | Open the `.dmg` (`arm64` for Apple silicon, the other for Intel) and drag the app to Applications. On first launch, go to System Settings > Privacy & Security and click Open Anyway. If macOS calls the app damaged, run `xattr -cr /Applications/Cadence.app` in Terminal. |
| Linux | Run the `.AppImage` after `chmod +x Cadence-*.AppImage`. Or install a package: `sudo apt install ./cadence_*.deb` or `sudo pacman -U cadence-*.pacman`. |

The desktop app checks for updates at launch and every six hours. On Windows and with the AppImage, it downloads the update and offers a restart. On macOS and with the `.deb` or `.pacman` packages, it links you to the download instead: unsigned Mac apps can't replace themselves, and the package manager owns those installs.

## Your data

Solves live in the browser's or the desktop app's own database. Nothing leaves the device unless you choose one of these:

- **Sign in to sync.** Sessions, solves and settings are stored under your WCA account so your other devices can fetch them. Settings > Account > Delete synced data erases that copy.
- **Turn on Share diagnostics.** Cadence then sends device connection steps and error messages. Never solves, times or your name.

## Documentation

For people using Cadence:

- [User guide](docs/user-guide.md): timing, sessions, Insights, Coach, import and export, sync.
- [Smart cubes and timers](docs/smart-cubes.md): connecting each device, the lab, rotations, fixing Bluetooth.

For contributors:

- [Development](docs/development.md): setup, scripts, the local sync server, fake devices.
- [Architecture](docs/architecture.md): where things live and why.
- [Sync and sign-in](docs/sync.md): accounts, tokens and the sync protocol.
- [Device protocols](docs/device-protocols.md): the wire formats each driver speaks.
- [Deploying and releasing](docs/releasing.md): the Worker, its secrets and desktop builds.

## Development

```bash
npm install
npm run dev        # browser at http://localhost:5173
npm run desktop    # the same app inside Electron, with hot reload
npm test
```

[docs/development.md](docs/development.md) covers the rest, including running the sync server locally.

## Support

Cadence is free and has no ads. If it helps your solving, you can [buy me a coffee](https://buymeacoffee.com/serendeep).

## Licence

GPL-3.0-or-later.

The MoYu drivers, the GAN timer protocol, the Stackmat protocol and the inspection voices are adapted from [csTimer](https://github.com/cs0x7f/cstimer) by Shuang Chen. Scrambles and 3D cubes come from [cubing.js](https://github.com/cubing/cubing.js), and GAN cube support from [gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth).
