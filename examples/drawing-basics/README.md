# Drawing Basics

This zero-boilerplate example draws a gradient background, a rectangle, a line,
a circle, and a polygon using the injected `screen` global.

`update(dt)` advances `pulse` using elapsed seconds; `draw()` reads it to
choose the circle's size. Drawing can be called without advancing time.
The coordinates are pixels from the top-left corner.

Try changing a shape's coordinates or color, then use `pulse` to animate
a second shape. This example intentionally needs no helper functions.

Run it from `/examples/drawing-basics`.
