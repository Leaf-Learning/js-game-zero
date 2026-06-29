# API Reference

## Summary

This document describes the learner-facing API exposed by `@js-game-zero/core`
and by the zero-boilerplate browser runtime.

## Globals And Imports

Zero-boilerplate games can use globals such as `Actor`, `screen`, `keyboard`,
`clock`, `sounds`, `music`, `tone`, `storage`, `WIDTH`, `HEIGHT`, and lifecycle
functions. Import-mode games can import the same symbols:

```js
import { run, Actor, keyboard, screen } from "@js-game-zero/core";
```

## Core Types

- `Rect` and `ZRect` implement pygame-style rectangle positioning, collision,
  moving, inflating, clipping, clamping, and union operations.
- `Screen` wraps a canvas with `clear`, `fill`, `blit`, `bounds`, and `draw`.
- `Actor` wraps an image and a rectangle with anchor positioning, rotation,
  opacity, collision methods, `angle_to`, `distance_to`, and `draw`.
- `Clock` supports `schedule`, `schedule_unique`, `schedule_interval`,
  `unschedule`, `each_tick`, and `tick`.
- `animate` creates an `Animation` using tween names compatible with PGZero.

## Runtime Signatures

```ts
type HookModule = {
  WIDTH?: number;
  HEIGHT?: number;
  TITLE?: string;
  ICON?: string | null;
  draw?: () => void;
  update?: (() => void) | ((dt: number) => void);
  on_mouse_down?: (pos?: [number, number], button?: number) => void;
  on_mouse_up?: (pos?: [number, number], button?: number) => void;
  on_mouse_move?: (
    pos?: [number, number],
    rel?: [number, number],
    buttons?: Set<number>,
  ) => void;
  on_key_down?: (key?: string, mod?: number, unicode?: string) => void;
  on_key_up?: (key?: string, mod?: number) => void;
  on_music_end?: () => void;
};

type RunOptions = HookModule & {
  root?: string;
  canvas?: HTMLCanvasElement;
  assetBaseUrl?: string;
  storage?: StorageAdapter;
  diagnostics?: (diagnostic: Diagnostic) => void;
};

function run(
  moduleOrSource: HookModule | string,
  options?: RunOptions,
): GameHandle;
```

`GameHandle` exposes `pause`, `resume`, `stop`, `reload`, `canvas`, `screen`, and
`diagnostics`. `stop` removes event listeners and stops scheduled animation
callbacks. `reload` is used by the sandbox preview and must preserve project
assets while resetting framework state.

## Geometry Contract

`Rect` constructor overloads accept `(left, top, width, height)`, `([x, y],
[w, h])`, another `Rect`, or a tuple `[left, top, width, height]`. Property
setters move the rectangle without changing size unless the property is
`width`, `height`, `w`, `h`, or `size`. Collision uses half-open bounds: left
and top are inclusive, right and bottom are exclusive.

## Actor Contract

`Actor(image, pos?, options?)` accepts `pos`, `topleft`, `topright`,
`bottomleft`, `bottomright`, `midtop`, `midleft`, `midright`, `midbottom`, and
`center`. Exactly one positional keyword may be used. `anchor` defaults to
`["center", "center"]`, while no position defaults to `topleft=[0, 0]`. Rotation
is counterclockwise in degrees around the anchor and changes the bounding rect.
Opacity is clamped to `[0, 1]`.

## Screen And Text Contract

Screen drawing methods throw `TypeError` for invalid coordinate or rect shapes.
`fill(color, gcolor)` draws a top-to-bottom gradient. `draw.text` supports
`fontname`, `fontsize`, `color`, `background`, positioning keywords, `width`,
`widthem`, `lineheight`, `align`, `owidth`, `ocolor`, `shadow`, `scolor`,
`gcolor`, `alpha`, `anchor`, and `angle`. `draw.textbox` chooses the largest
font size that fits inside the provided rect.

## Loader And Audio Contract

Loaders expose `load(name)`, property access, `unload(name)`, and `unload_all`.
Missing directories and missing assets throw clear errors with the asset type
and requested name. `sounds.<name>.play(loops?)`, `stop`, and `get_length`
mirror the PGZero shape. `music` has a single active track and supports `play`,
`play_once`, `queue`, `stop`, `pause`, `unpause`, `is_playing`, `fadeout`,
`set_volume`, and `get_volume`.

## Storage Contract

`storage` behaves like a map/dictionary with `get`, `set`, bracket-like proxy
access in learner mode, `setdefault`, `clear`, `save`, `load`, and `path`.
Browser storage keys are scoped by project id; sandbox file storage is scoped by
project directory.

## Verification Criteria

- API examples in README and tutorials must compile or execute in tests.
- Each exported symbol must be covered by at least one unit smoke test.
- Browser e2e tests must verify the zero-boilerplate and import-mode paths.
