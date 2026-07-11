import { describe, expect, test } from "bun:test";
import {
  decodeApiErrorResponse,
  decodeCreateProjectRequest,
  decodeExamplesResponse,
  decodeFileResponse,
  decodeMutationResponse,
  decodeProjectResponse,
  decodeProjectsResponse,
  decodeRenameFileRequest,
  decodeRenameProjectRequest,
  decodeWriteFileRequest,
  isPreviewMessage,
} from "../shared/contracts";

describe("shared sandbox contracts", () => {
  test("decodes valid API requests and rejects malformed fields", () => {
    expect(decodeCreateProjectRequest({ name: "demo" })).toEqual({
      name: "demo",
    });
    expect(
      decodeCreateProjectRequest({ name: "demo", exampleSlug: "movement" }),
    ).toEqual({ name: "demo", exampleSlug: "movement" });
    expect(
      decodeCreateProjectRequest({ name: "demo", exampleSlug: 42 }),
    ).toBeNull();
    expect(decodeCreateProjectRequest([])).toBeNull();

    expect(decodeRenameProjectRequest({ name: "next" })).toEqual({
      name: "next",
    });
    expect(decodeRenameProjectRequest({ name: false })).toBeNull();
    expect(
      decodeWriteFileRequest({
        content: "source",
        baseVersion: 2,
        revision: 3,
        sessionId: "session-a",
      }),
    ).toEqual({
      content: "source",
      baseVersion: 2,
      revision: 3,
      sessionId: "session-a",
    });
    expect(decodeWriteFileRequest({ content: "source" })).toBeNull();
    expect(
      decodeWriteFileRequest({
        content: "source",
        baseVersion: 0,
        revision: 1,
        sessionId: "",
      }),
    ).toBeNull();
    expect(decodeWriteFileRequest({ content: null })).toBeNull();
    expect(decodeRenameFileRequest({ from: "a.js", to: "b.js" })).toEqual({
      from: "a.js",
      to: "b.js",
    });
    expect(decodeRenameFileRequest({ from: "a.js" })).toBeNull();
  });

  test("decodes project, example, file, and mutation responses", () => {
    const project = { name: "demo", files: ["main.js"] };
    expect(decodeProjectsResponse({ projects: [project] })).toEqual({
      projects: [project],
    });
    expect(
      decodeProjectsResponse({ projects: [{ ...project, files: [1] }] }),
    ).toBeNull();
    expect(decodeProjectsResponse({ projects: false })).toBeNull();
    expect(decodeProjectResponse({ project })).toEqual({ project });
    expect(decodeProjectResponse(null)).toBeNull();

    const example = {
      slug: "movement",
      title: "Movement",
      description: "Move around",
      expectsInput: "keyboard",
    } as const;
    expect(decodeExamplesResponse({ examples: [example] })).toEqual({
      examples: [example],
    });
    expect(
      decodeExamplesResponse({
        examples: [{ ...example, expectsInput: "voice" }],
      }),
    ).toBeNull();
    expect(decodeExamplesResponse({})).toBeNull();

    expect(
      decodeFileResponse({
        project: "demo",
        path: "main.js",
        content: "draw()",
        version: 4,
      }),
    ).toEqual({
      project: "demo",
      path: "main.js",
      content: "draw()",
      version: 4,
    });
    expect(decodeFileResponse({ project: "demo", path: "main.js" })).toBeNull();

    expect(
      decodeMutationResponse({
        ok: true,
        project: "demo",
        path: "main.js",
        from: "old.js",
        to: "main.js",
        bytes: 12,
        version: 5,
        stale: false,
      }),
    ).toEqual({
      ok: true,
      project: "demo",
      path: "main.js",
      from: "old.js",
      to: "main.js",
      bytes: 12,
      version: 5,
      stale: false,
    });
    expect(decodeMutationResponse({ ok: false, project: "demo" })).toBeNull();
    expect(
      decodeMutationResponse({ ok: true, project: "demo", path: 1 }),
    ).toBeNull();
    expect(
      decodeMutationResponse({ ok: true, project: "demo", from: 1 }),
    ).toBeNull();
    expect(
      decodeMutationResponse({ ok: true, project: "demo", to: 1 }),
    ).toBeNull();
    expect(
      decodeMutationResponse({ ok: true, project: "demo", bytes: 1.5 }),
    ).toBeNull();
  });

  test("decodes stable errors and every preview message variant", () => {
    expect(
      decodeApiErrorResponse({ error: "Missing", code: "not_found" }),
    ).toEqual({ error: "Missing", code: "not_found" });
    for (const code of [
      "invalid_request",
      "forbidden",
      "conflict",
      "method_not_allowed",
      "internal_error",
    ]) {
      expect(decodeApiErrorResponse({ error: "message", code })).not.toBeNull();
    }
    expect(
      decodeApiErrorResponse({ error: "Missing", code: "unknown" }),
    ).toBeNull();

    const base = { source: "jgz-sandbox-preview", project: "demo" };
    expect(
      isPreviewMessage({ ...base, type: "console", level: "warn", text: "hi" }),
    ).toBe(true);
    expect(
      isPreviewMessage({ ...base, type: "focus-changed", focused: true }),
    ).toBe(true);
    expect(
      isPreviewMessage({
        ...base,
        type: "runtime-error",
        message: "boom",
        line: 2,
      }),
    ).toBe(true);
    expect(
      isPreviewMessage({
        ...base,
        type: "diagnostic",
        diagnostic: {
          severity: "warning",
          message: "careful",
          code: "warning-code",
          line: 1,
        },
      }),
    ).toBe(true);
    expect(
      isPreviewMessage({
        ...base,
        type: "runtime-error",
        message: "boom",
        line: 0,
      }),
    ).toBe(false);
    expect(
      isPreviewMessage({ ...base, type: "diagnostic", diagnostic: null }),
    ).toBe(false);
    expect(isPreviewMessage({ ...base, type: "unknown" })).toBe(false);
    expect(isPreviewMessage({ type: "console" })).toBe(false);
  });
});
