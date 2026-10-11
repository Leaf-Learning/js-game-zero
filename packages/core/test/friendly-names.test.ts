import { describe, expect, test } from "bun:test";
import {
  Actor,
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
  type CanvasLike,
  type DrawableImage,
} from "@js-game-zero/core/host";
import { friendlyService } from "../src/friendly-names";

/** The camelCase spellings exist at runtime only, outside the typed API. */
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

describe("camelCase spellings of library methods and properties", () => {
  test("Actor answers to camelCase names", () => {
    const actor = new Actor("hero.svg", { topleft: [0, 0], loader: loader() });
    const loose = actor as unknown as Loose;
    expect(loose.angleTo!([10, 5])).toBe(actor.angle_to([10, 5]));
    expect(loose.distanceTo!([13, 9])).toBe(5);
    loose.topLeft = [30, 40];
    expect(actor.topleft).toEqual([30, 40]);
    expect(loose.midBottom).toEqual(actor.midbottom);
    expect(loose.collidePoint!([35, 45])).toBe(true);
    expect(loose.collideRect!([0, 0, 5, 5])).toBe(false);
    loose.clampIp!([0, 0, 25, 25]);
    expect(actor.topleft).toEqual([5, 15]);
    expect(Object.keys(actor)).not.toContain("topLeft");
  });

  test("Rect, Clock, Storage and ImageSurface answer to camelCase names", () => {
    const rect = new Rect(0, 0, 10, 10) as unknown as Loose;
    expect(rect.collidePoint!([5, 5])).toBe(true);
    expect(rect.centerX).toBe(5);

    const clock = new Clock();
    const ticks: number[] = [];
    (clock as unknown as Loose).eachTick!((dt: number) => ticks.push(dt));
    clock.tick(0.5);
    expect(ticks).toEqual([0.5]);

    const storage = new Storage({
      adapter: { path: "memory", load: async () => null, save: () => {} },
    });
    expect((storage as unknown as Loose).setDefault!("lives", 3)).toBe(3);

    expect((surface(4, 3) as unknown as Loose).getSize!()).toEqual([4, 3]);
  });

  test("music answers to camelCase names", () => {
    const music = createMusicPlayer() as unknown as Loose;
    music.setVolume!(0.25);
    expect(music.getVolume!()).toBe(0.25);
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
      hints: { drawrect: "screen.draw.rect" },
    });
    return { friendly: friendly as unknown as Loose, context };
  }

  test("any capitalization of a member reaches it", () => {
    const { friendly, context } = screen();
    const draw = friendly.draw as Loose;
    draw.filledCircle!([10, 10], 4, "red");
    draw.FILLED_CIRCLE!([10, 10], 4, "red");
    expect(context.operations).toEqual(["arc", "fill", "arc", "fill"]);
    expect(friendly.width).toBe(100);
  });

  test("a misspelled member fails with a suggestion", () => {
    const { friendly } = screen();
    const draw = friendly.draw as Loose;
    expect(() => draw.cirlce).toThrow(
      "screen.draw.cirlce doesn't exist. Did you mean screen.draw.circle?",
    );
    expect(() => friendly.sparkle).toThrow("screen.sparkle doesn't exist.");
  });

  test("the short forms answer to any capitalization, and suggest themselves", () => {
    const { friendly, context } = screen();
    friendly.Circle!(10, 10, 4, "red");
    expect(context.operations).toEqual(["arc", "fill"]);
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
    const schedule = friendly.schedule_interval;
    expect(schedule).toBe(friendly.schedule_interval);
    const calls: number[] = [];
    (schedule as (callback: () => void, interval: number) => void)(
      () => calls.push(1),
      1,
    );
    clock.tick(1);
    expect(calls).toEqual([1]);
    expect(friendly.then).toBeUndefined();
    expect(friendly.toJSON).toBeUndefined();
  });

  test("frozen constant tables work with any capitalization", () => {
    const friendly = friendlyService(keys, "keys") as unknown as Loose;
    expect(friendly.SPACE).toBe(keys.SPACE);
    expect(friendly.space).toBe(keys.SPACE);
    expect(friendly.Left).toBe(keys.LEFT);
    expect("SPACE" in friendly).toBe(true);
    expect(() => friendly.SPCE).toThrow(
      "keys.SPCE doesn't exist. Did you mean keys.SPACE?",
    );
  });
});
