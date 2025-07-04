
import { useState, useEffect, useCallback } from 'react';
import { StorageService } from '../services/StorageService';
import { STORAGE_KEYS } from '../constants';
import { z } from 'zod';

const DEFAULT_FUNDS_RELEASE_DAYS = 7;
const FundsReleaseDaysSchema = z.number().int().min(0);

export function useFundsReleaseSettings() {
  const [days, setDays] = useState<number>(DEFAULT_FUNDS_RELEASE_DAYS);
  const storageService = StorageService.getInstance();

  useEffect(() => {
    const fetchDays = async () => {
      const storedDays = await storageService.getItem<number>(STORAGE_KEYS.FUNDS_RELEASE_DAYS, DEFAULT_FUNDS_RELEASE_DAYS, FundsReleaseDaysSchema);
      setDays(storedDays);
    };
    fetchDays();
  }, [storageService]);

  const updateDays = useCallback(async (newDays: number) => {
    setDays(newDays);
    await storageService.setItem(STORAGE_KEYS.FUNDS_RELEASE_DAYS, newDays, FundsReleaseDaysSchema);
  }, [storageService]);

  return { days, updateDays };
}
