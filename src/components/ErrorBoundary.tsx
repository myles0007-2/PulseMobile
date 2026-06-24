import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../store/useStore';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorCount: number;
}

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/**
 * ErrorBoundary: Catches rendering errors and shows user-friendly recovery UI
 * Never shows white screen—always gives user a recovery path
 */
export class ErrorBoundary extends React.Component<Props, ErrorBoundaryState> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
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
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReload={this.handleReload}
          errorCount={this.state.errorCount}
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
}: ErrorFallbackProps) {
  const theme = useTheme();
  const isDev = __DEV__; // __DEV__ is Expo's dev flag

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.bg },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Emoji Icon */}
        <Text style={styles.emoji}>😕</Text>

        {/* User-Friendly Message */}
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Oops!
        </Text>

        <Text
          style={[
            styles.description,
            { color: theme.colors.textSecondary },
          ]}
        >
          Something unexpected happened.
        </Text>

        <Text
          style={[
            styles.hint,
            { color: theme.colors.textSecondary },
          ]}
        >
          This isn't your fault. Let's try fixing it.
        </Text>

        {/* Dev-Only Error Details */}
        {isDev && error && (
          <View
            style={[
              styles.devDetails,
              { backgroundColor: theme.colors.bgSecondary },
            ]}
          >
            <Text
              style={[styles.devLabel, { color: theme.colors.text }]}
            >
              📋 Error Details (Dev Mode)
            </Text>
            <Text
              style={[
                styles.devText,
                { color: theme.colors.textSecondary },
              ]}
            >
              {error.message}
            </Text>
            {errorInfo?.componentStack && (
              <Text
                style={[
                  styles.devStack,
                  { color: theme.colors.textTertiary },
                ]}
              >
                {errorInfo.componentStack.slice(0, 500)}...
              </Text>
            )}
            <Text
              style={[
                styles.devLabel,
                { color: theme.colors.textTertiary },
              ]}
            >
              Error count: {errorCount}
            </Text>
          </View>
        )}

        {/* Recovery Button */}
        <TouchableOpacity
          onPress={onReload}
          style={[
            styles.button,
            { backgroundColor: theme.colors.primary },
          ]}
          activeOpacity={0.8}
        >
          <Text style={[styles.buttonText, { color: theme.colors.bgPrimary }]}>
            Try Again
          </Text>
        </TouchableOpacity>

        {/* Secondary Info */}
        <Text
          style={[
            styles.footer,
            { color: theme.colors.textTertiary },
          ]}
        >
          If this keeps happening, try closing and reopening the app.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = {
  container: {
    flex: 1,
    justifyContent: 'center' as const,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    marginBottom: 8,
    textAlign: 'center' as const,
  },
  description: {
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center' as const,
    lineHeight: 22,
  },
  hint: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center' as const,
    fontStyle: 'italic' as const,
  },
  devDetails: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 24,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#ff6b6b',
  },
  devLabel: {
    fontSize: 12,
    fontWeight: 'bold' as const,
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
    fontWeight: 'bold' as const,
    textAlign: 'center' as const,
  },
  footer: {
    fontSize: 12,
    textAlign: 'center' as const,
    lineHeight: 16,
    marginTop: 8,
  },
};
