export function normalizeStoragePath(path: string): string {
  if (path.length === 0 || path.includes("\\") || path.startsWith("/")) {
    throw new TypeError("storage path must be a relative forward-slash path.");
  }
  const segments = path.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new TypeError(
      "storage path cannot include empty or traversal segments.",
    );
  }
  return segments.join("/");
}

export function normalizeSandboxStoragePath(path: string): string {
  if (/^(\/|[a-z]:[\\/])/i.test(path)) {
    throw new TypeError("sandbox storage path must be relative.");
  }
  return normalizeStoragePath(path);
}

export function sandboxStoragePath(
  projectRoot: string,
  safePath: string,
): string {
  if (!projectRoot || projectRoot.includes("\0")) {
    throw new TypeError("projectRoot must be a non-empty filesystem path.");
  }
  return `${projectRoot.replace(/[\\/]+$/, "")}/${safePath}`;
}
