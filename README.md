# MS Holdings – Weekly Task Digest (email + Google Sheet)

Weekly email summarizing **Edward Sarkisyan's** open HubSpot tasks in the MS Holdings portal.
It is adapted from the Smartbuild deal-task digest (`deal-tasks-ed-smartbuild`). MS Holdings has
no deals in HubSpot, so its tasks are tied to **contacts and companies**, and this version reads from those.

**When:** every Friday at 4:30pm US Eastern, all year (daylight saving is handled automatically).

**What each email contains:**

| Section | Contents |
|---|---|
| **Upcoming tasks** | Every open task due from send time through the end of next Sunday. One card per task with the task (linked), due date/time, priority, contact (name, title, email, phone), company, contact owner, and the **latest 3 notes** from the contact and company, each with its date and author. |
| **Overdue & still open** | A compact table of every open task already past due: task, due date, days overdue, contact and company. |

Every task, contact and company name links to its HubSpot record (MS Holdings is on `app-na2.hubspot.com`).
If there are no upcoming or overdue tasks, no email is sent.

The same data is also written to a **Google Sheet** every Friday, and the email links to it (see below).

## Google Sheet (weekly tabs)

Sheet: [MS Holdings – Weekly Tasks (Edward)](https://docs.google.com/spreadsheets/d/11TKUgbnEPjfCMBWsi3JP_1wm6eNa25X4xGM5mV7v-7M/edit)

Every Friday at about 4:30pm ET, `apps-script/Code.gs` adds a tab named **"Week of &lt;next Monday&gt;"**
(newest first). Older weeks' tabs are kept as history. Each tab has one row per task:

`Status (Upcoming/Overdue) · Due · Days Overdue · Task · Priority · Type · Contact · Job Title · Email · Phone · Company · Contact Owner · Latest Note · Note 2 · Note 3`

Task, Contact and Company cells link to HubSpot. Overdue rows are shaded red, the header row is
frozen, and a filter is turned on. Re-running in the same week replaces that week's tab.
The script runs inside Google, so it needs no GitHub or Google Cloud setup.

### One-time setup
1. Open the sheet → **Extensions → Apps Script**.
2. Replace everything in `Code.gs` with the contents of [`apps-script/Code.gs`](apps-script/Code.gs) and save.
3. Reload the sheet. A **HubSpot Tasks** menu appears.
4. **HubSpot Tasks → Set HubSpot token**, then paste the MS Holdings private app token
   (Google asks you to authorize the script the first time).
5. **HubSpot Tasks → Update now** to create this week's tab and check everything works.
6. **HubSpot Tasks → Install weekly schedule** to turn on the Friday run.

Settings (owner IDs, number of notes, overdue on/off) are in the `CONFIG` block at the top of `Code.gs`.
The email's sheet link comes from `SHEET_URL` (set it to an empty string to hide the link).

## Setup

### 1. HubSpot private app (MS Holdings portal)
HubSpot → Settings → Integrations → Private Apps → Create. Give it these read scopes:
`crm.objects.contacts.read`, `crm.objects.companies.read`, `crm.objects.owners.read`.
Contact/company read access also covers tasks and notes.

### 2. GitHub Actions secrets
Repo → Settings → Secrets and variables → Actions → **Secrets**:

| Secret | Value |
|---|---|
| `HUBSPOT_ACCESS_TOKEN` | Private app token from step 1 |
| `RESEND_API_KEY` | Resend API key (the same one as Smartbuild works if the sender domain is verified) |
| `FROM_EMAIL` | Verified sender, e.g. `reports@yourdomain.com` |
| `RECIPIENT_EMAILS` | Comma-separated, e.g. `edward@mshlds.com` |

### 3. Optional settings (Actions → **Variables**)
| Variable | Default | Meaning |
|---|---|---|
| `HUBSPOT_OWNER_IDS` | `160966942` (Edward) | Comma-separated owner IDs whose tasks are included |
| `NOTES_LIMIT` | `3` | Number of notes per task |
| `INCLUDE_OVERDUE` | `true` | Set `false` to hide the overdue section |

The portal ID (`244458981`) and UI domain (`app-na2.hubspot.com`) are defaults in `src/config.js`.

## Running manually
Actions → **Weekly Task Digest Email** → *Run workflow*. Optional inputs:
- `date_from` / `date_to` (YYYY-MM-DD): send for a custom range. Overdue then means "due before `date_from`".
- `dry_run`: builds the email without sending it and attaches `digest-preview.html` to the run.

Locally:
```bash
cp .env.example .env   # fill in values
npm install
npm run preview        # dry run → digest-preview.html
npm start              # sends the email
```

## Tests
Both tests replay real MS Holdings API responses (captured Nov 2026, in `test/fixtures.mjs`), so neither needs a token:
- `node test/replay.mjs`: runs the email through its full pipeline and writes `digest-preview.html`.
- `node test/apps-script.mjs`: runs `apps-script/Code.gs` with mocked Google services and checks the rows it writes.

## Files
- `src/config.js`: settings and HubSpot link builders
- `src/dates.js`: the digest window (next Mon–Sun, or a custom range)
- `src/hubspot.js`: HubSpot API calls (search, batch associations/reads, notes, owners, retries)
- `src/index.js`: builds the records and sends the email (or writes the preview)
- `src/template.js`: HTML and plain-text email
- `src/email.js`: sends through Resend
- `apps-script/Code.gs`: the Google Sheet updater (pasted into the sheet's Apps Script editor)
