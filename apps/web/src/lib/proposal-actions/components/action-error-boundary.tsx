// src/lib/proposal-actions/components/action-error-boundary.tsx

'use client';

import { Component, type ReactNode } from 'react';

import { Callout } from '@/components/ui';

interface Props {
  children: ReactNode;
  actionType: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ActionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error(`Error in ${this.props.actionType} form:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Callout
          variant="error"
          title="Action Form Error"
          description={`There was an error rendering the ${this.props.actionType} form. ${this.state.error?.message || 'Unknown error'}`}
        />
      );
    }

    return this.props.children;
  }
}
