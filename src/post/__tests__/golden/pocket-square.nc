; simple.cam v0.0.1 — job "pocket-square"
;@MKR|TOOL|number=1|id=t1|name=2mm flat|type=Flat End|handlediameter=2|sticklength=0|shoulderlength=0|flutelength=0|diameter=2|tipdiameter=2|cornerradius=0|angle=0|halfAngle=0
G90 G21
G0 X9 Y9 Z5 ; level z-1.00 pass 1
G0 Z-0.5
G1 Z-1 F200 ; plunge 1.00mm below surface
G1 X1 Y9 F500
G1 X1 Y1
G1 X9 Y1
G1 X9 Y9
G0 Z5
G0 X8 Y8 Z5 ; level z-1.00 pass 2
G0 Z-0.5
G1 Z-1 F200 ; plunge 1.00mm below surface
G1 X2 Y8 F500
G1 X2 Y2
G1 X8 Y2
G1 X8 Y8
G0 Z5
G0 X7 Y7 Z5 ; level z-1.00 pass 3
G0 Z-0.5
G1 Z-1 F200 ; plunge 1.00mm below surface
G1 X3 Y7 F500
G1 X3 Y3
G1 X7 Y3
G1 X7 Y7
G0 Z5
G0 X6 Y6 Z5 ; level z-1.00 pass 4
G0 Z-0.5
G1 Z-1 F200 ; plunge 1.00mm below surface
G1 X4 Y6 F500
G1 X4 Y4
G1 X6 Y4
G1 X6 Y6
G0 Z5
M05
G28
M02
