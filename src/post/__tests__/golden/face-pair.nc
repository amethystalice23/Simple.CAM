; simple.cam v0.0.1 — job "face-pair"
;@MKR|TOOL|number=1|id=t1|name=2mm flat|type=Flat End|handlediameter=2|sticklength=0|shoulderlength=0|flutelength=0|diameter=2|tipdiameter=2|cornerradius=0|angle=0|halfAngle=0
; ---- prep assumptions (run in controller before this job) ----
; M465.1            ; 4th-axis stock leveling/twist via probe
; G10 L20 P0 A0      ; establish angular zero
; verify 4th-axis Z datum (stock-center, Z1-probed) matches the job stock calibration
G90 G21
G92.4 A0 R0
G0 Y0
G0 X0 ; pass 1/6 depth 1.000mm radial
G0 Z30
G93
G1 Z24 A90 F26.4 ; helical entry 1.000mm radial
G1 X100 A22590 F0.11 ; rough to r=24.000
G1 Z23 A22680 F26.4 ; spiral step down 1.000mm radial
G1 X0 A180 F0.11 ; rough to r=23.000
G1 Z22 A270 F26.4 ; spiral step down 1.000mm radial
G1 X100 A22770 F0.11 ; rough to r=22.000
G1 Z21 A22860 F26.4 ; spiral step down 1.000mm radial
G1 X0 A360 F0.11 ; rough to r=21.000
G1 Z20.2 A450 F26.4 ; spiral step down 0.800mm radial
G1 X100 A22950 F0.11 ; rough to r=20.200
G1 Z20 A23040 F26.4 ; spiral step down 0.200mm radial
G1 X0 A540 F0.11
G0 Z30
G0 X0 ; pass 1/6 depth 1.000mm radial
G0 Z30
G1 Z24 A630 F26.4 ; helical entry 1.000mm radial
G1 X100 A23130 F0.11 ; rough to r=24.000
G1 Z23 A23220 F26.4 ; spiral step down 1.000mm radial
G1 X0 A720 F0.11 ; rough to r=23.000
G1 Z22 A810 F26.4 ; spiral step down 1.000mm radial
G1 X100 A23310 F0.11 ; rough to r=22.000
G1 Z21 A23400 F26.4 ; spiral step down 1.000mm radial
G1 X0 A900 F0.11 ; rough to r=21.000
G1 Z20.2 A990 F26.4 ; spiral step down 0.800mm radial
G1 X100 A23490 F0.11 ; rough to r=20.200
G1 Z20 A23580 F26.4 ; spiral step down 0.200mm radial
G1 X0 A1080 F0.11
G0 Z30
G94
; shrink work-coordinate A back to ±360 (was 1080.00)
G92.4 A0 S0
M05
G28
M02
