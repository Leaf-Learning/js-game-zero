import { expect, test } from "bun:test";
import { previewMessageFromEvent } from "../client/preview";

const source = {} as MessageEventSource;
const message = {
  source: "jgz-sandbox-preview",
  project: "demo",
  type: "console",
  level: "log",
  text: "hello",
} as const;

test("preview messages require the expected origin, source window, project, and shape", () => {
  expect(
    previewMessageFromEvent(
      { data: message, origin: "http://127.0.0.1:4174", source },
      source,
      "http://127.0.0.1:4174",
      "demo",
    ),
  ).toEqual(message);

  expect(
    previewMessageFromEvent(
      { data: message, origin: "http://evil.test", source },
      source,
      "http://127.0.0.1:4174",
      "demo",
    ),
  ).toBeNull();
  expect(
    previewMessageFromEvent(
      { data: message, origin: "http://127.0.0.1:4174", source: null },
      source,
      "http://127.0.0.1:4174",
      "demo",
    ),
  ).toBeNull();
  expect(
    previewMessageFromEvent(
      {
        data: { ...message, level: "debug" },
        origin: "http://127.0.0.1:4174",
        source,
      },
      source,
      "http://127.0.0.1:4174",
      "demo",
    ),
  ).toBeNull();
});
