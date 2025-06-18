import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Snackbar, Alert, AlertColor } from '@mui/material';

export interface NotificationOptions {
  severity?: AlertColor;
  autoHideDuration?: number;
  persist?: boolean;
}

export interface Notification {
  id: string;
  message: string;
  severity: AlertColor;
  autoHideDuration: number;
  persist: boolean;
  timestamp: number;
}

interface NotificationContextType {
  showNotification: (message: string, options?: NotificationOptions) => void;
  showSuccess: (message: string, options?: Omit<NotificationOptions, 'severity'>) => void;
  showError: (message: string, options?: Omit<NotificationOptions, 'severity'>) => void;
  showWarning: (message: string, options?: Omit<NotificationOptions, 'severity'>) => void;
  showInfo: (message: string, options?: Omit<NotificationOptions, 'severity'>) => void;
  hideNotification: (id: string) => void;
  hideAllNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: ReactNode;
  maxNotifications?: number;
}

export function NotificationProvider({ 
  children, 
  maxNotifications = 3 
}: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const generateId = useCallback(() => {
    return `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const showNotification = useCallback((
    message: string, 
    options: NotificationOptions = {}
  ) => {
    const {
      severity = 'info',
      autoHideDuration = 6000,
      persist = false
    } = options;

    const notification: Notification = {
      id: generateId(),
      message,
      severity,
      autoHideDuration,
      persist,
      timestamp: Date.now(),
    };

    setNotifications(prev => {
      const newNotifications = [notification, ...prev];
      // Limit the number of notifications
      return newNotifications.slice(0, maxNotifications);
    });

    // Auto-hide notification if not persistent
    if (!persist && autoHideDuration > 0) {
      setTimeout(() => {
        hideNotification(notification.id);
      }, autoHideDuration);
    }
  }, [generateId, maxNotifications]);

  const showSuccess = useCallback((
    message: string, 
    options: Omit<NotificationOptions, 'severity'> = {}
  ) => {
    showNotification(message, { ...options, severity: 'success' });
  }, [showNotification]);

  const showError = useCallback((
    message: string, 
    options: Omit<NotificationOptions, 'severity'> = {}
  ) => {
    showNotification(message, { 
      ...options, 
      severity: 'error',
      autoHideDuration: options.autoHideDuration ?? 8000 // Longer for errors
    });
  }, [showNotification]);

  const showWarning = useCallback((
    message: string, 
    options: Omit<NotificationOptions, 'severity'> = {}
  ) => {
    showNotification(message, { ...options, severity: 'warning' });
  }, [showNotification]);

  const showInfo = useCallback((
    message: string, 
    options: Omit<NotificationOptions, 'severity'> = {}
  ) => {
    showNotification(message, { ...options, severity: 'info' });
  }, [showNotification]);

  const hideNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  const hideAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const contextValue: NotificationContextType = {
    showNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    hideNotification,
    hideAllNotifications,
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      
      {/* Render notifications */}
      {notifications.map((notification, index) => (
        <Snackbar
          key={notification.id}
          open={true}
          autoHideDuration={notification.persist ? null : notification.autoHideDuration}
          onClose={() => hideNotification(notification.id)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          sx={{
            // Stack notifications vertically
            bottom: `${16 + (index * 70)}px !important`,
          }}
        >
          <Alert
            onClose={() => hideNotification(notification.id)}
            severity={notification.severity}
            sx={{ width: '100%' }}
            variant="filled"
          >
            {notification.message}
          </Alert>
        </Snackbar>
      ))}
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
