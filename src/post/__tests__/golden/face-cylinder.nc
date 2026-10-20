; simple.cam v0.0.1 — job "face-test"
;@MKR|TOOL|number=1|name=6mm flat|diameter=6.000|type=flat
; ---- prep assumptions (run in controller before this job) ----
; M465.1            ; 4th-axis stock leveling/twist via probe
; G10 L20 P0 A0      ; establish angular zero
; verify 4th-axis Z datum (stock-center, Z1-probed) matches the job stock calibration
G21 G90 G94
G92.4 A0 S0
G0 X0.000 Z30.000 A0.000 ; pass 1/5 depth 1.000mm radial
G93
G1 Z24.000 A90.000 F26.4000 ; helical entry 1.000mm radial
G1 X100.000 A7590.000 F0.3168 ; rough to r=24.000
G1 Z23.000 A7680.000 F26.4000 ; spiral step down 1.000mm radial
G1 X0.000 A15180.000 F0.3168 ; rough to r=23.000
G1 Z22.000 A15270.000 F26.4000 ; spiral step down 1.000mm radial
G1 X100.000 A22770.000 F0.3168 ; rough to r=22.000
G1 Z21.000 A22860.000 F26.4000 ; spiral step down 1.000mm radial
G1 X0.000 A30360.000 F0.3168 ; rough to r=21.000
G1 Z20.000 A30450.000 F26.4000 ; spiral step down 1.000mm radial
G1 X100.000 A37950.000 F0.3168
G0 Z30.000
G94
G92.4 A0 S0
M30
