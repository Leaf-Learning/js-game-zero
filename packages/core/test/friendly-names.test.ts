import { describe, expect, test } from "bun:test";
import {
  Actor,
  Animation,
  Clock,
  ImageSurface,
  Rect,
  Screen,
  Storage,
  keys,
  type SurfaceLike,
} from "@js-game-zero/core";
import {
  createImageLoader,
  createMusicPlayer,
  createSoundLoader,
  type CanvasLike,
  type DrawableImage,
} from "@js-game-zero/core/host";
import { friendlyService, otherSpellings } from "../src/friendly-names";

/** Other spellings are not in the typed API. */
type Loose = Record<string, any>;

function surface(width: number, height: number): SurfaceLike {
  return new ImageSurface(
    { width, height } as unknown as DrawableImage,
    width,
    height,
  );
}

function loader() {
  const images = createImageLoader({
    projectId: "friendly",
    loadAsset: async () => surface(20, 10),
  });
  images.define("hero.svg", surface(20, 10));
  return images;
}

describe("other spellings of library names", () => {
  test("cover snake_case and run-together spellings of every word split", () => {
    expect(otherSpellings("angleTo")).toEqual(["angleto", "angle_to"]);
    expect(otherSpellings("collideListAll")).toEqual([
      "collidelistall",
      "collidelist_all",
      "collide_listall",
      "collide_list_all",
    ]);
    expect(otherSpellings("unionAllIp")).toContain("unionall_ip");
    expect(otherSpellings("centerX")).toEqual(["centerx", "center_x"]);
    expect(otherSpellings("draw")).toEqual([]);
    expect(otherSpellings("WIDTH")).toEqual([]);
  });

  test("Actor names its camelCase member when another spelling is read or written", () => {
    const actor = new Actor("hero.svg", { topLeft: [0, 0], loader: loader() });
    const loose = actor as unknown as Loose;
    expect(() => loose.angle_to([10, 5])).toThrow(
      "actor.angle_to doesn't exist. Did you mean actor.angleTo?",
    );
    expect(() => loose.colliderect([0, 0, 5, 5])).toThrow(
      "actor.colliderect doesn't exist. Did you mean actor.collideRect?",
    );
    expect(() => {
      loose.midbottom = [30, 40];
    }).toThrow("actor.midbottom doesn't exist. Did you mean actor.midBottom?");
    expect(() => loose.clamp_ip).toThrow("Did you mean actor.clampIp?");
    expect(actor.topLeft).toEqual([0, 0]);
    // Learner data on an actor is untouched, and guards are never data.
    loose.speed_x = 3;
    expect(loose.speed_x).toBe(3);
    expect(Object.keys(actor)).not.toContain("topleft");
    expect(Object.keys(actor)).toContain("speed_x");
  });

  test("Rect, Clock, Storage, images and music name their camelCase members", () => {
    const rect = new Rect(0, 0, 10, 10) as unknown as Loose;
    expect(() => rect.collidepoint([5, 5])).toThrow(
      "rect.collidepoint doesn't exist. Did you mean rect.collidePoint?",
    );
    expect(() => rect.centerx).toThrow("Did you mean rect.centerX?");
    expect(() => rect.unionall_ip([])).toThrow("Did you mean rect.unionAllIp?");

    const clock = new Clock() as unknown as Loose;
    expect(() => clock.each_tick(() => {})).toThrow(
      "clock.each_tick doesn't exist. Did you mean clock.eachTick?",
    );

    const storage = new Storage({
      adapter: { path: "memory", load: async () => null, save: () => {} },
    }) as unknown as Loose;
    expect(() => storage.setdefault("lives", 3)).toThrow(
      "storage.setdefault doesn't exist. Did you mean storage.setDefault?",
    );
    storage.high_score = 10;
    expect(storage.get("high_score")).toBe(10);

    expect(() => (surface(4, 3) as unknown as Loose).get_size()).toThrow(
      "image.get_size doesn't exist. Did you mean image.getSize?",
    );

    const music = createMusicPlayer() as unknown as Loose;
    expect(() => music.set_volume(0.25)).toThrow(
      "music.set_volume doesn't exist. Did you mean music.setVolume?",
    );
    expect(() => music.fadeout(1)).toThrow("Did you mean music.fadeOut?");
  });

  test("loaders name their methods instead of loading an asset by that name", () => {
    const images = loader() as unknown as Loose;
    expect(() => images.cache_keys()).toThrow(
      "images.cache_keys doesn't exist. Did you mean images.cacheKeys?",
    );
    expect(images.hero.getWidth()).toBe(20);

    const sounds = createSoundLoader({
      projectId: "friendly",
      loadAsset: async () => {
        throw new Error("no sound");
      },
    }) as unknown as Loose;
    expect(() => sounds.tap.set_volume(0.5)).toThrow(
      "sound.set_volume doesn't exist. Did you mean sound.setVolume?",
    );
  });

  test("screen.draw and animations name their camelCase members", () => {
    const canvas: CanvasLike = { width: 10, height: 10 };
    const screen = new Screen(canvas, {} as CanvasRenderingContext2D);
    expect(() => (screen.draw as unknown as Loose).filled_circle).toThrow(
      "screen.draw.filled_circle doesn't exist. Did you mean screen.draw.filledCircle?",
    );

    const clock = new Clock();
    const animation = new Animation(
      { x: 0 },
      { x: 1 },
      clock,
    ) as unknown as Loose;
    expect(() => {
      animation.on_finished = () => {};
    }).toThrow(
      "animation.on_finished doesn't exist. Did you mean animation.onFinished?",
    );
    expect(
      () => new Animation({ x: 0 }, { on_finished: () => {} } as never, clock),
    ).toThrow("Did you mean onFinished?");
    clock.clear();
  });
});

