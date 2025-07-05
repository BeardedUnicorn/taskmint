/**
 * Admin Page
 * 
 * Administrative interface for testing subscription tiers and managing user settings
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
} from '@mui/material';
import {
  Settings as AdminIcon,
  Security as SecurityIcon,
  Upgrade as UpgradeIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';

import { useSubscription } from '../../contexts/SubscriptionContext';
import { useNotification } from '../../contexts/NotificationContext';
import {
  SubscriptionSku,
  SUBSCRIPTION_SKUS,
  SUBSCRIPTION_TIERS,
  Feature,
  FEATURES,
} from '../../types/subscription';
import { formatLocalDateForTable } from '../../utils/dateHelpers';

export function AdminPage() {
  const {
    subscription,
    currentTier,
    isLoading,
    upgradeSubscription,
    refreshSubscription,
    getFeatureAccessSummary,
  } = useSubscription();
  
  const { showSuccess, showError } = useNotification();
  
  const [selectedSku, setSelectedSku] = useState<SubscriptionSku>(SUBSCRIPTION_SKUS.FREE);
  const [isChanging, setIsChanging] = useState(false);
  const [featureAccess, setFeatureAccess] = useState<Record<Feature, boolean>>({} as Record<Feature, boolean>);
  const [loadingFeatures, setLoadingFeatures] = useState(true);

  // Load current subscription and feature access
  useEffect(() => {
    if (subscription) {
      setSelectedSku(subscription.sku);
    }
  }, [subscription]);

  useEffect(() => {
    loadFeatureAccess();
  }, [subscription]);

  const loadFeatureAccess = async () => {
    try {
      setLoadingFeatures(true);
      const access = await getFeatureAccessSummary();
      setFeatureAccess(access);
    } catch (error) {
      console.error('Failed to load feature access:', error);
      showError('Failed to load feature access information');
    } finally {
      setLoadingFeatures(false);
    }
  };

  const handleSkuChange = async () => {
    if (!selectedSku || selectedSku === subscription?.sku) {
      return;
    }

    try {
      setIsChanging(true);
      await upgradeSubscription(selectedSku);
      await loadFeatureAccess();
      showSuccess(`Successfully changed subscription to ${SUBSCRIPTION_TIERS[selectedSku].name}`);
    } catch (error) {
      console.error('Failed to change subscription:', error);
      showError('Failed to change subscription. Please try again.');
    } finally {
      setIsChanging(false);
    }
  };

  const handleRefresh = async () => {
    try {
      await refreshSubscription();
      await loadFeatureAccess();
      showSuccess('Subscription data refreshed');
    } catch (error) {
      console.error('Failed to refresh subscription:', error);
      showError('Failed to refresh subscription data');
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <AdminIcon sx={{ mr: 2, fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" component="h1">
            Admin Panel
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          Administrative interface for testing subscription tiers and managing user settings.
        </Typography>
      </Box>

      <Alert severity="warning" sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>Testing Environment:</strong> This admin panel is for testing subscription features. 
          Changes made here will affect the application's behavior and feature access.
        </Typography>
      </Alert>

      {/* Current Subscription Status */}
      <Box sx={{ display: 'flex', gap: 3, mb: 3, flexWrap: 'wrap' }}>
        <Card sx={{ flex: 1, minWidth: 300 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <SecurityIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6">Current Subscription</Typography>
            </Box>
            
            {subscription && currentTier && (
              <>
                <Box sx={{ mb: 2 }}>
                  <Chip 
                    label={currentTier.name}
                    color="primary"
                    sx={{ mb: 1 }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    SKU: {subscription.sku}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Activated: {formatLocalDateForTable(subscription.activatedAt)}
                  </Typography>
                </Box>
                
                <Typography variant="body2" sx={{ mb: 2 }}>
                  {currentTier.description}
                </Typography>

                {currentTier.taskLimit && (
                  <Typography variant="body2" color="text.secondary">
                    Task Limit: {currentTier.taskLimit} tasks
                  </Typography>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Subscription Management */}
        <Card sx={{ flex: 1, minWidth: 300 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <UpgradeIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6">Change Subscription</Typography>
            </Box>
            
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Subscription Tier</InputLabel>
              <Select
                value={selectedSku}
                label="Subscription Tier"
                onChange={(e) => setSelectedSku(e.target.value as SubscriptionSku)}
                disabled={isChanging}
              >
                {Object.values(SUBSCRIPTION_SKUS).map((sku) => (
                  <MenuItem key={sku} value={sku}>
                    {SUBSCRIPTION_TIERS[sku].name} ({sku})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                onClick={handleSkuChange}
                disabled={isChanging || selectedSku === subscription?.sku}
                startIcon={isChanging ? <CircularProgress size={16} /> : <UpgradeIcon />}
              >
                {isChanging ? 'Changing...' : 'Apply Changes'}
              </Button>
              
              <Button
                variant="outlined"
                onClick={handleRefresh}
                disabled={isChanging}
              >
                Refresh
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Feature Access Overview */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Feature Access Overview
          </Typography>
          
          {loadingFeatures ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {Object.entries(FEATURES).map(([featureName, featureKey]) => {
                const hasAccess = featureAccess[featureKey];
                return (
                  <Box
                    key={featureKey}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      p: 1,
                      borderRadius: 1,
                      backgroundColor: hasAccess ? 'success.light' : 'error.light',
                      color: hasAccess ? 'success.contrastText' : 'error.contrastText',
                      minWidth: 200,
                      flex: '1 1 auto',
                    }}
                  >
                    {hasAccess ? (
                      <CheckIcon sx={{ mr: 1, fontSize: 20 }} />
                    ) : (
                      <CancelIcon sx={{ mr: 1, fontSize: 20 }} />
                    )}
                    <Typography variant="body2">
                      {featureName.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Subscription Tiers Reference */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Subscription Tiers Reference
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {Object.values(SUBSCRIPTION_TIERS).map((tier) => (
              <Paper key={tier.sku} sx={{ p: 2, flex: '1 1 300px', minWidth: 300 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {tier.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {tier.description}
                </Typography>
                
                {tier.taskLimit && (
                  <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
                    Task Limit: {tier.taskLimit}
                  </Typography>
                )}
                
                <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold' }}>
                  Features:
                </Typography>
                <List dense>
                  {tier.features.map((feature) => (
                    <ListItem key={feature} sx={{ py: 0.5, px: 0 }}>
                      <ListItemText
                        primary={
                          <Typography variant="body2">
                            • {feature.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                          </Typography>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            ))}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
