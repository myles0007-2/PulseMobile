import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useColors } from '../store/useStore';

const MAX_RETRY_ATTEMPTS = 3;

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorCount: number;
  retryAttempts: number;
}

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  // Optional callback for analytics/error tracking. Called whenever an error is caught.
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/**
 * ErrorBoundary: Catches rendering errors and shows user-friendly recovery UI
 * Never shows white screen—always gives user a recovery path.
 *
 * Tracks error count and retry attempts. After MAX_RETRY_ATTEMPTS (3), disables retry button.
 * Use the optional onError callback to track errors for analytics/logging.
 *
 * Example:
 *   <ErrorBoundary
 *     onError={(error, info) => {
 *       console.log('Error caught:', error.message);
 *       logErrorToAnalytics({ error: error.message, component: info.componentStack });
 *     }}
 *   >
 *     <App />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<Props, ErrorBoundaryState> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      retryAttempts: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error, retryAttempts: 0 };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error (in dev: console; in prod: could send to logging service)
    console.error('ErrorBoundary caught error:', error);
    console.error('Error info:', errorInfo);

    this.setState((prev) => ({
      errorInfo,
      errorCount: prev.errorCount + 1,
    }));

    // Call optional error handler (for analytics, error tracking)
    this.props.onError?.(error, errorInfo);
  }

  handleReload = () => {
    const newRetryCount = this.state.retryAttempts + 1;
    if (newRetryCount > MAX_RETRY_ATTEMPTS) {
      return;
    }
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryAttempts: newRetryCount,
    });
  };

  componentDidUpdate() {
    // Reset errorCount on successful render (no error)
    if (!this.state.hasError && this.state.errorCount > 0) {
      this.setState({ errorCount: 0 });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReload={this.handleReload}
          errorCount={this.state.errorCount}
          retryAttempts={this.state.retryAttempts}
          maxRetries={MAX_RETRY_ATTEMPTS}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  onReload: () => void;
  errorCount: number;
  retryAttempts: number;
  maxRetries: number;
}

/**
 * ErrorFallback: User-friendly error UI
 * Shows friendly message, recovery button, and (in dev) error details
 */
function ErrorFallback({
  error,
  errorInfo,
  onReload,
  errorCount,
  retryAttempts,
  maxRetries,
}: ErrorFallbackProps) {
  const colors = useColors();
  const isDev = __DEV__; // __DEV__ is Expo's dev flag
  const retriesExhausted = retryAttempts >= maxRetries;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.bg },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Emoji Icon */}
        <Text style={styles.emoji}>😕</Text>

        {/* User-Friendly Message */}
        <Text style={[styles.title, { color: colors.text }]}>
          Oops!
        </Text>

        <Text
          style={[
            styles.description,
            { color: colors.textSecondary },
          ]}
        >
          Something unexpected happened.
        </Text>

        <Text
          style={[
            styles.hint,
            { color: colors.textSecondary },
          ]}
        >
          This isn't your fault. Let's try fixing it.
        </Text>

        {/* Dev-Only Error Details */}
        {isDev && error && (
          <View
            style={[
              styles.devDetails,
              { backgroundColor: colors.card },
            ]}
          >
            <Text
              style={[styles.devLabel, { color: colors.text }]}
            >
              📋 Error Details (Dev Mode)
            </Text>
            <Text
              style={[
                styles.devText,
                { color: colors.textSecondary },
              ]}
            >
              {error.message}
            </Text>
            {errorInfo?.componentStack && (
              <Text
                style={[
                  styles.devStack,
                  { color: colors.textMuted },
                ]}
              >
                {errorInfo.componentStack.slice(0, 500)}...
              </Text>
            )}
            <Text
              style={[
                styles.devLabel,
                { color: colors.textMuted },
              ]}
            >
              Error count: {errorCount}
            </Text>
          </View>
        )}

        {/* Recovery Button */}
        {retriesExhausted ? (
          <>
            <Pressable
              disabled
              style={[
                styles.button,
                { backgroundColor: colors.textMuted },
              ]}
            >
              <Text style={[styles.buttonText, { color: colors.card }]}>
                Retries Exhausted
              </Text>
            </Pressable>
            <Text
              style={[
                styles.footer,
                { color: colors.primary },
              ]}
            >
              We've tried {maxRetries} times. Please close and reopen the app to restart.
            </Text>
          </>
        ) : (
          <>
            <Pressable
              onPress={onReload}
              style={[
                styles.button,
                { backgroundColor: colors.primary },
              ]}
            >
              <Text style={[styles.buttonText, { color: colors.bg }]}>
                Try Again ({retryAttempts}/{maxRetries})
              </Text>
            </Pressable>

            {/* Secondary Info */}
            <Text
              style={[
                styles.footer,
                { color: colors.textMuted },
              ]}
            >
              If this keeps happening, try closing and reopening the app.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  hint: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  devDetails: {
    alignSelf: 'stretch',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 24,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#ff6b6b',
  },
  devLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  devText: {
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 8,
    lineHeight: 16,
  },
  devStack: {
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 8,
    lineHeight: 14,
  },
  button: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  footer: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 8,
  },
});
