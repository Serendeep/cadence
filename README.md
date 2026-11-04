<img src="build/icon.svg" width="64" height="64" alt="">

# Cadence

A speedcubing timer for the desktop, the browser and your phone. It keeps out of the way while you solve and tells you what changed afterwards.

- **Focus timer.** Everything but the time fades out while you solve. Hold space (or touch) until the time turns green, release to start, press any key to stop. WCA inspection with spoken 8 s and 12 s calls, and +2 or DNF applied automatically.
- **Phases.** Tap space at the end of each phase for cross, F2L, OLL and PLL splits, or let a smart cube detect them.
- **Every WCA event**, with scrambles and previews from cubing.js.
- **Inputs:** keyboard and touch, a Stackmat through the audio jack, the GAN Smart Timer, and smart cubes: GAN (Gen 2, 3 and 4), MoYu V10 AI / MoYu32, MoYu WeiLong AI, GiiKER, GoCube, QiYi and HeyKube.
- **Smart cube lab.** A live 3D cube follows your turns. The app guides your scramble, starts on the first turn, stops when solved, and records every move for a 3D replay.
- **Insights:** WCA averages (ao5 to ao1000), progress with rolling averages, the spread of your times, day-by-day trends, phase breakdowns, practice habits and a PB timeline.
- **Your data stays local** in IndexedDB. It imports csTimer exports and exports to its own backup format or back to csTimer.

## Install

**On a phone or any browser,** open [timer.serendeep.app](https://timer.serendeep.app). In Chrome or Edge, tap Install when the app offers it, or use Settings > Install the app. On an iPhone, tap Share, then Add to Home Screen. The installed app works offline and updates itself; a Reload button appears when a new version is ready.

**On a computer,** download the file for your system from [Releases](https://github.com/Serendeep/cadence/releases/latest). The builds are not code-signed yet, so each system asks once before the first launch.

- **macOS:** open the `.dmg` (`arm64` for Apple silicon, the other one for Intel) and drag the app to Applications. On first launch macOS refuses to open it; go to System Settings > Privacy & Security and click Open Anyway. If macOS says the app is damaged, run `xattr -cr /Applications/Cadence.app` in Terminal.
- **Windows:** run the `.exe` installer. When SmartScreen shows "Windows protected your PC", click More info, then Run anyway.
- **Linux:** the `.AppImage` runs anywhere after `chmod +x Cadence-*.AppImage`. There are also `.deb` and `.pacman` packages (`sudo apt install ./cadence_*.deb`, `sudo pacman -U cadence-*.pacman`).

The app checks for a new version at launch and every six hours. On Windows and with the AppImage it downloads the update and offers a restart. On macOS and with the `.deb` or `.pacman` packages it links you to the download instead, because unsigned Mac apps can't replace themselves and the package manager owns those installs.

## Building and releasing

```bash
npm install
npm run dist:linux     # release/: AppImage, .deb and .pacman
```

`dist:win` and `dist:mac` build the other platforms. The desktop app bundles its own Chromium, so Bluetooth works on Linux without a browser flag.

To release, bump the version and push the tag:

```bash
npm version minor      # or patch; commits and tags vX.Y.Z
git push --follow-tags
```

The release workflow builds macOS, Windows and Linux on GitHub Actions and uploads everything to a draft release. Publishing the draft is what makes installed apps see the update.

## Development

```bash
npm run dev        # browser at http://localhost:5173
npm run desktop    # the same app inside Electron, with hot reload
npm test           # unit tests: averages, timer, cube model, CFOP detection, Stackmat, MoYu, import
npm run build
```

In a browser, Bluetooth works only in Chrome, Edge and Opera. Safari and Firefox get every feature except smart cubes and the GAN timer.

## Licence

GPL-3.0-or-later. The MoYu drivers and the Stackmat protocol details are adapted from [csTimer](https://github.com/cs0x7f/cstimer) by Shuang Chen. Scrambles and 3D cubes come from [cubing.js](https://github.com/cubing/cubing.js); GAN Bluetooth support from [gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth).
