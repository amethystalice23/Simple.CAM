; simple.cam v0.0.1 — job "raster-engrave-wrapped-serpentine"
; ---- prep assumptions (run in controller before this job) ----
; M465.1            ; 4th-axis stock leveling/twist via probe
; G10 L20 P0 A0      ; establish angular zero
; verify 4th-axis Z datum (stock-center, Z1-probed) matches the job stock calibration
G90 G21
G92.4 A0 R0
G0 Y0
;@MKR|TOOLPATH_START|toolpath_number=1

M321

G0 A110.5
G0 X10
G0 Z1.5 ; laser focus height
M3
G1 X16 S0.3 F1000
G1 X22 S0
G1 A111.5 F2376
G1 X16 F1000
G1 X10 S0.3
G1 A112.5 S0 F2376
G1 X16 S0.3 F1000
G1 X22 S0
G1 A113.5 F2376
G1 X16 F1000
G1 X10 S0.3
G1 A114.5 S0 F2376
G1 X16 S0.3 F1000
G1 X19 S0
G1 X21 S0.3
G1 X22 S0
G1 A115.5 F2376
G1 X16 F1000
G1 X10 S0.3
G1 A116.5 S0 F2376
G1 X16 S0.3 F1000
G1 X22 S0
G1 A117.5 F2376
G1 X16 F1000
G1 X10 S0.3
G1 S0
M05
M322
M05
G28
M02
