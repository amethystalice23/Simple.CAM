; simple.cam v0.0.1 — job "face-cylinder"
;@MKR|TOOL|number=1|id=t1|name=2mm flat|type=Flat End|handlediameter=2|sticklength=0|shoulderlength=0|flutelength=0|diameter=2|tipdiameter=2|cornerradius=0|angle=0|halfAngle=0
; ---- prep assumptions (run in controller before this job) ----
; M465.1            ; 4th-axis stock leveling/twist via probe
; G10 L20 P0 A0      ; establish angular zero
; verify 4th-axis Z datum (stock-center, Z1-probed) matches the job stock calibration
G90 G21
G92.4 A0 R0
G0 Y0
G0 X1 ; pass 1/4 depth 2.000mm radial — 8 rings
G0 Z30
G1 Z23 F300 ; plunge 2.000mm radial
G1 A360 F2376
G1 X2.6 F600
G1 A720 F2376
G1 X4.2 F600
G1 A1080 F2376
G1 X5.8 F600
G1 A1440 F2376
G1 X7.4 F600
G1 A1800 F2376
G1 X9 F600
G1 A2160 F2376
G1 X10.6 F600
G1 A2520 F2376
G1 X11 F600
G1 A2880 F2376
G1 Z21 F300 ; plunge 2.000mm radial
G1 A3240 F2376
G1 X10.6 F600
G1 A3600 F2376
G1 X9 F600
G1 A3960 F2376
G1 X7.4 F600
G1 A4320 F2376
G1 X5.8 F600
G1 A4680 F2376
G1 X4.2 F600
G1 A5040 F2376
G1 X2.6 F600
G1 A5400 F2376
G1 X1 F600
G1 A5760 F2376
G1 Z20.2 F300 ; plunge 0.800mm radial
G1 A6120 F2376
G1 X2.6 F600
G1 A6480 F2376
G1 X4.2 F600
G1 A6840 F2376
G1 X5.8 F600
G1 A7200 F2376
G1 X7.4 F600
G1 A7560 F2376
G1 X9 F600
G1 A7920 F2376
G1 X10.6 F600
G1 A8280 F2376
G1 X11 F600
G1 A8640 F2376
G1 Z20 F300 ; plunge 0.200mm radial
G1 A9000 F2376
G1 X10.6 F600
G1 A9360 F2376
G1 X9 F600
G1 A9720 F2376
G1 X7.4 F600
G1 A10080 F2376
G1 X5.8 F600
G1 A10440 F2376
G1 X4.2 F600
G1 A10800 F2376
G1 X2.6 F600
G1 A11160 F2376
G1 X1 F600
G1 A11520 F2376
G0 Z30
; shrink work-coordinate A back to ±360 (was 11520.00)
G92.4 A0 S0
M05
G28
M02
