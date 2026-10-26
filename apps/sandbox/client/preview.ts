import { h, qs } from "./dom";
import { icon } from "./icons";
import { isPreviewMessage } from "../shared/contracts";
import type { PreviewMessage, PreviewStatusKind } from "./types";

export type PreviewCallbacks = {
  readonly onMessage: (message: PreviewMessage) => void;
  readonly onPlayRequested: () => void;
  readonly onRestartRequested: () => void;
  /** "Show me line 17" on the stopped game's card. */
  readonly onShowLine: (line: number) => void;
  readonly previewOrigin?: string;
};

export type PreviewHandle = {
  play(project: string): void;
  stop(): void;
  restart(): void;
  /** True while a game is on the stage, running or stopped by a problem. */
  isRunning(): boolean;
  currentProject(): string | null;
  setSelectedProject(project: string | null): void;
  setTitle(title: string): void;
};

const STATUS_LABEL: Record<PreviewStatusKind, string> = {
  stopped: "Stopped",
  running: "Running",
  error: "Needs a fix",
};

export function previewMessageFromEvent(
  event: Pick<MessageEvent<unknown>, "data" | "origin" | "source">,
  expectedSource: MessageEventSource | null,
  expectedOrigin: string,
  activeProject: string | null,
): PreviewMessage | null {
  if (event.origin !== expectedOrigin || event.source !== expectedSource) {
    return null;
  }
  if (!isPreviewMessage(event.data) || event.data.project !== activeProject) {
    return null;
  }
  return event.data;
}

/** The line a fatal problem happened on, if the message says. */
function problemLine(message: PreviewMessage): number | null | undefined {
  if (message.type === "runtime-error") return message.line ?? null;
  if (message.type === "diagnostic" && message.diagnostic.severity === "error")
    return message.diagnostic.line ?? null;
  return undefined;
}

