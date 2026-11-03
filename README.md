<img src="build/icon.svg" width="64" height="64" alt="">

# better-cstimer

A speedcubing timer for the desktop and the browser. It keeps out of the way while you solve and tells you what changed afterwards.

- **Focus timer.** Everything but the time fades out while you solve. Hold space (or touch) until the time turns green, release to start, press any key to stop. WCA inspection with spoken 8 s and 12 s calls, and +2 or DNF applied automatically.
- **Phases.** Tap space at the end of each phase for cross, F2L, OLL and PLL splits, or let a smart cube detect them.
- **Every WCA event**, with scrambles and previews from cubing.js.
- **Inputs:** keyboard and touch, a Stackmat through the audio jack, the GAN Smart Timer, and smart cubes: GAN (Gen 2, 3 and 4), MoYu V10 AI / MoYu32, MoYu WeiLong AI, GiiKER, GoCube, QiYi and HeyKube.
- **Smart cube lab.** A live 3D cube follows your turns. The app guides your scramble, starts on the first turn, stops when solved, and records every move for a 3D replay.
- **Insights:** WCA averages (ao5 to ao1000), progress with rolling averages, the spread of your times, day-by-day trends, phase breakdowns, practice habits and a PB timeline.
- **Your data stays local** in IndexedDB. It imports csTimer exports and exports to its own backup format or back to csTimer.

## Desktop app

```bash
npm install
npm run dist:linux     # release/better-cstimer-<version>.AppImage and .pacman
sudo pacman -U release/better-cstimer-*.pacman
```

`dist:win` and `dist:mac` build the other platforms. The desktop app bundles its own Chromium, so Bluetooth works on Linux without a browser flag.

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
