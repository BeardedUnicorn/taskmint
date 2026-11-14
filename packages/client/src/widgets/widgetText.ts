/**
 * The home-screen widgets' wording. Their figures change at most about once a
 * minute (whole dollars, minutes, whole percents), so a running timer sends a
 * new snapshot that often rather than every second.
 */

import { formatWholeCents } from '../utils/payoutCalculator';

/** "~$45": whole dollars, an estimate marked. */
export const widgetMoney = (cents: number, estimated: boolean) => `${estimated ? '~' : ''}${formatWholeCents(cents)}`;
