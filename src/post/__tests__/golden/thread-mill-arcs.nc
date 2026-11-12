; simple.cam v0.0.1 — job "thread-mill-arcs"
;@MKR|TOOL|number=1|id=tm1|name=M6 Threadmill|type=Thread|handlediameter=6|sticklength=0|shoulderlength=18|flutelength=18|diameter=4.75|tipdiameter=4.75|cornerradius=0|angle=0|halfAngle=0
G90 G21
G17
G0 X11.76 Y0 ; approach
G0 Z3
G1 Z-10 F100 ; plunge to the thread bottom
G1 X8.76 Y0 ; radial entry
G2 X8.76 Y0 Z-9 I-8.76 J0
G2 X8.76 Y0 Z-8 I-8.76 J0
G2 X8.76 Y0 Z-7 I-8.76 J0
G2 X8.76 Y0 Z-6 I-8.76 J0
G2 X8.76 Y0 Z-5 I-8.76 J0
G2 X8.76 Y0 Z-4 I-8.76 J0
G2 X8.76 Y0 Z-3 I-8.76 J0
G2 X8.76 Y0 Z-2 I-8.76 J0
G2 X8.76 Y0 Z-1 I-8.76 J0
G2 X8.76 Y0 Z0 I-8.76 J0
G0 Z3
G0 X11.76 Y0 ; spring pass
G0 Z3
G1 Z-10 ; plunge to the thread bottom
G1 X8.76 Y0 ; radial entry
G2 X8.76 Y0 Z-9 I-8.76 J0
G2 X8.76 Y0 Z-8 I-8.76 J0
G2 X8.76 Y0 Z-7 I-8.76 J0
G2 X8.76 Y0 Z-6 I-8.76 J0
G2 X8.76 Y0 Z-5 I-8.76 J0
G2 X8.76 Y0 Z-4 I-8.76 J0
G2 X8.76 Y0 Z-3 I-8.76 J0
G2 X8.76 Y0 Z-2 I-8.76 J0
G2 X8.76 Y0 Z-1 I-8.76 J0
G2 X8.76 Y0 Z0 I-8.76 J0
G0 Z3
M05
G28
M02
