# User guide

This guide covers timing with the keyboard or a touch screen, sessions, Insights, moving your history in and out, and sync. Smart cubes and external timers have their own page: [Smart cubes and timers](smart-cubes.md).

## Timing a solve

1. Read the scramble at the top and scramble your cube. The cube net in the corner shows what it should look like.
2. Hold space, or touch and hold anywhere on a phone, until the time turns green.
3. Let go to start. Everything except the time fades out.
4. Press any key, or touch the screen, to stop.

The result appears with OK, +2 and DNF buttons and a delete button. Penalties change the solve straight away, and a deleted solve can be brought back with Undo in the message that appears.

| Key | What it does |
| --- | --- |
| Space | Hold and release to start; with inspection on, press once to start inspecting |
| Any key | Stops a running solve |
| Escape | Cancels inspection or a running solve, and closes dialogs and the solve drawer |
| ← and → | In the solve drawer, move to the newer or older solve |

The arrow next to "Next scramble" goes back to the previous scramble, and the copy button copies the current one.

### Typing times in

To record times from another timer, choose input > Type times in. Type the time and press Enter. Cadence reads times the way csTimer does: digits alone fill from the right, so `1234` is 12.34 and `12345` is 1:23.45. `12.34` and `1:02.50` work as written, a trailing `+` adds two seconds (`12.34+`), and `DNF` saves a DNF.

### Inspection

Turn on Inspection in Settings, or tap "inspection off" above the scramble. Pressing space starts the WCA 15 seconds. A voice calls out 8 and 12 seconds; pick male, female or off. Starting after 15 seconds adds +2, and after 17 seconds the solve is a DNF. Blindfolded events skip inspection.

### Phases

Settings > Timing > Phases splits a solve into up to eight parts. With four phases they are named Cross, F2L, OLL and PLL; tap space at the end of each one and the last tap stops the timer. A bar under the time shows how long each phase took. Smart cubes detect the CFOP phases on their own, so you don't need to tap.

### Other timing settings

- **Hold to start:** how long space or a touch must be held before the time turns green, from instant to one second.
- **While solving:** show the running time, only whole seconds, or nothing.
- **Precision and preview:** two or three decimals, and whether the scramble preview is shown.
- **Keep the screen on:** stops a phone or laptop from dimming or locking while Cadence is open.

## Sessions

Each session belongs to one event and keeps its own averages. The Solves page lists the current session's solves, newest first, grouped by day, with ao5 and ao12 for each one. Pick another session from the menu at the top. "More" holds New session, Rename, Delete session and Import from csTimer.

Click a solve to open its drawer. It shows the date, penalties, the phase bar, the scramble with a cube net, a comment field, and for smart cube solves the full reconstruction with a 3D replay.

Changing the event above the timer switches to your session for that event, or makes one. If the current session has no solves yet, it simply changes that session's event.

## Insights

Insights describes the current session, or every session of the same event with the switch at the top right. It shows your counts, best single and averages, and standard deviation. Below that:

- **Progress:** every single, with a rolling ao5, ao12, ao50 or ao100 drawn over it.
- **Where your times land:** how many solves fall in each time bucket; the highlighted bar holds your current ao12.
- **Day by day:** the daily mean and best over your last 60 practice days.
- Phase averages when your solves have splits, and a timeline of personal bests.

## Coach

Coach is off until you turn it on in Settings > Coach. It reads every solve of the current event and names what costs you the most time, measured against your own solving rather than anyone else's.

It looks for four things, each only once there is enough data to trust:

- **A slow phase.** With 60 or more solves that carry CFOP splits (four phases, or a smart cube), it compares your last 20 with the best stretch of 20 you have done. A phase more than 0.3 s slower than in that stretch is a finding.
- **Slow solves.** Over your last 50 solves (25 at least), it adds up how much the solves more than 20% above your median raise your mean.
- **Warm-up.** Across sittings of 10 solves or more, it checks whether your first 3 solves are slower than the rest. A sitting ends at a break of 10 minutes.
- **Fatigue.** Across sittings of 30 solves or more, it checks whether your last 10 are slower than the middle.

The finding that would save the most time per solve comes first, with a short drill. Press **Work on this** and Coach notes where you started. From then on it shows the before and after, for example `F2L: 10.60 → 9.80 s over 24 solves`, until you press **Done with this**. The finding you work on syncs with your other settings.

On a 3x3 event, a slow F2L, OLL or PLL also gets **Practise this**, and F2L gets **Last slot only** as well. Pressing one opens the timer in drill mode, with scrambles that leave everything before that phase solved: the cross for F2L, the cross and three pairs for last slot, F2L for OLL, and F2L plus OLL for PLL. Scramble with white on top and green in front as usual. The drilled pieces end up on the bottom, so turn the cube over to start. A bar above the scramble shows the drill, how many solves you have done and their mean. For PLL, **Cases** lets you pick which cases come up. OLL cases are random for now. Drill solves go to their own session, such as `3x3 drills`. Coach, the Coach card and the "All 3x3" view in Insights leave them out, so practice never changes your stats. **End drill** takes you back to the session you were in. Drill mode belongs to the device it was started on and does not sync, though the drill solves do.

When you come back to the timer after a break of 10 minutes or more, a card sums up the sitting you just finished: how many solves, the mean against your usual, your best, and the top finding. It goes away when you dismiss it or start the next solve.

## Bringing your history over from csTimer

1. In csTimer, open Export and choose Export to file.
2. In Cadence, open Settings and either click Choose file under Import from csTimer or drop the file anywhere on the Settings page.
3. A preview lists every session in the file, how many solves each adds, and whether it tops up a session you already have or becomes a new one.
4. Click Import. Cadence opens the biggest imported session.

Solves you already have (same finish time, time and scramble) are skipped, so importing the same file twice adds nothing. A session with the same name and event as one of yours is topped up rather than duplicated, which means you can keep timing in csTimer for a while and import a fresh export now and then. A Cadence backup file imports the same way.

## Backups and export

Settings > Your data > Export saves either a full Cadence backup (`.json`) or a file in csTimer's format, so your solves can go back to csTimer.

Settings > Your data > Delete everything removes all sessions and solves from this device. If you are signed in, it signs this device out first, so the copy in your account stays.

## Sync

Sign in under Settings > Account with your World Cube Association account. You don't need to have competed; any WCA website account works.

Once signed in, Cadence syncs a couple of seconds after each change, when the app comes back to the foreground, when the device goes online again, and every five minutes. The account row shows when it last synced, and Sync now runs one straight away.

What syncs:

- sessions, solves, penalties and comments, and smart cube moves and rotations
- settings such as theme, inspection and phases

Some settings describe the device rather than you, so they stay on each device: the input (keyboard, Stackmat, smart cube), the session currently open, and Share diagnostics.

When two devices change the same solve, the later change wins. If you delete a session on one device while another device has new solves in it that haven't synced yet, those solves are kept and the session comes back.

Sign out keeps your solves on the device. Delete synced data erases the copy kept for syncing and signs out every device; each device keeps the solves it already has.

## Installing

See [Install](../README.md#install) in the README for phones, browsers and the desktop apps.

After an update, the timer offers a short **What's new** list; it opens only if you tap it. The same list, the version you run, and links to star the project on GitHub or share it are under Settings > About. Once you have used Cadence for a while (100 solves over 3 days, then 300 solves), it asks once each whether you would star it and share it. Closing either message means it never asks again.
