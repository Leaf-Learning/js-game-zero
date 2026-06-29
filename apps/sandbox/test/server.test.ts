import { expect, test } from "bun:test";

test("phase 1 server source contains the health route", async () => {
  const source = await Bun.file("apps/sandbox/src/server.ts").text();
  expect(source).toContain("/api/health");
  expect(source).toContain("phase: 1");
});
