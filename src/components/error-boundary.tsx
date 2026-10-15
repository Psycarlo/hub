import type { ComponentType, ReactNode } from "react";
import { Component } from "react";

import { ErrorScreen } from "@/components/status-screens";
import { errorMessage } from "@/lib/utils";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** In place of the error screen, for a part the page can do without. */
  fallback?: ComponentType<{ error: unknown }>;
  onError?: (error: unknown) => void;
}

interface ErrorBoundaryState {
  error: unknown;
}

/** Shows what broke instead of a blank page, with a way to reload. */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: undefined };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError?.(error);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error !== undefined) {
      const { fallback: Fallback } = this.props;
      return Fallback ? (
        <Fallback error={error} />
      ) : (
        <ErrorScreen message={errorMessage(error)} />
      );
    }
    return this.props.children;
  }
}
