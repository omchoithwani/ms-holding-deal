/**
 * MS Holdings – Weekly Tasks sheet
 *
 * Every Friday ~4:30pm ET this adds a tab named "Week of <next Monday>" listing
 * Edward Sarkisyan's open HubSpot tasks:
 *   - Upcoming: due from now through next Sunday
 *   - Overdue:  past due and still open
 * Each row has the task, contact, company, contact owner and the latest 3 notes,
 * with links back to HubSpot. Tasks are read through their contact/company
 * associations (MS Holdings has no deals in HubSpot).
 *
 * Setup (once): HubSpot Tasks menu → "Set HubSpot token", then "Install weekly schedule".
 */

var CONFIG = {
  OWNER_IDS: ['160966942'],          // Edward Sarkisyan
  PORTAL_ID: '244458981',            // MS Holdings
  UI_DOMAIN: 'app-na2.hubspot.com',  // MS Holdings is on HubSpot's na2 data center
  NOTES_LIMIT: 3,
  INCLUDE_OVERDUE: true,
  TIME_ZONE: 'America/New_York',
  NOTE_MAX_CHARS: 1500,
};

var HEADERS = ['Status', 'Due', 'Days Overdue', 'Task', 'Priority', 'Type', 'Contact', 'Job Title',
  'Email', 'Phone', 'Company', 'Contact Owner', 'Latest Note', 'Note 2', 'Note 3'];
var COL_WIDTHS = [80, 150, 70, 260, 70, 60, 150, 170, 200, 120, 170, 130, 340, 300, 300];
var HEADER_ROW = 4;

/* ------------------------------------------------------------------ menu */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('HubSpot Tasks')
    .addItem('Update now', 'updateWeeklyTasks')
    .addSeparator()
    .addItem('Set HubSpot token', 'setHubSpotToken')
    .addItem('Install weekly schedule (Fri 4:30pm ET)', 'installWeeklyTrigger')
    .addToUi();
}

function setHubSpotToken() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('HubSpot private app token',
    'Paste the MS Holdings private app token (needs contacts, companies and owners read scopes).',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var token = res.getResponseText().trim();
  if (!token) return;
  PropertiesService.getScriptProperties().setProperty('HUBSPOT_ACCESS_TOKEN', token);
  ui.alert('Token saved. Use "Update now" to test it.');
}

function installWeeklyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'updateWeeklyTasks') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('updateWeeklyTasks')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(16)
    .nearMinute(30)
    .inTimezone(CONFIG.TIME_ZONE)
    .create();
  SpreadsheetApp.getUi().alert('Scheduled: every Friday around 4:30pm Eastern.');
}

/* ------------------------------------------------------------- main job */

function updateWeeklyTasks(arg) {
  // Time-driven triggers pass an event object; tests pass a Date.
  var now = arg instanceof Date ? arg : new Date();
  var win = digestWindow_(now);

  var upcoming = searchOpenTasks_([
    { propertyName: 'hs_timestamp', operator: 'GTE', value: String(win.start.getTime()) },
    { propertyName: 'hs_timestamp', operator: 'LTE', value: String(win.end.getTime()) },
  ]);
  var overdue = CONFIG.INCLUDE_OVERDUE
    ? searchOpenTasks_([{ propertyName: 'hs_timestamp', operator: 'LT', value: String(win.start.getTime()) }]).reverse()
    : [];

  var records = enrich_(upcoming, 'Upcoming', now).concat(enrich_(overdue, 'Overdue', now));
  writeWeekTab_(win, records, upcoming.length, overdue.length, now);
  console.log('Wrote ' + upcoming.length + ' upcoming and ' + overdue.length + ' overdue task(s).');
}

/* -------------------------------------------------------------- dates */

/** Next Mon–Sun (Eastern). The window starts "now" so this weekend's tasks aren't skipped. */
function digestWindow_(now) {
  var parts = Utilities.formatDate(now, CONFIG.TIME_ZONE, 'yyyy-MM-dd').split('-').map(Number);
  var y = parts[0], m = parts[1], d = parts[2];
  var dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat
  var daysToMonday = dow === 1 ? 0 : (8 - dow) % 7;
  var monday = new Date(Date.UTC(y, m - 1, d + daysToMonday));
  // Date-only due dates are stored at UTC midnight, so the end boundary is UTC end-of-Sunday.
  var end = new Date(Date.UTC(y, m - 1, d + daysToMonday + 6, 23, 59, 59, 999));
  return {
    start: now,
    end: end,
    label: Utilities.formatDate(monday, 'UTC', 'MMM d, yyyy'),
  };
}

