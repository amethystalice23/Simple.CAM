; simple.cam v0.0.1 — job "drill-holes"
;@MKR|TOOL|number=1|id=t2|name=3mm drill|type=Drill|handlediameter=3|sticklength=0|shoulderlength=0|flutelength=0|diameter=3|tipdiameter=3|cornerradius=0|angle=0|halfAngle=0
G90 G21
G0 X5 Y5 ; drill (5.00, 5.00) depth 5.00mm
G0 Z5
G0 Z0.5
G1 Z-2 F300
G0 Z0.5
G0 Z-1.5
G1 Z-4
G0 Z0.5
G0 Z-3.5
G1 Z-5
G0 Z0.5
G0 Z5
G0 X25 Y5 ; drill (25.00, 5.00) depth 3.00mm
G0 Z5
G0 Z0.5
G1 Z-2
G0 Z0.5
G0 Z-1.5
G1 Z-3
G0 Z0.5
G0 Z5
M05
G28
M02
