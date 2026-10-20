; simple.cam v0.0.1 — job "drill-holes"
;@MKR|TOOL|number=1|name=3mm drill|diameter=3.000|type=drill
G21 G90 G94
G92.4 A0 S0
G0 X5.000 Y5.000 Z5.000 ; drill (5.00, 5.00) depth 5.00mm
G0 Z0.500
G1 Z-2.000 F300.0000
G0 Z0.500
G0 Z-1.500
G1 Z-4.000
G0 Z0.500
G0 Z-3.500
G1 Z-5.000
G0 Z0.500
G0 Z5.000
G0 X25.000 Y5.000 Z5.000 ; drill (25.00, 5.00) depth 3.00mm
G0 Z0.500
G1 Z-2.000
G0 Z0.500
G0 Z-1.500
G1 Z-3.000
G0 Z0.500
G0 Z5.000
M30
