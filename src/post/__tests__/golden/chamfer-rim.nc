; simple.cam v0.0.1 — job "chamfer-rim"
;@MKR|TOOL|number=1|id=t3|name=Chamfering Bit 1/8|type=V-Bit|handlediameter=3.17|sticklength=0|shoulderlength=0|flutelength=0|diameter=3.17|tipdiameter=0.1|cornerradius=0|angle=90|halfAngle=45
G90 G21
G17
G0 X6.95 Y5 ; chamfer 0.50mm deep, 0.50mm wide, side inside
G0 Z5
G0 Z0
G1 Z-0.5 F200 ; plunge to chamfer tip z-0.50
G3 X6.95 Y5 I-1.95 J0 F600 ; circular chamfer r1.95
G0 Z5
M05
G28
M02
