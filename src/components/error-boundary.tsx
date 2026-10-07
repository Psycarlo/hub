import type { ReactNode } from "react";
import { Component } from "react";

import { ErrorScreen } from "@/components/status-screens";
import { errorMessage } from "@/lib/utils";

interface ErrorBoundaryProps {
  children: ReactNode;
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

  override render(): ReactNode {
    if (this.state.error !== undefined) {
      return <ErrorScreen message={errorMessage(this.state.error)} />;
    }
    return this.props.children;
  }
}
