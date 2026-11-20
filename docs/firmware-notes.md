# Firmware-command assumptions

Verified machine facts live in `docs/PLAN.md` and `docs/makera-dialect.md`.
This file records the assumptions each consumer bakes in when it READS or
EMITS a firmware command, so a dialect change has one place to check.

## nc parser (`src/post/ncParser.ts`, PLAN.md item 13)

Assumptions the parser makes about the Carvera dialect, each sourced from
the mill-tested corpus (`examples/`, 22 files) or the community firmware
source notes in `docs/makera-dialect.md`:

| Command | Assumption | Source |
|---|---|---|
| `G0/G1/G2/G3` | The only motion codes. A motion line with no G word on it or any earlier line is REFUSED (the cut/rapid choice would be a guess). | corpus: every motion line carries its G; makera-dialect.md |
| `G2/G3` | I/J-offset form only. R is never parsed as a radius by the firmware — an R-form line is refused at parse, not emitted as a dead arc. Arcs require I or J (a missing-both arc computes radius 0 and silently no-ops, Robot.cpp:2146). A-coordinated arcs refused (no IR form). | makera-dialect.md "G2/G3 arcs" |
| `G92.4 A<n> R<x>` | Physical rotate to the mod-360 spoke, then work-coordinate counter = A. R's value is ignored (presence selects the branch). No Move emitted; tracked A := A. | makera-dialect.md "G92.4 — three real variants"; Robot.cpp:776-833 |
| `G92.4 A<n>` | Pure counter reset, no motion. Same tracked-A effect as the R form. | Robot.cpp:776-833 |
| `G92.4 A0 S0` | Shrink: whole turns subtracted from the CURRENT counter while \|A\| > 360 (strictly greater — an exact ±360 pile lands AT ±360, not 0). Tracked A := shrinkA(A). | Robot.cpp:796; carvera.ts `shrinkA` |
| `G93` | F mandatory on every G1 line (the firmware halts otherwise). A G93 line with axis words and no F is refused at parse. G0 is exempt (the firmware forces G94 for the move). | makera-dialect.md "G93 inverse-time", Robot.cpp:903-904 |
| `G20` | Refused — the firmware hard-halts on imperial units. | makera-dialect.md |
| `G91` | Refused — not in the dialect; incremental would silently re-mean every coordinate. | dialect absence (corpus has zero) |
| `G10 L20 P0 A<n>` | The prep header's angular-zero establishment: re-zeroes the work coordinate system's A at the current spoke. No motion; tracked A := A. Other L groups refused. | carvera.ts prep header emission |
| `G4`, `G17/18/19`, `G21`, `G28`, `G90`, `G94` | Consumed, no motion. G28 with axis words refused (park-to-coordinate is unhandled). Dwell TIME (G4 P/S) is not modeled — the Move IR has no dwell form. | makera-dialect.md; corpus |
| `S<n> M3` | Spindle start: n is RPM; the value is stamped onto the first FOLLOWING move (the post emits it just before the op's first motion). In laser mode (after M321) the S word on G1 lines is beam power 0-1, stamped as Move.power; G0 never fires the beam. | makera-dialect.md "Laser job"; engrave.ts |
| `M321/M322` | Laser module on/off. M321 clears tracked spindle state (laser ops carry no RPM). | makera-dialect.md |
| `M3` (bare) | The laser arm after the focus-height descent. No new state. | engrave-laser.nc golden; makera-dialect.md |
| `M7/M9` | Air assist no-ops (unimplemented in firmware, machined fine). Consumed. | TopClamp.nc; makera-dialect.md |
| `M05/M5` | Spindle stop, consumed. | corpus (both spellings) |
| `M02/M30/M0/M1` | Program end / optional stops, consumed. | makera-dialect.md (M2 alias note) |
| `M465.x / M469.x / M493.x / M495 / M887 / M959` | Machine setup (probe/datum/calibration), consumed with no motion. An EXPLICIT base-code allowlist — anything else (e.g. M999) throws rather than vanishing. | makera-dialect.md "M-codes relevant to jobs" |
| `T<n> M6` | Tool number tracking for op stamps. Consumed. | corpus |
| `;@MKR|TOOLPATH_START\|toolpath_number=<n>` | Op boundary: the next emitted move is the op's first and carries `op: { number, name, toolNumber }`. Op NAME comes from the file header's `;@MKR|TOOLPATH` line when present, else ''. | PLAN.md item 13; stampOp contract |
| `;@MKR|TOOL|…` and other header tags | Parsed-but-ignored metadata (the controller reads only TOOL). | makera-dialect.md "Community Controller parsing" |

Modality assumptions: coordinate words are absolute with modal carry (a
missing word means unchanged); parsed Move.words stay SPARSE (exactly the
line's words) — the sim/poses.ts and moveDurations modal-carry themselves.
F is modal; an explicit `G93`/`G94` line resets the tracked modal F (the
post re-emits F after every mode change, so a carried F across a mode
boundary would be a wrong-unit value).

Known lossy surfaces (documented, not bugs): move COMMENTS are dropped;
a modal repeat of an unchanged S power word is not re-stamped on later
moves (the post only emits S on change, so the parse cannot recover it);
spindle stamps on rapids that precede any M3 in a same-speed op are
recovered from modal state — if the file's first op never states a speed,
no stamp appears.

Open item: the Z1's epsilon axis (5th actuator) has no known G-code word
form; a B-word line would be refused loudly today. Revisit if one appears
in the wild.
