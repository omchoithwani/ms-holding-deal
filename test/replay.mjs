// Replays real MS Holdings API responses (captured Nov 24 2026) through src/index.js
// with fetch stubbed, in DRY_RUN mode. Run: node test/replay.mjs
process.env.HUBSPOT_ACCESS_TOKEN = 'test-token';
process.env.DRY_RUN = 'true';
process.env.DATE_FROM = '2026-11-01';
process.env.DATE_TO = '2026-11-22';

const T = (id, subject, ts, priority, type, body) => ({ id, properties: { hs_task_subject: subject, hs_timestamp: ts, hs_task_priority: priority, hs_task_type: type, hs_task_status: 'NOT_STARTED', hs_task_body: body, hubspot_owner_id: '160966942' } });
const upcoming = [
  T('414739099375', 'Discuss financing and strategic partnership with Brad Williamson', '2026-11-06T13:00:00Z', 'NONE', 'TODO'),
  T('417048658655', 'Follow up with Leo Chen on Phalen Shores', '2026-11-20T13:00:00Z', 'NONE', 'TODO'),
];
const overdue = [
  T('359376089849', 'Lisa to call (MARKETS GROUP) ', '2026-05-15T00:00:00Z', 'HIGH', 'CALL'),
  T('361981234877', 'Ed : LISA TO CALL IF WE ALREADY EMAILED - 3/30/2026', '2026-05-12T00:00:00Z', 'HIGH', 'CALL'),
  T('364467313396', 'STALK & CATCH', '2026-04-17T12:00:00Z', 'NONE', 'TODO'),
  T('362424586946', 'Follow up with Balefire Wealth', '2026-04-08T12:00:00Z', 'NONE', 'TODO'),
  T('362400058095', 'Follow up with Dustin Suttle', '2026-04-08T12:00:00Z', 'NONE', 'TODO'),
  T('361360307901', 'Follow up with Athena Papadas', '2026-04-02T00:00:00Z', 'NONE', 'TODO'),
].reverse(); // API sorts ascending

const taskContacts = { '362400058095': '380639792876', '364467313396': '425802427085', '359376089849': '425995456190', '417048658655': '562821656261', '361360307901': '462465155801', '361981234877': '416360105710', '414739099375': '581390489285' };
const taskCompanies = { '364467313396': '292763567836', '359376089849': '292440020724', '362424586946': '292763567836', '361360307901': '315749744363', '361981234877': '282923898617', '414739099375': '297742331583' };
const C = (firstname, lastname, email, phone, mobilephone, jobtitle, owner, co) => ({ firstname, lastname, email, phone, mobilephone, jobtitle, hubspot_owner_id: owner, associatedcompanyid: co });
const contacts = {
  '562821656261': C('Leo', 'Chen', 'lchen1999@gmail.com', null, null, 'President and Orthopaedic Surgeon', '160966942', null),
  '425802427085': C('Emory', 'Smith', 'esmith@balefirewealth.com', ' 602-370-8743', ' 602-370-8743', 'Executive Director', '160966881', '292763567836'),
  '462465155801': C('Athena', 'Papadas', 'info@agosinc.com', null, '+17788689665', 'CEO', '160966942', '315749744363'),
  '581390489285': C('Brad ', 'Williamson', 'brad.williamson@berkadia.com', '+17866462580', null, 'Managing Director – Mortgage Banking', '160966942', '297742331583'),
  '380639792876': C('Dustin', 'Suttle', 'dustin.suttle@suttlecrossland.com', '', '623-563-1642', 'Co-Founder', '160966881', '256244050664'),
  '416360105710': C('Philipp', 'Westermann', 'philipp.westermann@proprium.com', null, null, 'Co-Managing Partner', '160966942', '282923898617'),
  '425995456190': C('Najla', 'Arekat', 'najla.arekat@wellsfargo.com', '480-348-4937', null, 'Investment Officer', '160966881', '292440020724'),
};
const companies = { '315749744363': 'Agos Inc.', '256244050664': 'Suttle Crossland', '292440020724': 'Wells Fargo', '297742331583': 'Berkadia', '282923898617': 'Proprium Capital Partners', '292763567836': 'Balefire Wealth' };
const objNotes = { 'contacts/562821656261': ['404216701686'], 'contacts/581390489285': ['414737236674'], 'companies/297742331583': ['414737236674'] };
const span = (t) => `<span style="color: black;"><span style="font-size: 12pt;">${t}</span></span>`;
const notes = {
  '404216701686': { hs_createdate: '2026-10-02T17:52:16.770Z', hubspot_owner_id: '161284409', hs_note_body: `<div><p style="margin:0;"><strong>${span('Campaign source:')}</strong>${span(' Medical professionals')}</p><p style="margin:0;">${span('<br>')}</p><p style="margin:0;">${span('Leo Chen    ')}</p><p style="margin:0;">${span('President and Orthopaedic Surgeon - Emerald Coast Sports Medicine and Orthopaedics')}</p><p style="margin:0;"><a href="http://www.linkedin.com/in/leo-chen-818537142">${span('http://www.linkedin.com/in/leo-chen-818537142')}</a></p><p style="margin:0;">${span('LinkedIn reply 10/2/26:')}</p><blockquote><p style="margin:0;"><em>${span("Sorry I sometimes get in phases where I don't check my LinkedIn account often.")}</em></p><p style="margin:0;"><em>${span('Happy to connect and see if our interest align. &nbsp;My email is lchen1999@gmail.com')}</em></p><p><br class="hs-trailingbreak"></p></blockquote></div>` },
  '414737236674': { hs_createdate: '2026-11-03T13:55:17.380Z', hubspot_owner_id: '168594832', hs_note_body: '<div style="" dir="auto" data-top-level="true"><p style="margin:0;">Ed\'s note: 10/27/2026 Florida debt contact; approximately 4,000 units owned; interested in strategic partnership; possible “Bridge Florida” introduction. Ownership details and the intended Bridge organization remain unverified.</p><p style="margin:0;"><br class="hs-trailingbreak"></p></div>' },
};
const owners = { '160966942': ['Edward', 'Sarkisyan'], '160966881': ['Sharif', 'Mitchell'], '161284409': ['Mira', 'Antonio'], '168594832': ['Dianne Marie', 'Araneta'] };

