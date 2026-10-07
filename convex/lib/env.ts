// Typed here rather than through Node's types, so the app's own typecheck,
// which reaches these files through the generated API, knows it too.
declare const process: { env: Record<string, string | undefined> };

/** An environment variable of the deployment. */
export function env(name: string): string | undefined {
  return process.env[name];
}
