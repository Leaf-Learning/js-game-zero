import { expect, test } from "bun:test";
import { Rect } from "@js-game-zero/core";
import { serializeGameValue } from "../browser/serialize";

test("serializes framework and non-JSON values with stable tags", () => {
  const circular: Record<string, unknown> = { value: 1 };
  circular.self = circular;
  expect(
    serializeGameValue({
      rect: new Rect(1, 2, 3, 4),
      set: new Set([1, 2]),
      map: new Map([["score", 3]]),
      missing: undefined,
      infinite: Infinity,
      negativeZero: -0,
      circular,
    }),
  ).toMatchObject({
    rect: { $type: "Rect", left: 1, top: 2, width: 3, height: 4 },
    set: { $type: "Set", values: [1, 2], size: 2 },
    map: { $type: "Map", entries: [["score", 3]], size: 1 },
    missing: { $type: "Undefined" },
    infinite: { $type: "Number", value: "Infinity" },
    negativeZero: { $type: "Number", value: "-0" },
    circular: { self: { $type: "Circular" } },
  });
});
