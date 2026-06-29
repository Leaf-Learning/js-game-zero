import { expect, test } from "bun:test";
import { phaseOneHandler } from "../src/server";

test("phase 1 health route returns JSON from the real handler", async () => {
  const response = await phaseOneHandler(
    new Request("http://localhost/api/health"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, phase: 1 });
});

test("phase 1 handler returns 404 for unknown routes", async () => {
  const response = await phaseOneHandler(
    new Request("http://localhost/missing"),
  );
  expect(response.status).toBe(404);
});
