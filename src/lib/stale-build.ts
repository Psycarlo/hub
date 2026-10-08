const RELOADED_KEY = "stale-build-reload";
const RETRY_AFTER_MS = 10_000;

/** Whether a reload is worth trying, noting the attempt so it isn't repeated. */
function claimReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_KEY));
    if (Date.now() - last < RETRY_AFTER_MS) {
      return false;
    }
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
    return true;
  } catch {
    // Without storage a reload could loop, so leave it to the error screen.
    return false;
  }
}

/**
 * A tab left open across a deploy asks for chunks the new build no longer
 * has. One reload picks up the new build; another miss right after is a real
 * failure and reaches the error screen.
 */
export function startStaleBuildReload(): void {
  addEventListener("vite:preloadError", (event) => {
    if (claimReload()) {
      event.preventDefault();
      location.reload();
    }
  });
}
