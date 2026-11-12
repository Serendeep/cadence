# User guide

How to time solves, manage sessions, read Insights, use Coach, and move your history in and out. Smart cubes and external timers have their own page: [Smart cubes and timers](smart-cubes.md).

## Timing a solve

1. Read the scramble at the top and scramble your cube. The cube net in the corner shows what it should look like.
2. Hold space, or touch and hold anywhere on a phone, until the time turns green.
3. Let go to start. Everything except the time fades out.
4. Press any key, or touch the screen, to stop.

The result appears with OK, +2, DNF and delete buttons. Penalties apply straight away. If you delete a solve by mistake, press Undo in the message that appears.

| Key | What it does |
| --- | --- |
| Space | Hold and release to start. With inspection on, press once to start inspecting. |
| Any key | Stops a running solve |
| Escape | Cancels inspection or a running solve; closes dialogs and the solve drawer |
| ← and → | In the solve drawer, move to the newer or older solve |

The arrow next to "Next scramble" goes back to the previous scramble. The copy button copies the current one.

### Typing times in

To record times from another timer, choose input > Type times in, type the time and press Enter. Cadence reads times the way csTimer does:

| You type | Saved as |
| --- | --- |
| `1234` | 12.34 (digits alone fill from the right) |
| `12345` | 1:23.45 |
| `12.34`, `1:02.50` | as written |
| `12.34+` | 12.34 with +2 |
| `DNF` | a DNF |

### Inspection

Turn on Inspection in Settings, or tap "inspection off" above the scramble. Pressing space then starts the WCA 15 seconds.

- A voice calls out 8 and 12 seconds. Pick male, female or off.
- Starting after 15 seconds adds +2. After 17 seconds, the solve is a DNF.
- Blindfolded events skip inspection.

### Phases

A connected smart cube splits each solve into four phases on its own, named after the method in Settings > Timing > Method:

- **CFOP:** Cross, F2L, OLL, PLL
- **Roux:** First block, Second block, CMLL, LSE

A bar under the time shows how long each phase took. Timing with the keyboard, touch or an external timer gives no splits: a press always stops the timer.

### Other timing settings

- **Hold to start:** how long space or a touch must be held before the time turns green, from instant to one second.
- **While solving:** show the running time, only whole seconds, or nothing.
- **Precision and preview:** two or three decimals, and whether the scramble preview is shown.
- **Keep the screen on:** stops a phone or laptop from dimming or locking while Cadence is open.

## Sessions

Each session belongs to one event and keeps its own averages.

**The Solves page** lists the current session's solves, newest first and grouped by day, with ao5 and ao12 for each. Pick another session from the menu at the top. "More" holds New session, Rename, Delete session, Import from csTimer, Archive and Merge into….

**The session menu above the timer** shows each session's event and solve count.

- **Archive** hides a session from that menu without deleting anything. Archived sessions sit under "Archived (N)" at the bottom; picking one there unarchives it. The open session always shows.
- **Merge into…** moves every solve of the current session into another session of the same event, then deletes the emptied session.

**Changing the event** above the timer switches to your session for that event, or makes one. If the current session has no solves yet, Cadence changes that session's event instead.

**The averages beside the timer** can cover the current session or every session of its event. Use the switch at the top of that panel, labelled with the session name and, for example, "All 3x3". A few details:

- The All view leaves out drill solves.
- ao100 and ao1000 appear once there are that many solves.
- Each device remembers its own choice.

**The solve drawer** opens when you click a solve. It shows the date, penalties, the phase bar, the scramble with a cube net and a comment field. Smart cube solves also get the full reconstruction and a 3D replay.

## Insights

Insights describes the current session, or every session of the same event with the switch at the top right. The top shows your solve counts, best single, averages and standard deviation. Below that:

- **Progress:** every single, with a rolling ao5, ao12, ao50 or ao100 drawn over it.
- **Where your times land:** how many solves fall in each time bucket. The highlighted bar holds your current ao12.
- **Day by day:** the daily mean and best over your last 60 practice days.
- **Phases and PBs:** phase averages when your solves have splits, and a timeline of personal bests.

## Coach

Coach is off until you turn it on in Settings > Coach. It reads every solve of the current event and names what costs you the most time. It measures you against your own solving, not anyone else's.

### What it looks for

Each check runs only once there is enough data to trust.