const calls = [];
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, opts = {}) => {
  const path = new URL(url).pathname;
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push(`${opts.method} ${path}`);
  if (opts.headers?.Authorization !== 'Bearer test-token') throw new Error('missing auth header');

  if (path === '/crm/v3/objects/tasks/search') {
    const f = body.filterGroups[0].filters;
    if (!f.some((x) => x.propertyName === 'hubspot_owner_id' && x.values.includes('160966942'))) throw new Error('owner filter missing');
    const isOverdue = f.some((x) => x.operator === 'LT');
    return json({ total: 0, results: isOverdue ? overdue : upcoming });
  }
  let m;
  if ((m = path.match(/^\/crm\/v4\/associations\/tasks\/(contacts|companies)\/batch\/read$/))) {
    const map = m[1] === 'contacts' ? taskContacts : taskCompanies;
    const results = body.inputs.filter((i) => map[i.id]).map((i) => ({ from: { id: i.id }, to: [{ toObjectId: Number(map[i.id]) }] }));
    return json({ status: 'COMPLETE', results, numErrors: body.inputs.length - results.length }, results.length < body.inputs.length ? 207 : 200);
  }
  if (path === '/crm/v3/objects/contacts/batch/read') return json({ results: body.inputs.filter((i) => contacts[i.id]).map((i) => ({ id: i.id, properties: contacts[i.id] })) });
  if (path === '/crm/v3/objects/companies/batch/read') return json({ results: body.inputs.filter((i) => companies[i.id]).map((i) => ({ id: i.id, properties: { name: companies[i.id], city: null, state: null } })) });
  if (path === '/crm/v3/objects/notes/batch/read') return json({ results: body.inputs.map((i) => ({ id: i.id, properties: notes[i.id] })) });
  if ((m = path.match(/^\/crm\/v4\/objects\/(contacts|companies)\/(\d+)\/associations\/notes$/))) {
    return json({ results: (objNotes[`${m[1]}/${m[2]}`] ?? []).map((id) => ({ toObjectId: Number(id) })) });
  }
  if ((m = path.match(/^\/crm\/v3\/owners\/(\d+)$/))) {
    const o = owners[m[1]];
    return o ? json({ firstName: o[0], lastName: o[1] }) : json({ message: 'not found' }, 404);
  }
  return json({ message: `unhandled ${path}` }, 404);
};

process.on('exit', (code) => console.log(`\n[replay] ${calls.length} API calls, exit ${code}`));
await import('../src/index.js');
