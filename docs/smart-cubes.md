# Smart cubes and timers

Cadence works with Bluetooth smart cubes, the GAN Smart Timer and a Stackmat. Connect one under Settings > Devices.

## Which browser

Bluetooth needs Chrome, Edge or Opera, or the Cadence desktop app. Safari and Firefox have every other feature.

- iPhone and iPad: no browser there can reach Bluetooth devices, so smart cubes don't work.
- Linux: the desktop app is the most reliable choice, because it ships its own Chromium with Bluetooth turned on.

## Connecting a cube

### GAN

Click GAN cube and pick your cube in the list. Gen 2, Gen 3 and Gen 4 cubes work. Cubes with a gyroscope also turn the on-screen cube as you move it.

### MoYu V10 AI and other MoYu32 cubes

Click MoYu V10 AI / MoYu32 and pick the cube. Its name starts with `WCU_MY3`.

These cubes encrypt their moves with their own Bluetooth address (MAC), so Cadence has to know it. It tries four sources in order:

1. The cube itself. It broadcasts its address, and Cadence reads it when the browser lets it see those broadcasts. The desktop app always does. Chrome on Android, Windows and macOS does only after you open `chrome://flags`, turn on **Experimental Web Platform features** and restart Chrome.
2. An earlier connection. Once a cube has connected properly, Cadence remembers its address.
3. Its name. Cadence guesses the address from the cube's name. The guess is right for many cubes, but not all.
4. You. If the cube doesn't answer, Cadence asks. A Bluetooth scanner app such as nRF Connect shows the address next to the cube's name. On Linux, `bluetoothctl devices` lists it.

The first answer after connecting can take up to ten seconds, so Cadence waits before deciding the address is wrong.

### MoYu WeiLong AI, GiiKER, GoCube, QiYi and HeyKube

Use the matching button. These cubes have no gyroscope, so the on-screen cube shows your turns but not how you hold the cube.

## The smart cube lab

With a cube connected, the timer page becomes the lab: a 3D cube on one side, your time and phases on the other, and a strip of your latest moves along the bottom.

### Scrambling

The whole scramble stays on screen. Moves you have done fade, and the next one is underlined. A dotted underline means you have done half of a double turn.

If you turn the wrong way, Cadence shows the moves that undo it. The scramble picks up again once you have.

### Solving

The timer starts on your first turn after the scramble and stops the moment the cube is solved. With inspection on, inspection starts when the scramble is done.

The phases fill in as you reach them, on whichever colour you solve from:

- CFOP: Cross, F2L, OLL, PLL.
- Roux (set the method in Settings > Timing): First block, Second block, CMLL, LSE. Cadence finds your blocks on any side and colour. M moves reach Cadence as turns of both outer layers, and they don't break the blocks. CMLL counts as done once the top corners match the blocks, even before the last U turn.

### After the solve

Each phase shows its time and move count, and the live stats show turns per second, moves and rotations. The solve's drawer on the Solves page has the full reconstruction and a 3D replay.

### When something goes wrong

- The cube and the screen disagree, for example after you reset the cube by hand: solve the real cube and press Mark solved.
- The timer keeps running after you solve: the cube's last turn never reached Cadence. Press Finish solve. The solve stops at the last turn that did arrive and is saved.

## Rotations

On cubes with a gyroscope, Cadence notices when you turn the whole cube, such as a y before the last F2L pair or an x2 before the last layer.

A rotation counts once the cube has settled in its new position for a quarter of a second, so wrist tilts and wobbles don't count. Slice moves (M, E, S) and wide moves turn the cube's core too, but they arrive together with face turns on the same axis, and Cadence leaves those out.

Rotations show in brackets in the move strip and the reconstruction, as a count in the stats, and per phase. Moves after a rotation are named the way you saw them: after a `(y)`, the turn of the face now in front of you is written F.

To line the screen up with your hands, hold the cube with white on top and green in front, and press Reset orientation.

Tracking uses a little more battery; Settings > Devices > Track cube rotations turns it off.

## GAN Smart Timer

Click GAN timer and pick the timer. Put your hands on the pads as usual. Cadence follows the timer's own start and stop, so the times match what it shows.

With inspection on, press space to start inspecting before you put your hands down.

## Stackmat

Plug the Stackmat into the audio input with a 3.5 mm cable, click Stackmat and allow microphone access. Cadence reads the timer's signal, not sound.

## Fixing Bluetooth

### The device list is empty

- Turn the cube on and turn a face to wake it.
- Make sure no other app or tab is connected to it.
- On Android, allow Chrome to find nearby devices. On Android 11 and older, Location must be on too.

### Linux finds nothing

The system needs BlueZ running. On Arch, for example:

```bash
sudo pacman -S bluez bluez-utils
sudo systemctl enable --now bluetooth
```

If `bluetoothctl show` lists no controller, the adapter itself is stuck. A full power-off (not a restart) usually brings it back.

### A MoYu cube connects but no moves appear

The address is probably wrong. Disconnect, connect again, and enter the address from a scanner app when asked.

### The cube disconnects

GAN and MoYu cubes reconnect by themselves. Cadence tries three times over about ten seconds and tells you how it went. If that fails, choose the cube again under Settings > Devices.

Turns made while the cube was away are lost, so press Mark solved once the real cube is solved again.

If the connection drops during a solve, the timer stops at your last turn and the solve waits for you. Press Finish solve to save it at that time, or Discard to drop it. Nothing is saved until you choose.

### The GAN timer misses starts or stops

Keep the timer within a couple of metres. Before you report it, turn on Settings > Your data > Share diagnostics, so the connection steps reach us.