- **A slow phase.** Needs 60 or more solves with smart cube splits from your current method. Coach compares your last 20 with your best stretch of 20, and flags any phase more than 0.3 s slower. CFOP and Roux splits are never compared, and switching method ends a phase you were working on.
- **Slow solves.** Over your last 50 solves (25 at least), how much the solves more than 20% above your median raise your mean.
- **Warm-up.** Across sittings of 10 solves or more, whether your first 3 solves are slower than the rest. A sitting ends at a break of 10 minutes.
- **Fatigue.** Across sittings of 30 solves or more, whether your last 10 are slower than the middle.

### Working on a finding

The finding that would save the most time per solve comes first, with a short drill.

Press **Work on this** and Coach notes where you started. From then on it shows the before and after, for example `F2L: 10.60 → 9.80 s over 24 solves`, until you press **Done with this**. The finding you work on syncs with your other settings.

### Drills

On a 3x3 event, a slow F2L, OLL or PLL also gets a **Practise this** button, and F2L gets **Last slot only** too. Each opens the timer in drill mode, with scrambles that leave everything before that phase solved:

| Drill | Already solved |
| --- | --- |
| F2L | the cross |
| Last slot | the cross and three pairs |
| OLL | F2L |
| PLL | F2L and OLL |

Scramble with white on top and green in front as usual. The drilled pieces end up on the bottom, so turn the cube over to start. A bar above the scramble shows the drill, how many solves you have done and their mean.

**Picking cases.** For OLL and PLL, **Cases** lets you choose which cases come up. OLL cases are grouped by shape, such as Dot, Fish or Small L, and you can turn a whole group on or off. With no case picked, any case can come up.

**Where drill solves go.** They go to their own session, such as `3x3 drills`. Coach, the Coach card and the "All 3x3" view leave them out, so practice never changes your stats. **End drill** takes you back to the session you were in.

Drill mode belongs to the device it was started on and does not sync. The drill solves themselves do.

### After a break

When you come back after 10 minutes or more, a card sums up the sitting you just finished: how many solves, your mean against your usual, your best, and the top finding. It goes away when you dismiss it or start the next solve.

## Bringing your history over from csTimer

1. In csTimer, open Export and choose Export to file.
2. In Cadence, open Settings. Click Choose file under Import from csTimer, or drop the file anywhere on the Settings page.
3. Check the preview. It lists every session in the file, how many solves each adds, and whether it tops up a session you already have or becomes a new one.
4. Click Import. Cadence opens the biggest imported session.

Re-importing is safe. Solves you already have (same finish time, time and scramble) are skipped, and a session with the same name and event as one of yours is topped up rather than duplicated. So you can keep timing in csTimer for a while and import a fresh export now and then.

A Cadence backup file imports the same way.

## Backups and export

**Export.** Settings > Your data > Export saves either a full Cadence backup (`.json`) or a file in csTimer's format, so your solves can go back to csTimer.

**Automatic backups (desktop app).** Once a day while it runs, the desktop app saves `cadence-backup-YYYY-MM-DD.json` to a `backups` folder inside its data folder. It keeps the newest seven. Settings > Your data > Automatic backups > Open folder shows them, and any of them imports like an exported backup.

**In a browser,** Cadence asks for persistent storage so the browser is less likely to clear your solves. Signing in to sync or installing the app is still the safer way to keep them.

**Delete everything.** Settings > Your data > Delete everything removes all sessions and solves from this device. If you are signed in, it signs this device out first, so the copy in your account stays.

## Sync

Sign in under Settings > Account with your World Cube Association account. You don't need to have competed; any WCA website account works.

Once you're signed in, Cadence syncs:

- a couple of seconds after each change
- when the app comes back to the foreground
- when the device goes online again
- every five minutes

The account row shows when it last synced, and Sync now runs one straight away.

**What syncs:** sessions, solves, penalties, comments, smart cube moves and rotations, and settings such as theme, inspection and method.

**What stays on each device:** settings that describe the device rather than you. That's the input (keyboard, Stackmat, smart cube), the session currently open, and Share diagnostics.

**When devices disagree,** the later change wins. One exception protects your solves: if you delete a session on one device while another device has unsynced solves in it, those solves are kept and the session comes back.

**Signing out** keeps your solves on the device. **Delete synced data** erases the copy kept for syncing and signs out every device; each device keeps the solves it already has.

## Installing and updates

See [Install](../README.md#install) in the README for phones, browsers and the desktop apps.

After an update, the timer offers a short **What's new** list that opens only if you tap it. The same list, the version you run, and links to star or share the project are under Settings > About.

Once you have used Cadence for a while (100 solves over 3 days, then 300 solves), it asks once each whether you would star it and share it. Closing either message means it never asks again.
