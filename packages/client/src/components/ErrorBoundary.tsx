import { Component, ReactNode, ErrorInfo } from 'react';
import { Box, Typography, Button, Card, CardContent, Stack, Alert, Collapse, LinearProgress } from '@mui/material';
import {
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  BugReport as BugReportIcon,
  Autorenew as AutorenewIcon,
} from '@mui/icons-material';
import { captureException, addBreadcrumb, setContext } from '../utils/sentry';
import { reloadApp } from '../utils/appReload';
import { HideSplashScreen } from './HideSplashScreen';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  showDetails: boolean;
  isRecovering: boolean;
  recoveryAttempts: number;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 'page': fills its page instead of the window, so the sidebar stays usable. */
  level?: 'app' | 'page';
}

/** Automatic retries before the error stays up, each this long after the last. */
export const MAX_RECOVERY_ATTEMPTS = 3;
export const RECOVERY_DELAY_MS = 3000;
/** How long the children must render without an error before auto-recovery starts counting afresh. */
export const STABLE_RESET_MS = 10_000;

/**
 * Catches errors anywhere in its children, reports them, and shows what went
 * wrong in their place, retrying a few times on its own before leaving it to
 * Try Again or a reload.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private recoveryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private stableTimeoutId: ReturnType<typeof setTimeout> | null = null;

  state: ErrorBoundaryState = { hasError: false, showDetails: false, isRecovering: false, recoveryAttempts: 0 };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by ErrorBoundary:', error);
    console.error('Error info:', errorInfo);
    this.setState({ error, errorInfo });
    this.logErrorToService(error, errorInfo);
    this.attemptAutoRecovery();
  }

  componentDidUpdate(_prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState) {
    // Recovered: once the children have rendered cleanly for a while, a later
    // error gets the full set of automatic retries again.
    const recovered = prevState.hasError && !this.state.hasError;
    if (recovered && this.state.recoveryAttempts > 0) {
      this.clearStableTimeout();
      this.stableTimeoutId = setTimeout(() => {
        this.stableTimeoutId = null;
        this.setState({ recoveryAttempts: 0 });
      }, STABLE_RESET_MS);
    }
    if (!prevState.hasError && this.state.hasError) {
      this.clearStableTimeout();
    }
  }

  componentWillUnmount() {
    if (this.recoveryTimeoutId) clearTimeout(this.recoveryTimeoutId);
    this.clearStableTimeout();
  }

  private clearStableTimeout() {
    if (this.stableTimeoutId) {
      clearTimeout(this.stableTimeoutId);
      this.stableTimeoutId = null;
    }
  }

  private logErrorToService = (error: Error, errorInfo: ErrorInfo) => {
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      recoveryAttempts: this.state.recoveryAttempts,
    };
    console.error('Error Report:', errorReport);
    addBreadcrumb('Error caught by ErrorBoundary', 'error', 'error', {
      errorMessage: error.message,
      recoveryAttempts: this.state.recoveryAttempts,
    });
    setContext('errorBoundary', {
      componentStack: errorInfo.componentStack,
      recoveryAttempts: this.state.recoveryAttempts,
      maxRecoveryAttempts: MAX_RECOVERY_ATTEMPTS,
      timestamp: errorReport.timestamp,
    });
    captureException(error, errorReport);
  };

  /** Render the children again. Automatic retries keep their count, so a
   * persistent error stops after MAX_RECOVERY_ATTEMPTS instead of looping. */
  private resetBoundary = (resetAttempts: boolean) => {
    this.setState(prev => ({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      showDetails: false,
      isRecovering: false,
      recoveryAttempts: resetAttempts ? 0 : prev.recoveryAttempts,
    }));
  };

  // (Try Again is disabled while an automatic retry is pending)
  private handleRetry = () => this.resetBoundary(true);

  private attemptAutoRecovery = () => {
    const { recoveryAttempts } = this.state;
    if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) return;

    this.setState({ isRecovering: true, recoveryAttempts: recoveryAttempts + 1 });
    this.recoveryTimeoutId = setTimeout(() => {
      this.recoveryTimeoutId = null;
      console.warn(`ErrorBoundary: retrying (${recoveryAttempts + 1}/${MAX_RECOVERY_ATTEMPTS})`);
      this.resetBoundary(false);
    }, RECOVERY_DELAY_MS);
  };

  private toggleDetails = () => {
    this.setState(prevState => ({ showDetails: !prevState.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            minHeight: this.props.level === 'page' ? '100%' : '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 3,
            bgcolor: 'background.default',
          }}
        >
          {/* A phone's launch screen would otherwise cover this */}
          <HideSplashScreen />
          <Card sx={{ maxWidth: 600, width: '100%' }}>
            <CardContent>
              <Stack spacing={3} sx={{ alignItems: 'center' }}>
                <BugReportIcon sx={{ fontSize: 64, color: 'error.main' }} />

                <Typography variant="h4" component="h1" color="error" sx={{ textAlign: 'center' }}>
                  Oops! Something went wrong
                </Typography>

                <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center' }}>
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
                        Attempting automatic recovery... ({this.state.recoveryAttempts}/{MAX_RECOVERY_ATTEMPTS})
                      </Typography>
                      <LinearProgress />
                    </Stack>
                  </Alert>
                )}

                {/* Recovery Exhausted */}
                {this.state.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS && !this.state.isRecovering && (
                  <Alert severity="warning" sx={{ width: '100%' }}>
                    <Typography variant="body2">
                      Automatic recovery failed after {MAX_RECOVERY_ATTEMPTS} attempts. Please try manual recovery or
                      reload the page.
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

                  <Button variant="outlined" onClick={reloadApp} color="secondary" disabled={this.state.isRecovering}>
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

                <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
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
