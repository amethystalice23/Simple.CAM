; simple.cam v0.0.1 — job "engrave-laser"
G90 G21
;@MKR|TOOLPATH_START|toolpath_number=1

M321

G0 Z1.5 ; laser focus height
M3
G0 X0 Y0
G1 X10 Y0 S0.2 F100
G1 S0
G0 X0 Y5
G1 X10 Y5 S0.2
G1 S0
M05
M322
M05
G28
M02
