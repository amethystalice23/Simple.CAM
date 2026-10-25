; simple.cam v0.0.1 — job "face-test"
;@MKR|TOOL|number=1|id=t1|name=6mm flat|type=Flat End|handlediameter=6|sticklength=0|shoulderlength=0|flutelength=0|diameter=6|tipdiameter=6|cornerradius=0|angle=0|halfAngle=0
; ---- prep assumptions (run in controller before this job) ----
; M465.1            ; 4th-axis stock leveling/twist via probe
; G10 L20 P0 A0      ; establish angular zero
; verify 4th-axis Z datum (stock-center, Z1-probed) matches the job stock calibration
G90 G21
G92.4 A0 R0
G0 Y0
G0 X0 ; pass 1/5 depth 1.000mm radial
G0 Z30
G93
G1 Z24 A90 F26.4 ; helical entry 1.000mm radial
G1 X100 A7590 F0.32 ; rough to r=24.000
G1 Z23 A7680 F26.4 ; spiral step down 1.000mm radial
G1 X0 A180 F0.32 ; rough to r=23.000
G1 Z22 A270 F26.4 ; spiral step down 1.000mm radial
G1 X100 A7770 F0.32 ; rough to r=22.000
G1 Z21 A7860 F26.4 ; spiral step down 1.000mm radial
G1 X0 A360 F0.32 ; rough to r=21.000
G1 Z20 A450 F26.4 ; spiral step down 1.000mm radial
G1 X100 A7950 F0.32
G0 Z30
G94
; shrink work-coordinate A back to ±360
G92.4 A0 S0
M05
G28
M02
