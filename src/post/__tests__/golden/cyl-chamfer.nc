; simple.cam v0.0.1 — job "cyl-chamfer"
;@MKR|TOOL|number=1|id=t3|name=Chamfering Bit 1/8|type=V-Bit|handlediameter=3.17|sticklength=0|shoulderlength=0|flutelength=0|diameter=3.17|tipdiameter=0.1|cornerradius=0|angle=90|halfAngle=45
; ---- prep assumptions (run in controller before this job) ----
; M465.1            ; 4th-axis stock leveling/twist via probe
; G10 L20 P0 A0      ; establish angular zero
; verify 4th-axis Z datum (stock-center, Z1-probed) matches the job stock calibration
G90 G21
G92.4 A0 R0
G0 Y0
G0 X20 ; chamfer edge X20.00, Ø15.00 — cut up-and-out
G0 Z13.18
G1 Z7.78 F200 ; level 1/2
G1 A360 F2376
G1 Z7.5 F200
G1 A720 F2376
G0 Z13.18
; shrink work-coordinate A back to ±360
G92.4 A0 S0
M05
G28
M02
