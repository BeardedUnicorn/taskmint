/**
 * Upgrade Dialog Component
 * 
 * Shows subscription upgrade options when users try to access premium features
 */

import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Divider,
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Upgrade as UpgradeIcon,
  Star as StarIcon,
} from '@mui/icons-material';

import {
  SubscriptionSku,
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_SKUS,
} from '../../types/subscription';

// Get website URL from environment variables
const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL || 'https://taskmint.app';

interface UpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  onUpgrade?: (sku: SubscriptionSku) => void;
  currentSku?: SubscriptionSku;
  requiredSku?: SubscriptionSku;
  featureName?: string;
  title?: string;
  description?: string;
}

export function UpgradeDialog({
  open,
  onClose,
  onUpgrade,
  currentSku = SUBSCRIPTION_SKUS.FREE,
  requiredSku,
  featureName,
  title,
  description,
}: UpgradeDialogProps) {
  const currentTier = SUBSCRIPTION_TIERS[currentSku];
  
  // Determine which tiers to show for upgrade
  const availableUpgrades = Object.values(SUBSCRIPTION_SKUS).filter(sku => {
    const tierOrder = [SUBSCRIPTION_SKUS.FREE, SUBSCRIPTION_SKUS.PRO, SUBSCRIPTION_SKUS.POWER];
    const currentIndex = tierOrder.indexOf(currentSku);
    const skuIndex = tierOrder.indexOf(sku);
    return skuIndex > currentIndex;
  });

  const handleUpgrade = (sku: SubscriptionSku) => {
    onUpgrade?.(sku);
    onClose();
  };

  const getDialogTitle = () => {
    if (title) return title;
    if (featureName) return `Upgrade Required for ${featureName}`;
    return 'Upgrade Your Subscription';
  };

  const getDialogDescription = () => {
    if (description) return description;
    if (featureName && requiredSku) {
      const requiredTier = SUBSCRIPTION_TIERS[requiredSku];
      return `${featureName} requires ${requiredTier.name} subscription or higher.`;
    }
    return 'Unlock more features with a subscription upgrade.';
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <UpgradeIcon color="primary" />
          <Typography variant="h6" component="span">
            {getDialogTitle()}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          {getDialogDescription()}
        </Typography>

        {/* Current Subscription */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
            Current Subscription
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip 
              label={currentTier.name}
              color="default"
              size="small"
            />
            <Typography variant="body2" color="text.secondary">
              {currentTier.description}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Available Upgrades */}
        <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
          Available Upgrades
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {availableUpgrades.map((sku) => {
            const tier = SUBSCRIPTION_TIERS[sku];
            const isRecommended = sku === requiredSku;

            return (
              <Box
                key={sku}
                sx={{
                  border: 1,
                  borderColor: isRecommended ? 'primary.main' : 'divider',
                  borderRadius: 2,
                  p: 2,
                  position: 'relative',
                  backgroundColor: isRecommended ? 'primary.light' : 'background.paper',
                  '&:hover': {
                    borderColor: 'primary.main',
                    backgroundColor: 'primary.light',
                  },
                }}
              >
                {isRecommended && (
                  <Chip
                    label="Recommended"
                    color="primary"
                    size="small"
                    icon={<StarIcon />}
                    sx={{
                      position: 'absolute',
                      top: -8,
                      right: 16,
                    }}
                  />
                )}

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {tier.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {tier.description}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      color="primary"
                      href={WEBSITE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="small"
                    >
                      Purchase {tier.name}
                    </Button>
                    <Button
                      variant={isRecommended ? "contained" : "outlined"}
                      color="primary"
                      onClick={() => handleUpgrade(sku)}
                      startIcon={<UpgradeIcon />}
                      size="small"
                    >
                      Test Upgrade
                    </Button>
                  </Box>
                </Box>

                {/* Feature List */}
                <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                  Features:
                </Typography>
                <List dense sx={{ py: 0 }}>
                  {tier.features.slice(0, 5).map((feature) => (
                    <ListItem key={feature} sx={{ py: 0.25, px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <CheckIcon color="success" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography variant="body2">
                            {feature.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                          </Typography>
                        }
                      />
                    </ListItem>
                  ))}
                  {tier.features.length > 5 && (
                    <ListItem sx={{ py: 0.25, px: 0 }}>
                      <ListItemIcon sx={{ minWidth: 32 }}>
                        <CheckIcon color="success" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography variant="body2" color="text.secondary">
                            And {tier.features.length - 5} more features...
                          </Typography>
                        }
                      />
                    </ListItem>
                  )}
                </List>

                {tier.taskLimit && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Task Limit: {tier.taskLimit} tasks
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3, pt: 1 }}>
        <Button onClick={onClose} color="inherit">
          Maybe Later
        </Button>
      </DialogActions>
    </Dialog>
  );
}
