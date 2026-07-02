import { h, qs } from "./dom";
import type { PreviewMessage, PreviewStatusKind } from "./types";

export type PreviewCallbacks = {
  readonly onMessage: (message: PreviewMessage) => void;
  readonly onPlayRequested: () => void;
  readonly onRestartRequested: () => void;
};

export type PreviewHandle = {
  play(project: string): void;
  stop(): void;
  restart(): void;
  isRunning(): boolean;
  currentProject(): string | null;
  setSelectedProject(project: string | null): void;
};

const STATUS_LABEL: Record<PreviewStatusKind, string> = {
  stopped: "Stopped",
  running: "Running",
  error: "Something went wrong",
};

export function createPreview(
  root: HTMLElement,
  callbacks: PreviewCallbacks,
): PreviewHandle {
  const frameHost = qs<HTMLDivElement>(root, "[data-jgz-preview-frame-host]");
  const statusPill = qs<HTMLSpanElement>(root, "[data-jgz-preview-status]");
  const overlay = qs<HTMLDivElement>(root, "[data-jgz-focus-overlay]");
  const playButton = qs<HTMLButtonElement>(root, "[data-jgz-play]");
  const stopButton = qs<HTMLButtonElement>(root, "[data-jgz-stop]");
  const restartButton = qs<HTMLButtonElement>(root, "[data-jgz-restart]");

  let iframe: HTMLIFrameElement | null = null;
  let activeProject: string | null = null;
  let selectedProject: string | null = null;
  let running = false;

  function setStatus(kind: PreviewStatusKind): void {
    statusPill.textContent = STATUS_LABEL[kind];
    statusPill.dataset.status = kind;
  }

  function setButtons(): void {
    playButton.disabled = !selectedProject;
    stopButton.disabled = !running;
    restartButton.disabled = !running;
  }

  function showOverlay(show: boolean): void {
    overlay.hidden = !show || !running;
  }

  function teardownFrame(): void {
    if (iframe) {
      iframe.remove();
      iframe = null;
    }
  }

  function mountFrame(project: string): void {
    teardownFrame();
    const frame = h("iframe", {
      className: "preview-frame",
      attrs: {
        title: "Game preview",
        "data-jgz-preview": "",
        src: `/play/${encodeURIComponent(project)}?v=${Date.now()}`,
      },
    });
    frameHost.append(frame);
    iframe = frame;
  }

  function play(project: string): void {
    activeProject = project;
    running = true;
    setStatus("running");
    setButtons();
    showOverlay(true);
    mountFrame(project);
  }

  function stop(): void {
    running = false;
    teardownFrame();
    setStatus("stopped");
    setButtons();
    showOverlay(false);
  }

  function restart(): void {
    if (!activeProject) return;
    play(activeProject);
  }

  overlay.addEventListener("click", () => {
    iframe?.focus();
    overlay.hidden = true;
  });
  playButton.addEventListener("click", () => callbacks.onPlayRequested());
  stopButton.addEventListener("click", () => stop());
  restartButton.addEventListener("click", () => callbacks.onRestartRequested());

  window.addEventListener("message", (event) => {
    const data = event.data as PreviewMessage | undefined;
    if (!data || data.source !== "jgz-sandbox-preview") return;
    if (data.project !== activeProject) return;
    if (data.type === "focus-changed") {
      showOverlay(!data.focused);
      return;
    }
    if (data.type === "runtime-error") {
      setStatus("error");
    }
    if (data.type === "diagnostic" && data.diagnostic.severity === "error") {
      setStatus("error");
    }
    callbacks.onMessage(data);
  });

  setStatus("stopped");
  setButtons();

  return {
    play,
    stop,
    restart,
    isRunning: () => running,
    currentProject: () => activeProject,
    setSelectedProject(project: string | null): void {
      selectedProject = project;
      setButtons();
    },
  };
}