export function createPreview(
  root: HTMLElement,
  callbacks: PreviewCallbacks,
): PreviewHandle {
  const stage = qs<HTMLDivElement>(root, "[data-jgz-preview-frame-wrap]");
  const frameHost = qs<HTMLDivElement>(root, "[data-jgz-preview-frame-host]");
  const statusPill = qs<HTMLSpanElement>(root, "[data-jgz-preview-status]");
  const overlay = qs<HTMLButtonElement>(root, "[data-jgz-focus-overlay]");
  const idle = qs<HTMLDivElement>(root, "[data-jgz-stage-idle]");
  const problemCard = qs<HTMLDivElement>(root, "[data-jgz-stage-problem]");
  const hint = qs<HTMLParagraphElement>(root, "[data-jgz-stage-hint]");
  const title = qs<HTMLHeadingElement>(root, "[data-jgz-stage-title]");
  const playButton = qs<HTMLButtonElement>(root, "[data-jgz-play]");
  const stopButton = qs<HTMLButtonElement>(root, "[data-jgz-stop]");
  const restartButton = qs<HTMLButtonElement>(root, "[data-jgz-restart]");
  const idlePlay = qs<HTMLButtonElement>(root, "[data-jgz-stage-play]");

  let iframe: HTMLIFrameElement | null = null;
  let activeProject: string | null = null;
  let selectedProject: string | null = null;
  let status: PreviewStatusKind = "stopped";
  let focused = false;
  let focusWhenLoaded = false;
  const previewOrigin = new URL(
    callbacks.previewOrigin ?? window.location.origin,
    window.location.href,
  ).origin;

  function render(): void {
    statusPill.textContent = STATUS_LABEL[status];
    statusPill.dataset.status = status;
    stage.dataset.state = status;
    stage.dataset.focused = String(status === "running" && focused);

    const running = status === "running";
    playButton.hidden = running;
    playButton.disabled = running || !selectedProject;
    stopButton.hidden = !running;
    stopButton.disabled = !running;
    restartButton.hidden = !running;
    restartButton.disabled = !running;

    idle.hidden = status !== "stopped";
    idlePlay.disabled = !selectedProject;
    overlay.hidden = !running || focused;
    problemCard.hidden = status !== "error";

    hint.hidden = !running;
    hint.replaceChildren(
      ...(focused
        ? [
            icon("keyboard", 18),
            "Your keys go to the game. Click your code to type again.",
          ]
        : [icon("mouse", 18), "Click the game to play it with your keys."]),
    );
  }

  function showProblemCard(line: number | null): void {
    const cardText = qs<HTMLParagraphElement>(
      problemCard,
      "[data-jgz-stage-problem-text]",
    );
    const showLine = qs<HTMLButtonElement>(
      problemCard,
      "[data-jgz-stage-show-line]",
    );
    cardText.textContent =
      line === null
        ? "Something in your code needs a fix. It happens to everyone! Messages, under the game, says what went wrong."
        : `Something on line ${line} needs a fix. It happens to everyone!`;
    showLine.hidden = line === null;
    showLine.dataset.line = String(line ?? "");
    showLine.replaceChildren(`Show me line ${line ?? ""}`);
  }

  function teardownFrame(): void {
    if (iframe) {
      iframe.remove();
      iframe = null;
    }
  }

  function mountFrame(project: string): void {
    teardownFrame();
    const source = new URL(
      `/play/${encodeURIComponent(project)}`,
      previewOrigin,
    );
    source.searchParams.set("v", String(Date.now()));
    const frame = h("iframe", {
      className: "preview-frame",
      attrs: {
        title: "Your game",
        "data-jgz-preview": "",
        src: source.href,
      },
    });
    frame.addEventListener("load", () => {
      // Pressing Play hands the keyboard to the game, unless the learner
      // has clicked somewhere else while it loaded.
      const active = document.activeElement;
      if (
        focusWhenLoaded &&
        (active === document.body || (active && root.contains(active)))
      ) {
        frame.focus();
      }
      focusWhenLoaded = false;
    });
    frameHost.append(frame);
    iframe = frame;
  }

  function play(project: string): void {
    activeProject = project;
    status = "running";
    focused = false;
    focusWhenLoaded = true;
    mountFrame(project);
    render();
  }

  function stop(): void {
    status = "stopped";
    focused = false;
    focusWhenLoaded = false;
    teardownFrame();
    render();
  }

  function restart(): void {
    if (!activeProject) return;
    play(activeProject);
  }

  overlay.addEventListener("click", () => {
    iframe?.focus();
  });
  playButton.addEventListener("click", () => callbacks.onPlayRequested());
  idlePlay.addEventListener("click", () => callbacks.onPlayRequested());
  stopButton.addEventListener("click", () => {
    stop();
    playButton.focus();
  });
  restartButton.addEventListener("click", () => callbacks.onRestartRequested());
  qs<HTMLButtonElement>(
    problemCard,
    "[data-jgz-stage-show-line]",
  ).addEventListener("click", (event) => {
    const line = Number((event.currentTarget as HTMLElement).dataset.line);
    if (line > 0) callbacks.onShowLine(line);
  });

  window.addEventListener("message", (event) => {
    const data = previewMessageFromEvent(
      event,
      iframe?.contentWindow ?? null,
      previewOrigin,
      activeProject,
    );
    if (!data) return;
    if (data.type === "focus-changed") {
      focused = data.focused;
      render();
      return;
    }
    const line = problemLine(data);
    if (line !== undefined && status === "running") {
      status = "error";
      focused = false;
      showProblemCard(line);
      render();
    }
    callbacks.onMessage(data);
  });

  render();

  return {
    play,
    stop,
    restart,
    isRunning: () => status !== "stopped",
    currentProject: () => activeProject,
    setSelectedProject(project: string | null): void {
      selectedProject = project;
      render();
    },
    setTitle(text: string): void {
      title.textContent = text;
    },
  };
}