function isMidnightUtc_(d) {
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
}

/** A sheet-friendly Date: date-only tasks become that calendar day (not 7pm the day before). */
function dueCellDate_(raw) {
  var d = new Date(raw);
  if (!isMidnightUtc_(d)) return { value: d, format: 'ddd, mmm d yyyy h:mm am/pm' };
  var local = Utilities.parseDate(Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'), CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  return { value: local, format: 'ddd, mmm d yyyy' };
}

/* ------------------------------------------------------------ HubSpot */

function hubspot_(method, path, body) {
  var token = PropertiesService.getScriptProperties().getProperty('HUBSPOT_ACCESS_TOKEN');
  if (!token) throw new Error('No HubSpot token. Use the "HubSpot Tasks → Set HubSpot token" menu first.');
  var opts = {
    method: method,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  };
  if (body) opts.payload = JSON.stringify(body);

  for (var attempt = 0; ; attempt++) {
    var res = UrlFetchApp.fetch('https://api.hubapi.com' + path, opts);
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return code === 204 ? null : JSON.parse(res.getContentText());
    var transient = [429, 500, 502, 503, 504].indexOf(code) !== -1;
    if (!transient || attempt >= 5) {
      throw new Error('HubSpot ' + method + ' ' + path + ' → ' + code + ': ' + res.getContentText());
    }
    Utilities.sleep(1000 * Math.pow(2, attempt));
  }
}

function chunk_(arr, n) {
  var out = [];
  for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function unique_(arr) {
  var seen = {};
  return arr.map(String).filter(function (x) { return seen[x] ? false : (seen[x] = true); });
}

function searchOpenTasks_(timestampFilters) {
  var tasks = [];
  var after;
  do {
    var body = {
      filterGroups: [{
        filters: [
          { propertyName: 'hs_task_status', operator: 'NOT_IN', values: ['COMPLETED', 'DEFERRED'] },
          { propertyName: 'hubspot_owner_id', operator: 'IN', values: CONFIG.OWNER_IDS },
        ].concat(timestampFilters),
      }],
      properties: ['hs_task_subject', 'hs_task_status', 'hs_timestamp', 'hs_task_priority', 'hs_task_type', 'hubspot_owner_id'],
      sorts: [{ propertyName: 'hs_timestamp', direction: 'ASCENDING' }],
      limit: 100,
    };
    if (after) body.after = after;
    var data = hubspot_('post', '/crm/v3/objects/tasks/search', body);
    tasks = tasks.concat(data.results || []);
    after = data.paging && data.paging.next && data.paging.next.after;
  } while (after);
  return tasks;
}

/** { fromId: [toId, ...] } via the v4 batch associations API. */
function batchAssociations_(fromType, toType, ids) {
  var map = {};
  chunk_(unique_(ids), 1000).forEach(function (part) {
    var data = hubspot_('post', '/crm/v4/associations/' + fromType + '/' + toType + '/batch/read',
      { inputs: part.map(function (id) { return { id: id }; }) });
    (data.results || []).forEach(function (r) {
      map[String(r.from.id)] = (r.to || []).map(function (t) { return String(t.toObjectId); });
    });
  });
  return map;
}

/** { id: properties } via batch read. */
function batchRead_(objectType, ids, properties) {
  var map = {};
  chunk_(unique_(ids), 100).forEach(function (part) {
    var data = hubspot_('post', '/crm/v3/objects/' + objectType + '/batch/read', {
      inputs: part.map(function (id) { return { id: id }; }),
      properties: properties,
    });
    (data.results || []).forEach(function (r) { map[String(r.id)] = r.properties; });
  });
  return map;
}

function associatedIds_(fromType, fromId, toType) {
  var ids = [];
  var after;
  do {
    var data = hubspot_('get', '/crm/v4/objects/' + fromType + '/' + fromId + '/associations/' + toType +
      '?limit=500' + (after ? '&after=' + encodeURIComponent(after) : ''));
    (data.results || []).forEach(function (r) { ids.push(String(r.toObjectId)); });
    after = data.paging && data.paging.next && data.paging.next.after;
  } while (after);
  return ids;
}

var ownerCache_ = {};
function ownerName_(ownerId) {
  if (!ownerId) return '';
  if (ownerId in ownerCache_) return ownerCache_[ownerId];
  var name = '';
  try {
    var o = hubspot_('get', '/crm/v3/owners/' + ownerId);
    name = [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email || '';
  } catch (e) {
    // deactivated owner — leave blank
  }
  ownerCache_[ownerId] = name;
  return name;
}

/** Latest notes across the task's contact + company, de-duplicated, newest first. */
function latestNotes_(sources) {
  var ids = [];
  sources.forEach(function (s) {
    try {
      ids = ids.concat(associatedIds_(s.type, s.id, 'notes'));
    } catch (e) {
      console.warn('Could not load notes for ' + s.type + ' ' + s.id + ': ' + e.message);
    }
  });
  ids = unique_(ids);
  if (!ids.length) return [];
  var notes = batchRead_('notes', ids, ['hs_note_body', 'hs_createdate', 'hs_timestamp', 'hubspot_owner_id']);
  return Object.keys(notes)
    .map(function (k) { return notes[k]; })
    // hs_createdate = when it was written (hs_timestamp can be back-dated)
    .sort(function (a, b) { return new Date(b.hs_createdate) - new Date(a.hs_createdate); })
    .slice(0, CONFIG.NOTES_LIMIT)
    .map(function (n) {
      var when = n.hs_createdate || n.hs_timestamp;
      var header = (when ? Utilities.formatDate(new Date(when), CONFIG.TIME_ZONE, 'MMM d, yyyy') : '') +
        (n.hubspot_owner_id ? ' — ' + ownerName_(n.hubspot_owner_id) : '');
      return header + '\n' + noteText_(n.hs_note_body);
    });
}

function noteText_(html) {
  var text = String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  return text.length > CONFIG.NOTE_MAX_CHARS ? text.slice(0, CONFIG.NOTE_MAX_CHARS) + '…' : text;
}

function link_(kind, id) {
  var base = 'https://' + CONFIG.UI_DOMAIN;
  if (kind === 'task') return base + '/tasks/' + CONFIG.PORTAL_ID + '/view/all/task/' + id;
  return base + '/contacts/' + CONFIG.PORTAL_ID + '/record/' + (kind === 'contact' ? '0-1' : '0-2') + '/' + id;
}

function priorityLabel_(p) {
  var labels = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low', NONE: '' };
  return p ? (labels.hasOwnProperty(p) ? labels[p] : p) : '';
}

function fullName_(c) {
  return [c.firstname, c.lastname].map(function (s) { return (s || '').trim(); }).filter(Boolean).join(' ') || c.email || '(unnamed)';
}

function enrich_(tasks, status, now) {
  if (!tasks.length) return [];
  var ids = tasks.map(function (t) { return t.id; });
  var taskContacts = batchAssociations_('tasks', 'contacts', ids);
  var taskCompanies = batchAssociations_('tasks', 'companies', ids);

  var contactIds = ids.map(function (id) { return (taskContacts[id] || [])[0]; }).filter(Boolean);
  var contacts = batchRead_('contacts', contactIds,
    ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'jobtitle', 'hubspot_owner_id', 'associatedcompanyid']);

  // Task's own company first, otherwise the contact's primary company
  var companyFor = {};
  ids.forEach(function (id) {
    var cid = (taskContacts[id] || [])[0];
    companyFor[id] = (taskCompanies[id] || [])[0] || (cid && contacts[cid] && contacts[cid].associatedcompanyid) || null;
  });
  var companies = batchRead_('companies', ids.map(function (id) { return companyFor[id]; }).filter(Boolean), ['name', 'domain']);

  return tasks.map(function (t) {
    var p = t.properties;
    var contactId = (taskContacts[t.id] || [])[0] || null;
    var companyId = companyFor[t.id] ? String(companyFor[t.id]) : null;
    var c = contactId ? contacts[contactId] : null;
    var co = companyId ? companies[companyId] : null;
    var due = p.hs_timestamp ? new Date(p.hs_timestamp) : null;
    var sources = [];
    if (contactId) sources.push({ type: 'contacts', id: contactId });
    if (companyId) sources.push({ type: 'companies', id: companyId });

    return {
      status: status,
      due: due,
      daysOverdue: status === 'Overdue' && due ? Math.max(0, Math.floor((now - due) / 86400000)) : '',
      task: { text: (p.hs_task_subject || '(no subject)').trim(), url: link_('task', t.id) },
      priority: priorityLabel_(p.hs_task_priority),
      type: p.hs_task_type ? p.hs_task_type.charAt(0) + p.hs_task_type.slice(1).toLowerCase() : '',
      contact: c ? { text: fullName_(c), url: link_('contact', contactId) } : null,
      jobTitle: c ? (c.jobtitle || '') : '',
      email: c ? (c.email || '') : '',
      phone: c ? ((c.phone || '').trim() || (c.mobilephone || '').trim()) : '',
      company: co ? { text: co.name || co.domain || '(unnamed)', url: link_('company', companyId) } : null,
      contactOwner: c ? ownerName_(c.hubspot_owner_id) : '',
      notes: latestNotes_(sources),
    };
  });
}

/* -------------------------------------------------------------- sheet */

function writeWeekTab_(win, records, nUpcoming, nOverdue, now) {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(CONFIG.TIME_ZONE);
  var name = 'Week of ' + win.label;

  // Re-running in the same week replaces that week's tab.
  var existing = ss.getSheetByName(name);
  if (existing) ss.deleteSheet(existing);
  var sheet = ss.insertSheet(name, 0);

  // Remove the blank starter tab once there's real data.
  var starter = ss.getSheetByName('Sheet1');
  if (starter && starter.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(starter);

  var owners = CONFIG.OWNER_IDS.map(ownerName_).filter(Boolean).join(', ') || CONFIG.OWNER_IDS.join(', ');
  sheet.getRange(1, 1).setValue('Weekly Tasks — ' + owners + ' — Week of ' + win.label)
    .setFontSize(14).setFontWeight('bold');
  sheet.getRange(2, 1).setValue('Updated ' + Utilities.formatDate(now, CONFIG.TIME_ZONE, 'EEE MMM d, yyyy h:mm a z') +
    '  ·  ' + nUpcoming + ' upcoming  ·  ' + nOverdue + ' overdue')
    .setFontColor('#666666');

  var nCols = HEADERS.length;
  sheet.getRange(HEADER_ROW, 1, 1, nCols).setValues([HEADERS])
    .setFontWeight('bold').setBackground('#1f3b57').setFontColor('#ffffff').setVerticalAlignment('middle');

  if (!records.length) {
    sheet.getRange(HEADER_ROW + 1, 1).setValue('No open tasks due this week and nothing overdue.');
  } else {
    var values = [];
    var formats = [];
    var rich = [];
    records.forEach(function (r) {
      var due = r.due ? dueCellDate_(r.due.toISOString()) : { value: '', format: '@' };
      values.push([r.status, due.value, r.daysOverdue, '', r.priority, r.type, '', r.jobTitle,
        r.email, r.phone, '', r.contactOwner, r.notes[0] || '', r.notes[1] || '', r.notes[2] || ''].map(safeCell_));
      var f = HEADERS.map(function () { return '@'; });
      f[1] = due.format;
      f[2] = '0';
      formats.push(f);
      rich.push([richLink_(r.task), richLink_(r.contact), richLink_(r.company)]);
    });

    var n = records.length;
    var body = sheet.getRange(HEADER_ROW + 1, 1, n, nCols);
    body.setNumberFormats(formats).setValues(values)
      .setVerticalAlignment('top').setWrap(true);
    // Linked columns: Task (4), Contact (7), Company (11)
    [[4, 0], [7, 1], [11, 2]].forEach(function (pair) {
      sheet.getRange(HEADER_ROW + 1, pair[0], n, 1).setRichTextValues(rich.map(function (row) { return [row[pair[1]]]; }));
    });

    // Shade overdue rows
    records.forEach(function (r, i) {
      if (r.status === 'Overdue') sheet.getRange(HEADER_ROW + 1 + i, 1, 1, nCols).setBackground('#fdecea');
    });
    sheet.getRange(HEADER_ROW + 1, 1, n, 1).setFontWeight('bold');
    sheet.getRange(HEADER_ROW, 1, n + 1, nCols).createFilter();
  }

  sheet.setFrozenRows(HEADER_ROW);
  COL_WIDTHS.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.activate();
}

/** Stop text like "+1786…" or "=…" being read as a formula. */
function safeCell_(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function richLink_(item) {
  var b = SpreadsheetApp.newRichTextValue().setText(item ? item.text : '');
  if (item && item.url) b = b.setLinkUrl(item.url);
  return b.build();
}
