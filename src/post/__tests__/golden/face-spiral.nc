; simple.cam v0.0.1 — job "face-spiral"
; TOOL: T1 name="2mm flat" type=flat diameter=2.000 spindle=18000rpm
; ---- prep assumptions (run in controller before this job) ----
; M465.1            ; 4th-axis stock leveling/twist via probe
; G10 L20 P0 A0      ; establish angular zero
; verify 4th-axis Z datum (stock-center, Z1-probed) matches the job stock calibration
G21 G90 G94
G92.4 A0 S0
G0 X0.000 Z30.000 A0.000 ; pass 1/5 depth 1.000mm radial
G93
G1 Z24.000 A90.000 F26.4000 ; helical entry 1.000mm radial
G1 X100.000 A22590.000 F0.1056 ; rough to r=24.000
G1 Z23.000 A22680.000 F26.4000 ; spiral step down 1.000mm radial
G1 X0.000 A45180.000 F0.1056 ; rough to r=23.000
G1 Z22.000 A45270.000 F26.4000 ; spiral step down 1.000mm radial
G1 X100.000 A67770.000 F0.1056 ; rough to r=22.000
G1 Z21.000 A67860.000 F26.4000 ; spiral step down 1.000mm radial
G1 X0.000 A90360.000 F0.1056 ; rough to r=21.000
G1 Z20.000 A90450.000 F26.4000 ; spiral step down 1.000mm radial
G1 X100.000 A112950.000 F0.1056
G0 Z30.000
G94
G92.4 A0 S0
M30
