/**
 * The parts of web-push the hub uses. Declared here rather than through its
 * DefinitelyTyped package, which brings in Node's types: the app's own
 * typecheck reaches convex/delivery.ts through the generated API, and its
 * timers would take Node's types.
 */
declare module "web-push" {
  export interface PushSubscription {
    endpoint: string;
    keys: { auth: string; p256dh: string };
  }

  export interface RequestOptions {
    /** How long the push service keeps trying, in seconds. */
    TTL?: number;
    vapidDetails?: { privateKey: string; publicKey: string; subject: string };
  }

  /** What a push service answered with, when it refused a push. */
  export interface PushError extends Error {
    statusCode: number;
  }
  export const WebPushError: new () => PushError;

  export function sendNotification(
    subscription: PushSubscription,
    payload?: string,
    options?: RequestOptions
  ): Promise<unknown>;

  const webpush: {
    WebPushError: typeof WebPushError;
    sendNotification: typeof sendNotification;
  };
  export default webpush;
}
