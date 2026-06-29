# Tutorials

## Tutorial 1: Draw A Shape

```js
WIDTH = 640;
HEIGHT = 360;

function draw() {
  screen.fill("navy");
  screen.draw.filled_circle([320, 180], 45, "gold");
}
```

## Tutorial 2: Move An Actor

```js
let player = new Actor("alien", { center: [320, 180] });

function draw() {
  screen.clear();
  player.draw();
}

function update() {
  if (keyboard.left) player.x -= 3;
  if (keyboard.right) player.x += 3;
}
```

## Tutorial 3: Play A Tone

```js
function on_mouse_down() {
  tone.play("A4", 0.2);
}
```

## Verification Criteria

- Tutorial snippets are mirrored by runnable examples.
- E2E tests load tutorial-equivalent code through the sandbox preview.
- README commands include the sandbox command needed to run these tutorials.
