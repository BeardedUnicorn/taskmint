import dayjs from 'dayjs';
import { dayjsLocalizer } from 'react-big-calendar';
// Same dayjs plugin set the rest of the app runs with.
import './dateHelpers';

/**
 * react-big-calendar localizer for the Calendar page. It does local-time
 * date math as long as dayjs's `timezone` plugin is not loaded (see the note
 * in dateHelpers.ts); calendarLocalizer.test.ts guards that across DST.
 */
export const calendarLocalizer = dayjsLocalizer(dayjs);
