import { writeFileSync } from 'node:fs';
import { config, links } from './config.js';
import { getDigestWindow } from './dates.js';
import {
  getTasksDueBetween,
  getOverdueTasks,
  batchAssociations,
  batchRead,
  getOwnerName,
  getLatestNotes,
  sleep,
} from './hubspot.js';
import { buildHtml, buildText } from './template.js';
import { sendDigest } from './email.js';

const fullName = (p) => [p?.firstname, p?.lastname].map((s) => s?.trim()).filter(Boolean).join(' ') || p?.email || null;

/**
 * Attach contact, company, contact owner and (optionally) latest notes to each task.
 * MS Holdings attaches tasks to contacts/companies (the portal has no deals).
 */
async function enrichTasks(tasks, { withNotes }) {
  if (tasks.length === 0) return [];
  const taskIds = tasks.map((t) => t.id);

  const [taskContacts, taskCompanies] = await Promise.all([
    batchAssociations('tasks', 'contacts', taskIds),
    batchAssociations('tasks', 'companies', taskIds),
  ]);

  const contactIds = [...taskContacts.values()].map((ids) => ids[0]).filter(Boolean);
  const contacts = await batchRead('contacts', contactIds, [
    'firstname', 'lastname', 'email', 'phone', 'mobilephone', 'jobtitle', 'hubspot_owner_id', 'associatedcompanyid',
  ]);

  // Task's own company first; otherwise fall back to the contact's primary company.
  const companyFor = (taskId) => {
    const direct = taskCompanies.get(String(taskId))?.[0];
    if (direct) return direct;
    const cid = taskContacts.get(String(taskId))?.[0];
    return contacts.get(cid)?.associatedcompanyid || null;
  };
  const companies = await batchRead('companies', taskIds.map(companyFor).filter(Boolean), ['name', 'domain', 'city', 'state']);

  const records = [];
  for (const t of tasks) {
    const contactId = taskContacts.get(String(t.id))?.[0] ?? null;
    const companyId = companyFor(t.id);
    const c = contactId ? contacts.get(contactId) : null;
    const co = companyId ? companies.get(String(companyId)) : null;

    const record = {
      task: {
        id: t.id,
        subject: t.properties.hs_task_subject,
        dueDate: t.properties.hs_timestamp,
        priority: t.properties.hs_task_priority,
        type: t.properties.hs_task_type,
        status: t.properties.hs_task_status,
        url: links.task(t.id),
      },
      contact: c ? {
        name: fullName(c),
        jobTitle: c.jobtitle || null,
        email: c.email || null,
        phone: c.phone?.trim() || c.mobilephone?.trim() || null,
        owner: await getOwnerName(c.hubspot_owner_id),
        url: links.contact(contactId),
      } : null,
      company: co ? {
        name: co.name || co.domain || null,
        location: [co.city, co.state].filter(Boolean).join(', ') || null,
        url: links.company(companyId),
      } : null,
      notes: [],
    };

    if (withNotes) {
      const sources = [
        contactId && { type: 'contacts', id: contactId },
        companyId && { type: 'companies', id: companyId },
      ].filter(Boolean);
      record.notes = await getLatestNotes(sources, config.notesLimit);
      await sleep(200); // stay well under HubSpot's 100 requests / 10s
    }

    console.log(`  ${record.task.subject} | ${record.contact?.name ?? '—'} | ${record.company?.name ?? '—'} | ${record.notes.length} note(s)`);
    records.push(record);
  }
  return records;
}

async function main() {
  if (!config.token) throw new Error('Missing env var: HUBSPOT_ACCESS_TOKEN');

  const win = getDigestWindow();
  console.log(`Owner(s): ${config.ownerIds.join(', ')} | Window: ${win.start.toISOString()} → ${win.end.toISOString()}`);

  const upcomingTasks = await getTasksDueBetween(win.start, win.end);
  console.log(`Upcoming: ${upcomingTasks.length} task(s)`);
  const upcoming = await enrichTasks(upcomingTasks, { withNotes: true });

  let overdue = [];
  if (config.includeOverdue) {
    const overdueTasks = await getOverdueTasks(win.overdueBefore);
    console.log(`Overdue: ${overdueTasks.length} task(s)`);
    // Most recently due first
    overdue = (await enrichTasks(overdueTasks, { withNotes: false })).reverse();
  }

  if (upcoming.length === 0 && overdue.length === 0) {
    console.log('No upcoming or overdue tasks. Skipping email.');
    return;
  }

  const ownerNames = (await Promise.all(config.ownerIds.map(getOwnerName))).filter(Boolean);
  const ctx = { label: win.label, ownerNames, asOf: new Date() };
  const subject = `Weekly Task Digest – Week of ${win.label}`;
  const html = buildHtml(upcoming, overdue, ctx);
  const text = buildText(upcoming, overdue, ctx);

  if (config.dryRun) {
    writeFileSync('digest-preview.html', html);
    console.log(`DRY_RUN: wrote digest-preview.html (${upcoming.length} upcoming, ${overdue.length} overdue). Email not sent.`);
    console.log(text);
    return;
  }

  await sendDigest(subject, html, text);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
