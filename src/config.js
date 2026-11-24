import 'dotenv/config';

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  token: process.env.HUBSPOT_ACCESS_TOKEN,
  // Edward Sarkisyan in the MS Holdings portal
  ownerIds: list(process.env.HUBSPOT_OWNER_IDS || '160966942'),
  portalId: process.env.HUBSPOT_PORTAL_ID || '244458981',
  // MS Holdings is hosted in HubSpot's na2 data center, so record links use app-na2
  uiDomain: process.env.HUBSPOT_UI_DOMAIN || 'app-na2.hubspot.com',
  notesLimit: Number(process.env.NOTES_LIMIT || 3),
  includeOverdue: (process.env.INCLUDE_OVERDUE || 'true').toLowerCase() !== 'false',
  dateFrom: process.env.DATE_FROM || '',
  dateTo: process.env.DATE_TO || '',
  // Weekly tasks Google Sheet (updated by apps-script/Code.gs). Set SHEET_URL='' to hide the link.
  sheetUrl: process.env.SHEET_URL ?? 'https://docs.google.com/spreadsheets/d/11TKUgbnEPjfCMBWsi3JP_1wm6eNa25X4xGM5mV7v-7M/edit',
  dryRun: (process.env.DRY_RUN || '').toLowerCase() === 'true',
  timeZone: 'America/New_York',
};

export const links = {
  task: (id) => `https://${config.uiDomain}/tasks/${config.portalId}/view/all/task/${id}`,
  contact: (id) => `https://${config.uiDomain}/contacts/${config.portalId}/record/0-1/${id}`,
  company: (id) => `https://${config.uiDomain}/contacts/${config.portalId}/record/0-2/${id}`,
};