describe("friendly services", () => {
  function screen() {
    const context = {
      fillStyle: "",
      operations: [] as string[],
      save() {},
      restore() {},
      beginPath() {},
      arc() {
        this.operations.push("arc");
      },
      fill() {
        this.operations.push("fill");
      },
    };
    const canvas: CanvasLike = { width: 100, height: 80 };
    const raw = new Screen(
      canvas,
      context as unknown as CanvasRenderingContext2D,
    );
    const friendly = friendlyService(raw, "screen", {
      hidden: ["drawRect"],
      nested: ["draw"],
      hints: { drawrect: "screen.draw.rect", circle: "screen.draw.circle" },
    });
    return { friendly: friendly as unknown as Loose, context };
  }

  test("each member has one spelling, and others name it", () => {
    const { friendly, context } = screen();
    const draw = friendly.draw as Loose;
    draw.filledCircle!([10, 10], 4, "red");
    expect(context.operations).toEqual(["arc", "fill"]);
    expect(friendly.width).toBe(100);
    expect(() => draw.filled_circle).toThrow(
      "screen.draw.filled_circle doesn't exist. Did you mean screen.draw.filledCircle?",
    );
    expect(() => draw.FILLED_CIRCLE).toThrow(
      "Did you mean screen.draw.filledCircle?",
    );
    expect(() => draw.filledcircle).toThrow(
      "Did you mean screen.draw.filledCircle?",
    );
  });

  test("a misspelled member fails with a suggestion", () => {
    const { friendly } = screen();
    const draw = friendly.draw as Loose;
    expect(() => draw.cirlce).toThrow(
      "screen.draw.cirlce doesn't exist. Did you mean screen.draw.circle?",
    );
    expect(() => friendly.sparkle).toThrow("screen.sparkle doesn't exist.");
  });

  test("the short forms suggest themselves over a hint", () => {
    const { friendly, context } = screen();
    friendly.circle!(10, 10, 4, "red");
    expect(context.operations).toEqual(["arc", "fill"]);
    expect(() => friendly.Circle).toThrow(
      "screen.Circle doesn't exist. Did you mean screen.circle?",
    );
    expect(() => friendly.circel).toThrow(
      "screen.circel doesn't exist. Did you mean screen.circle?",
    );
    expect(() => friendly.triangel).toThrow("Did you mean screen.triangle?");
    expect(() => friendly.rec).toThrow("Did you mean screen.rect?");
  });

  test("hidden internals fail with a hint at the real method", () => {
    const { friendly } = screen();
    expect(() => friendly.drawRect).toThrow(
      "screen.drawRect doesn't exist. Did you mean screen.draw.rect?",
    );
  });

  test("methods stay bound, and tooling probes stay quiet", () => {
    const clock = new Clock();
    const friendly = friendlyService(clock, "clock") as unknown as Loose;
    const schedule = friendly.scheduleInterval;
    expect(schedule).toBe(friendly.scheduleInterval);
    const calls: number[] = [];
    (schedule as (callback: () => void, interval: number) => void)(
      () => calls.push(1),
      1,
    );
    clock.tick(1);
    expect(calls).toEqual([1]);
    expect(friendly.then).toBeUndefined();
    expect(friendly.toJSON).toBeUndefined();
    expect(() => friendly.schedule_interval).toThrow(
      "clock.schedule_interval doesn't exist. Did you mean clock.scheduleInterval?",
    );
  });

  test("frozen constant tables keep their upper-case names", () => {
    const friendly = friendlyService(keys, "keys") as unknown as Loose;
    expect(friendly.SPACE).toBe(keys.SPACE);
    expect(friendly.KP_ENTER).toBe(keys.KP_ENTER);
    expect("SPACE" in friendly).toBe(true);
    expect(() => friendly.space).toThrow(
      "keys.space doesn't exist. Did you mean keys.SPACE?",
    );
    expect(() => friendly.kpEnter).toThrow("Did you mean keys.KP_ENTER?");
    expect(() => friendly.SPCE).toThrow(
      "keys.SPCE doesn't exist. Did you mean keys.SPACE?",
    );
  });
});
