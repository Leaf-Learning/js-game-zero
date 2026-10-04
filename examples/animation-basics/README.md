# Animation Basics

This zero-boilerplate example starts an `animate()` call at load time and draws
the animated object moving across the canvas.

`animate()` registers with the game's clock, so no `update()` hook is needed.
The runtime advances the animation before drawing. `const orb` keeps the
same object while the animation changes its `x` property. Reloading starts
the animation again.

Try changing `duration` or using the `linear` tween to compare motion.

Run it from `/examples/animation-basics`.
