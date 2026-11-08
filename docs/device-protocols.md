# Device protocols

Notes on the wire formats Cadence speaks, for anyone fixing or adding a driver. Several are adapted from csTimer; where we learned something from real hardware, it says so.

## MoYu32 (MoYu V10 AI and relatives)

`src/lib/moyu.ts`, `connectMoyu32`.

- Service `0783b03e-7735-b5a0-1760-a305d2795cb0`; it reads from `…cb1` (notifications) and writes to `…cb2`.
- Every packet is 20 bytes, encrypted with AES-128. The key and IV are fixed tables with the cube's MAC address added to the first six bytes, MAC bytes in reverse order, modulo 255. The first 16 bytes and the last 16 bytes are each decrypted as one AES block and XORed with the IV.
- The first decrypted byte is the message type: 161 info, 163 state, 164 battery, 165 moves, 171 gyroscope, 172 gyroscope acknowledgement.
- After connecting, Cadence sends 161, 163 and 164 and waits up to 3 s for an answer that decrypts to one of those types. It tries four times before deciding the MAC is wrong (a V10 AI has taken about 9 s to answer).
- Request 172 with payload `[0, 1]` turns the gyroscope stream on, and `[0, 0]` turns it off.
- A 171 packet carries a quaternion as four little-endian int32 values at bytes 1 to 16, each divided by 2³⁰, in the order w, x, −z, y. Tested on a V10 AI: after that reordering, the axes already match the screen (+X is R, +Y is U, +Z is F).
- A 165 packet holds a move counter and up to five moves of 5 bits each (`FBUDLR`, with odd values meaning counter-clockwise) and their time gaps. Moves the counter says were missed are logged as lost.

**Finding the MAC.** The cube's advertisement has manufacturer data under a company id of 0x0000 (unbound) or `n << 8` (bound to an account); its last six bytes, reversed, are the MAC. Browsers only hand this over through `watchAdvertisements`, which in Chrome needs Experimental Web Platform features and never fires on Linux. After that, Cadence tries a remembered MAC (stored per cube name once a handshake succeeds), then a guess from the name (`WCU_MY32_XXYY` → `CF:30:16:00:XX:YY`), then asks the user.

## MoYu WeiLong AI (classic)

`connectMoyuClassic`. Each face reports its rotation in ninths of a turn. A move is counted when a face crosses the halfway mark of a quarter turn.

## GAN smart cubes

`src/lib/devices.ts`, through [gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth), which handles Gen 2, 3 and 4 encryption. Cadence uses [a fork](https://github.com/Serendeep/gan-web-bluetooth/tree/reconnect) (tag `v3.0.2-cadence.1`) that adds one thing: `connectGanCube(provider, device)` reconnects to a device from an earlier connection without the chooser, so a dropped cube can come back on its own. Gyroscope readings arrive in the cube's own axes and are mapped to the screen as (x, z, −y) in `orientation.ts`.

## Other smart cubes

GiiKER, GoCube, QiYi and HeyKube connect through cubing.js's `bluetooth` module, which reports moves only.

## GAN Smart Timer

`src/lib/ganTimer.ts`. Our own driver: gan-web-bluetooth's timer support expects characteristic `fff2`, which some timers (seen on a GAN-728AC1) do not have.

- Service `0000fff0-…`, state characteristic `0000fff5-…` (notifications).
- Packets start with `0xFE`, and byte 1 is the length (the total length minus 2). The trailing CRC matches no common CRC-16, so packets are checked by this structure instead.
- Byte 3 is the state: 1 ready, 2 hands off, 3 running, 4 stopped, 5 idle, 6 hands on, 7 finished and 8 inspection (7 and 8 are ignored).
- A stopped packet carries the time at bytes 4 to 7: minutes, seconds, then milliseconds as a little-endian 16-bit number.
- Connecting retries three times with 600 ms between tries, since the first GATT connection often fails on Android.

## Stackmat

`src/lib/stackmat.ts`. Gen 2 to 5 SpeedStacks timers send serial frames at about 1200 baud (8N1) through the audio cable. A frame is the status byte, five or six ASCII digits, a checksum (64 plus the sum of the digits) and `\n\r`. The decoder works on signal edges rather than levels, so the slow droop of an AC-coupled sound card input while the line is idle does no harm.

## Orientation and rotations

`src/lib/orientation.ts`, `src/lib/rotations.ts`. Quaternions are `{x, y, z, w}` in screen axes. The orientation shown is `now × conj(home)`, where home is the first reading after connecting or after Reset orientation. A rotation is reported when the snapped square orientation changes and stays changed for 250 ms. Its name is found by a breadth-first search over x, y and z tokens, applied in the solver's frame.
