const TZ = 'America/New_York';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HubSpot note bodies are HTML — reduce to readable plain text. */
export function noteText(html, max = 600) {
  const text = String(html ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

// Date-only due dates are stored at UTC midnight; timed ones (e.g. 13:00Z) are real times.
function isMidnightUtc(d) {
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
}

export function formatDue(raw) {
  if (!raw) return 'N/A';
  const d = new Date(raw);
  if (isNaN(d)) return raw;
  if (isMidnightUtc(d)) {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ, timeZoneName: 'short' });
}

/** Short due date; date-only tasks (UTC midnight) are shown as that calendar day. */
export function formatDueShort(raw) {
  if (!raw) return 'N/A';
  const d = new Date(raw);
  if (isNaN(d)) return raw;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: isMidnightUtc(d) ? 'UTC' : TZ });
}

export function formatDate(raw) {
  if (!raw) return 'N/A';
  const d = new Date(raw);
  if (isNaN(d)) return raw;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ });
}

function daysOverdue(raw, asOf) {
  const days = Math.floor((asOf - new Date(raw)) / 86400000);
  return days <= 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`;
}

const PRIORITY = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', NONE: null };
const priorityLabel = (p) => (!p ? null : p in PRIORITY ? PRIORITY[p] : p);

/* ------------------------------ plain text ------------------------------ */

export function buildText(upcoming, overdue, { label, ownerNames, asOf }) {
  const L = [`Weekly Task Digest — Week of ${label}`];
  if (ownerNames.length) L.push(`Tasks for: ${ownerNames.join(', ')}`);
  L.push('', `UPCOMING (${upcoming.length})`, '='.repeat(40));
  if (upcoming.length === 0) L.push('No open tasks due this period.');

  upcoming.forEach(({ task, contact, company, notes }, i) => {
    L.push('', `${i + 1}. ${task.subject ?? '(no subject)'}`, '─'.repeat(40));
    L.push(`Due:            ${formatDue(task.dueDate)}`);
    if (priorityLabel(task.priority)) L.push(`Priority:       ${priorityLabel(task.priority)}`);
    L.push(`Task link:      ${task.url}`);
    L.push(`Contact:        ${contact?.name ?? 'N/A'}${contact?.jobTitle ? ` (${contact.jobTitle})` : ''}`);
    if (contact?.email) L.push(`Email:          ${contact.email}`);
    if (contact?.phone) L.push(`Phone:          ${contact.phone}`);
    L.push(`Company:        ${company?.name ?? 'N/A'}${company?.location ? ` — ${company.location}` : ''}`);
    L.push(`Contact Owner:  ${contact?.owner ?? 'N/A'}`);
    L.push(`Latest Notes:`);
    if (notes.length === 0) L.push('  No notes found');
    notes.forEach((n) => L.push(`  • ${formatDate(n.date)}${n.addedBy ? `, ${n.addedBy}` : ''}: ${noteText(n.body).replace(/\n/g, ' ')}`));
  });

  if (overdue.length) {
    L.push('', `OVERDUE (${overdue.length})`, '='.repeat(40));
    overdue.forEach(({ task, contact, company }) => {
      L.push(`• ${task.subject ?? '(no subject)'} — due ${formatDue(task.dueDate)} (${daysOverdue(task.dueDate, asOf)} overdue)`);
      L.push(`  ${[contact?.name, company?.name].filter(Boolean).join(' · ') || 'No contact/company'} — ${task.url}`);
    });
  }
  return L.join('\n');
}

/* --------------------------------- HTML --------------------------------- */

const link = (url, text, color = '#0b5cad') => (url
  ? `<a href="${esc(url)}" style="color:${color};text-decoration:none;">${esc(text)}</a>`
  : esc(text));

const row = (label, value, shaded) => `
          <tr${shaded ? ' style="background:#fafafa;"' : ''}>
            <td style="padding:6px 10px 6px 8px;font-weight:600;vertical-align:top;width:96px;">${label}</td>
            <td style="padding:6px 8px 6px 0;word-break:break-word;overflow-wrap:anywhere;">${value}</td>
          </tr>`;

function taskCard({ task, contact, company, notes }, i) {
  const rows = [];
  rows.push(['Due', esc(formatDue(task.dueDate))]);
  if (priorityLabel(task.priority)) rows.push(['Priority', esc(priorityLabel(task.priority))]);
  rows.push(['Contact', contact
    ? `${link(contact.url, contact.name ?? '(unnamed)')}${contact.jobTitle ? ` <span style="color:#777;">· ${esc(contact.jobTitle)}</span>` : ''}`
    : 'N/A']);
  if (contact?.email || contact?.phone) {
    rows.push(['Reach', [
      contact.email && `<a href="mailto:${esc(contact.email)}" style="color:#0b5cad;text-decoration:none;">${esc(contact.email)}</a>`,
      contact.phone && esc(contact.phone),
    ].filter(Boolean).join(' &nbsp;·&nbsp; ')]);
  }
  rows.push(['Company', company
    ? `${link(company.url, company.name ?? '(unnamed)')}${company.location ? ` <span style="color:#777;">· ${esc(company.location)}</span>` : ''}`
    : 'N/A']);
  rows.push(['Contact Owner', esc(contact?.owner ?? 'N/A')]);

  const notesHtml = notes.length === 0
    ? '<span style="color:#888;font-style:italic;">No notes found</span>'
    : notes.map((n) => `
              <div style="margin:0 0 10px;padding:8px 10px;border-left:3px solid #d0d7de;background:#f8f9fa;">
                <div style="font-size:12px;color:#777;margin-bottom:3px;">${esc(formatDate(n.date))}${n.addedBy ? ` &mdash; ${esc(n.addedBy)}` : ''}</div>
                <div style="white-space:pre-line;">${esc(noteText(n.body))}</div>
              </div>`).join('');
  rows.push([`Latest Notes`, notesHtml]);

  return `
      <div style="margin-bottom:24px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
        <div style="background:#f1f4f8;padding:10px 14px;font-weight:600;font-size:15px;color:#222;">${i + 1}. ${link(task.url, task.subject ?? '(no subject)')}</div>
        <table role="presentation" style="border-collapse:collapse;width:100%;table-layout:fixed;font-size:14px;color:#333;">
          ${rows.map(([l, v], j) => row(l, v, j % 2 === 1)).join('')}
        </table>
      </div>`;
}

function overdueTable(overdue, asOf) {
  const th = 'text-align:left;padding:8px 6px;border-bottom:2px solid #e0e0e0;font-size:12px;color:#555;text-transform:uppercase;letter-spacing:.03em;';
  const td = 'padding:8px 6px;border-bottom:1px solid #eee;vertical-align:top;overflow-wrap:break-word;';
  const body = overdue.map(({ task, contact, company }) => `
          <tr>
            <td style="${td}">${link(task.url, task.subject ?? '(no subject)')}</td>
            <td style="${td}">${esc(formatDueShort(task.dueDate))}<br><span style="color:#b42318;font-size:12px;">${esc(daysOverdue(task.dueDate, asOf))}</span></td>
            <td style="${td}">${[
              contact && link(contact.url, contact.name ?? '(unnamed)'),
              company && `<span style="font-size:12px;">${link(company.url, company.name ?? '(unnamed)', '#5f6b7a')}</span>`,
            ].filter(Boolean).join('<br>') || '—'}</td>
          </tr>`).join('');
  return `
      <table role="presentation" style="border-collapse:collapse;width:100%;table-layout:fixed;font-size:13px;color:#333;">
        <tr><th style="${th}width:44%;">Task</th><th style="${th}width:22%;">Due</th><th style="${th}">Contact / Company</th></tr>
        ${body}
      </table>`;
}

export function buildHtml(upcoming, overdue, { label, ownerNames, asOf }) {
  const h2 = 'font-size:16px;color:#111;margin:28px 0 12px;padding-bottom:6px;border-bottom:1px solid #e5e5e5;';
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px 12px;background:#f5f5f5;">
  <div style="max-width:700px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
    <h1 style="font-size:20px;color:#111;margin:0 0 4px;">Weekly Task Digest &mdash; Week of ${esc(label)}</h1>
    <div style="color:#666;font-size:13px;">
      ${ownerNames.length ? `Tasks for ${esc(ownerNames.join(', '))} &middot; ` : ''}${upcoming.length} upcoming${overdue.length ? ` &middot; <span style="color:#b42318;">${overdue.length} overdue</span>` : ''}
    </div>

    <h2 style="${h2}">Upcoming tasks</h2>
    ${upcoming.length ? upcoming.map(taskCard).join('') : '<p style="color:#666;">No open tasks due this period.</p>'}

    ${overdue.length ? `<h2 style="${h2}color:#b42318;">Overdue &amp; still open (${overdue.length})</h2>${overdueTable(overdue, asOf)}` : ''}
  </div>
</body>
</html>`;
}
