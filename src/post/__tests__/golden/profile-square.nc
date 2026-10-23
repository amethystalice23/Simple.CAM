; simple.cam v0.0.1 — job "profile-square"
;@MKR|TOOL|number=1|id=t1|name=2mm flat|type=Flat End|handlediameter=2|sticklength=0|shoulderlength=0|flutelength=0|diameter=2|tipdiameter=2|cornerradius=0|angle=0|halfAngle=0
G90 G21
G0 X10.43 Y-0.9 ; level z-1.00
G0 Z5
G0 Z-0.5
G1 Z-1 F200 ; plunge 1.00mm below surface
G1 X10.78 Y-0.63 F500
G1 X10.97 Y-0.22
G1 X11 Y0
G1 X11 Y10
G1 X10.9 Y10.43
G1 X10.63 Y10.78
G1 X10.22 Y10.97
G1 X10 Y11
G1 X0 Y11
G1 X-0.43 Y10.9
G1 X-0.78 Y10.63
G1 X-0.97 Y10.22
G1 X-1 Y10
G1 X-1 Y0
G1 X-0.9 Y-0.43
G1 X-0.63 Y-0.78
G1 X-0.22 Y-0.97
G1 X0 Y-1
G1 X10 Y-1
G1 X10.43 Y-0.9
G0 Z5
G0 X10.43 Y-0.9 ; level z-2.00
G0 Z5
G0 Z-1.5
G1 Z-2 F200 ; plunge 2.00mm below surface
G1 X10.78 Y-0.63 F500
G1 X10.97 Y-0.22
G1 X11 Y0
G1 X11 Y10
G1 X10.9 Y10.43
G1 X10.63 Y10.78
G1 X10.22 Y10.97
G1 X10 Y11
G1 X0 Y11
G1 X-0.43 Y10.9
G1 X-0.78 Y10.63
G1 X-0.97 Y10.22
G1 X-1 Y10
G1 X-1 Y0
G1 X-0.9 Y-0.43
G1 X-0.63 Y-0.78
G1 X-0.22 Y-0.97
G1 X0 Y-1
G1 X10 Y-1
G1 X10.43 Y-0.9
G0 Z5
M05
G28
M02
