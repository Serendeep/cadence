# Device protocols

Notes on the wire formats Cadence speaks, for anyone fixing or adding a driver. Several are adapted from csTimer. Where something was learned from real hardware, the notes say so.

## MoYu32 (MoYu V10 AI and relatives)

`src/lib/moyu.ts`, `connectMoyu32`.

### Connection

- Service `0783b03e-7735-b5a0-1760-a305d2795cb0`. Cadence reads from `…cb1` (notifications) and writes to `…cb2`.
- After connecting, Cadence sends 161, 163 and 164, then waits up to 3 s for an answer that decrypts to one of those types.
- It tries four times before deciding the MAC is wrong. A V10 AI has taken about 9 s to answer.

### Encryption

Every packet is 20 bytes, encrypted with AES-128.

- The key and IV are fixed tables, with the cube's MAC added to the first six bytes. The MAC bytes go in reverse order, and the sum is taken modulo 255.
- To decrypt, the first 16 bytes and the last 16 bytes are each decrypted as one AES block and XORed with the IV.

### Messages

The first decrypted byte is the message type.

| Type | Meaning |
| --- | --- |
| 161 | info |
| 163 | state |
| 164 | battery |
| 165 | moves |
| 171 | gyroscope |
| 172 | gyroscope acknowledgement |

- Request 172 with payload `[0, 1]` turns the stream on, and `[0, 0]` turns it off.
- A gyroscope packet (171) holds a quaternion as four little-endian int32 values at bytes 1 to 16, each divided by 2³⁰, in the order w, x, −z, y. Tested on a V10 AI: after that reordering, the axes already match the screen (+X is R, +Y is U, +Z is F).
- A moves packet (165) holds a move counter and up to five moves of 5 bits each, plus their time gaps. Moves are indexes into `FBUDLR`, and odd values mean counter-clockwise. Moves the counter says were missed are logged as lost.

### Finding the MAC

The cube's advertisement carries manufacturer data under company id 0x0000 (unbound) or `n << 8` (bound to an account). Its last six bytes, reversed, are the MAC.

Browsers only hand this over through `watchAdvertisements`. In Chrome that needs Experimental Web Platform features, and it never fires on Linux. So Cadence falls back, in order, to:

1. a remembered MAC, stored per cube name once a handshake succeeds;
2. a guess from the name: `WCU_MY32_XXYY` → `CF:30:16:00:XX:YY`;
3. asking the user.

## MoYu WeiLong AI (classic)

`connectMoyuClassic`. Each face reports its rotation in ninths of a turn. A move is counted when a face crosses the halfway mark of a quarter turn.

## GAN smart cubes

`src/lib/devices.ts`, through [gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth), which handles Gen 2, 3 and 4 encryption.

Cadence uses [a fork](https://github.com/Serendeep/gan-web-bluetooth/tree/reconnect) (tag `v3.0.2-cadence.1`) that adds one thing: `connectGanCube(provider, device)` reconnects to a device from an earlier connection without the chooser. That lets a dropped cube come back on its own.

Gyroscope readings arrive in the cube's own axes. `orientation.ts` maps them to the screen as (x, z, −y).

## Other smart cubes

GiiKER, GoCube, QiYi and HeyKube connect through cubing.js's `bluetooth` module, which reports moves only.

## GAN Smart Timer

`src/lib/ganTimer.ts`. This is Cadence's own driver, because gan-web-bluetooth's timer support expects characteristic `fff2`, and some timers (seen on a GAN-728AC1) don't have it.

- Service `0000fff0-…`, state characteristic `0000fff5-…` (notifications).
- Packets start with `0xFE`. Byte 1 is the length: the total length minus 2.
- The trailing CRC matches no common CRC-16, so packets are checked by their structure instead.
- A stopped packet carries the time at bytes 4 to 7: minutes, seconds, then milliseconds as a little-endian 16-bit number.
- Connecting retries three times, 600 ms apart, because the first GATT connection often fails on Android.

Byte 3 is the state:

| Value | State |
| --- | --- |
| 1 | ready |
| 2 | hands off |
| 3 | running |
| 4 | stopped |
| 5 | idle |
| 6 | hands on |
| 7 | finished (ignored) |
| 8 | inspection (ignored) |

## Stackmat

`src/lib/stackmat.ts`. Gen 2 to 5 SpeedStacks timers send serial frames at about 1200 baud (8N1) through the audio cable.

A frame is:

1. the status byte;
2. five or six ASCII digits;
3. a checksum: 64 plus the sum of the digits;
4. `\n\r`.

The decoder works on signal edges, not levels. That way, the slow droop of an AC-coupled sound card input while the line is idle does no harm.

## Orientation and rotations

`src/lib/orientation.ts`, `src/lib/rotations.ts`.

- Quaternions are `{x, y, z, w}` in screen axes.
- The orientation shown is `now × conj(home)`. Home is the first reading after connecting, or after Reset orientation.
- A rotation is reported when the snapped square orientation changes and stays changed for 250 ms.
- The rotation's name comes from a breadth-first search over x, y and z tokens, applied in the solver's frame.
