import React, { Component, ReactNode, ErrorInfo } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Stack,
  Alert,
  Collapse,
  LinearProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  BugReport as BugReportIcon,
  Autorenew as AutorenewIcon,
} from '@mui/icons-material';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  showDetails: boolean;
  isRecovering: boolean;
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  enableAutoRecovery?: boolean;
  maxRecoveryAttempts?: number;
  recoveryDelay?: number;
}

/**
 * Global Error Boundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of the component tree that crashed.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private recoveryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      showDetails: false,
      isRecovering: false,
      recoveryAttempts: 0,
      maxRecoveryAttempts: props.maxRecoveryAttempts || 3,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details
    console.error('Error caught by ErrorBoundary:', error);
    console.error('Error info:', errorInfo);

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // In a real app, you might want to send this to an error reporting service
    this.logErrorToService(error, errorInfo);

    // Attempt auto-recovery for certain types of errors
    this.attemptAutoRecovery();
  }

  componentWillUnmount() {
    if (this.recoveryTimeoutId) {
      clearTimeout(this.recoveryTimeoutId);
    }
  }

  private logErrorToService = (error: Error, errorInfo: ErrorInfo) => {
    // This is where you would send the error to your error reporting service
    // For now, we'll just log it to the console with additional context
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };

    console.error('Error Report:', errorReport);

    // Example: Send to error reporting service
    // errorReportingService.captureException(error, {
    //   extra: errorReport,
    //   tags: {
    //     component: 'ErrorBoundary',
    //   },
    // });
  };

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      showDetails: false,
      isRecovering: false,
      recoveryAttempts: 0,
    });
  };

  private attemptAutoRecovery = () => {
    const { enableAutoRecovery = true, recoveryDelay = 3000 } = this.props;
    const { recoveryAttempts, maxRecoveryAttempts } = this.state;

    if (!enableAutoRecovery || recoveryAttempts >= maxRecoveryAttempts) {
      return;
    }

    this.setState({
      isRecovering: true,
      recoveryAttempts: recoveryAttempts + 1,
    });

    this.recoveryTimeoutId = setTimeout(() => {
      console.log(`🔄 ErrorBoundary: Attempting auto-recovery (${recoveryAttempts + 1}/${maxRecoveryAttempts})`);
      this.handleRetry();
    }, recoveryDelay);
  };

  private handleReload = () => {
    window.location.reload();
  };

  private toggleDetails = () => {
    this.setState(prevState => ({
      showDetails: !prevState.showDetails,
    }));
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 3,
            bgcolor: 'background.default',
          }}
        >
          <Card sx={{ maxWidth: 600, width: '100%' }}>
            <CardContent>
              <Stack spacing={3} alignItems="center">
                <BugReportIcon sx={{ fontSize: 64, color: 'error.main' }} />
                
                <Typography variant="h4" component="h1" textAlign="center" color="error">
                  Oops! Something went wrong
                </Typography>
                
                <Typography variant="body1" textAlign="center" color="text.secondary">
                  We're sorry, but something unexpected happened. The application has encountered an error.
                </Typography>

                <Alert severity="error" sx={{ width: '100%' }}>
                  <Typography variant="body2">
                    <strong>Error:</strong> {this.state.error?.message || 'Unknown error occurred'}
                  </Typography>
                </Alert>

                {/* Recovery Status */}
                {this.state.isRecovering && (
                  <Alert severity="info" sx={{ width: '100%' }}>
                    <Stack spacing={1}>
                      <Typography variant="body2">
                        <AutorenewIcon sx={{ fontSize: 16, mr: 1, verticalAlign: 'middle' }} />
                        Attempting automatic recovery... ({this.state.recoveryAttempts}/{this.state.maxRecoveryAttempts})
                      </Typography>
                      <LinearProgress />
                    </Stack>
                  </Alert>
                )}

                {/* Recovery Exhausted */}
                {this.state.recoveryAttempts >= this.state.maxRecoveryAttempts && !this.state.isRecovering && (
                  <Alert severity="warning" sx={{ width: '100%' }}>
                    <Typography variant="body2">
                      Automatic recovery failed after {this.state.maxRecoveryAttempts} attempts.
                      Please try manual recovery or reload the page.
                    </Typography>
                  </Alert>
                )}

                <Stack direction="row" spacing={2}>
                  <Button
                    variant="contained"
                    startIcon={<RefreshIcon />}
                    onClick={this.handleRetry}
                    color="primary"
                    disabled={this.state.isRecovering}
                  >
                    Try Again
                  </Button>

                  <Button
                    variant="outlined"
                    onClick={this.handleReload}
                    color="secondary"
                    disabled={this.state.isRecovering}
                  >
                    Reload Page
                  </Button>
                </Stack>

                {/* Error Details Section */}
                <Box sx={{ width: '100%' }}>
                  <Button
                    variant="text"
                    size="small"
                    onClick={this.toggleDetails}
                    endIcon={this.state.showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    sx={{ mb: 1 }}
                  >
                    {this.state.showDetails ? 'Hide' : 'Show'} Technical Details
                  </Button>
                  
                  <Collapse in={this.state.showDetails}>
                    <Card variant="outlined" sx={{ bgcolor: 'grey.50' }}>
                      <CardContent>
                        <Typography variant="subtitle2" gutterBottom>
                          Error Stack:
                        </Typography>
                        <Typography
                          variant="body2"
                          component="pre"
                          sx={{
                            fontSize: '0.75rem',
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: 200,
                            overflow: 'auto',
                            bgcolor: 'background.paper',
                            p: 1,
                            borderRadius: 1,
                          }}
                        >
                          {this.state.error?.stack || 'No stack trace available'}
                        </Typography>
                        
                        {this.state.errorInfo?.componentStack && (
                          <>
                            <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                              Component Stack:
                            </Typography>
                            <Typography
                              variant="body2"
                              component="pre"
                              sx={{
                                fontSize: '0.75rem',
                                fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                maxHeight: 200,
                                overflow: 'auto',
                                bgcolor: 'background.paper',
                                p: 1,
                                borderRadius: 1,
                              }}
                            >
                              {this.state.errorInfo.componentStack}
                            </Typography>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </Collapse>
                </Box>

                <Typography variant="caption" color="text.secondary" textAlign="center">
                  If this problem persists, please contact support with the technical details above.
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook version of ErrorBoundary for functional components
 * Note: This is a wrapper that uses the class-based ErrorBoundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

export default ErrorBoundary;
