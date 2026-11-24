import { config } from './config.js';

// HubSpot stores date-only task due dates at UTC midnight, so day boundaries are UTC.
const utcDayStart = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const utcDayEnd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)); };
const easternDateStr = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone }).format(date);

export function formatDay(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * The digest window.
 *  - Custom: DATE_FROM..DATE_TO (inclusive).
 *  - Default: next Mon–Sun (same as the Smartbuild digest). The window actually starts
 *    "now" so tasks due over the coming weekend are not lost between the
 *    overdue section and next week's list.
 * Returns { start, end, overdueBefore, label }.
 */
export function getDigestWindow(now = new Date()) {
  if (config.dateFrom && config.dateTo) {
    const start = utcDayStart(config.dateFrom);
    const end = utcDayEnd(config.dateTo);
    return { start, end, overdueBefore: start, label: `${formatDay(start)} – ${formatDay(end)}` };
  }

  const [y, m, d] = easternDateStr(now).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat
  const daysToMonday = dow === 1 ? 0 : (8 - dow) % 7;
  const monday = new Date(Date.UTC(y, m - 1, d + daysToMonday));
  const sunday = new Date(Date.UTC(y, m - 1, d + daysToMonday + 6, 23, 59, 59, 999));

  return { start: now, end: sunday, overdueBefore: now, label: formatDay(monday), monday };
}
