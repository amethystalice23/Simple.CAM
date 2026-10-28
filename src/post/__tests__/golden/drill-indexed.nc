; simple.cam v0.0.1 — job "drill-indexed"
;@MKR|TOOL|number=1|id=t2|name=3mm drill|type=Drill|handlediameter=3|sticklength=0|shoulderlength=0|flutelength=0|diameter=3|tipdiameter=3|cornerradius=0|angle=0|halfAngle=0
; ---- prep assumptions (run in controller before this job) ----
; M465.1            ; 4th-axis stock leveling/twist via probe
; G10 L20 P0 A0      ; establish angular zero
; verify 4th-axis Z datum (stock-center, Z1-probed) matches the job stock calibration
G90 G21
G92.4 A0 R0
G0 Y0
G0 A90 ; index stock to A90°
G0 X5 Y5 ; drill (5.00, 5.00) depth 5.00mm
G0 Z5
G0 Z0.5
G1 Z-1.67 F300
G0 Z0.5
G0 Z-1.17
G1 Z-3.33
G0 Z0.5
G0 Z-2.83
G1 Z-5
G0 Z0.5
G0 Z5
G0 X25 Y5 ; drill (25.00, 5.00) depth 3.00mm
G0 Z5
G0 Z0.5
G1 Z-1.5
G0 Z0.5
G0 Z-1
G1 Z-3
G0 Z0.5
G0 Z5
M05
G28
M02
