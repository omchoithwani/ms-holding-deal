# MS Holdings – Weekly Task Digest

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
`node test/replay.mjs` replays real MS Holdings API responses (captured Nov 2026) through the full
pipeline with `fetch` stubbed, and writes `digest-preview.html`. It needs no token.

## Files
- `src/config.js`: settings and HubSpot link builders
- `src/dates.js`: the digest window (next Mon–Sun, or a custom range)
- `src/hubspot.js`: HubSpot API calls (search, batch associations/reads, notes, owners, retries)
- `src/index.js`: builds the records and sends the email (or writes the preview)
- `src/template.js`: HTML and plain-text email
- `src/email.js`: sends through Resend
