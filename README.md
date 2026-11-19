# Elson White Consulting — website and member portal

The public website (Home, About Us, Services, Our Team, Contact) and a secure member portal where each
client sees only their own venues' weekly gaming figures, AHA monthly rankings and Game Performance reports.

It is loaded with everything held in the EWC Claude artifacts: weekly turnover and profit for 41 venues
(2021/2022 to week ending 1 Nov 2026), day-of-week trading where the dashboards had it, AHA NSW monthly and
quarterly rankings for 61 hotels plus their 224 mapped competitors, and the full September 2026 AHA NSW list
(1,103 hotels).

**Gaming Figures** shows each member the same Executive Performance Dashboard EWC sends clients (year and
quarter pills, average weekly turnover and profit cards, weekly turnover by year, net and turnover, monthly pies,
weekly trading, quarterly performance summary with AHA ranking positions, daily trading and automated insights),
built live from the portal's data for just their venues. **Monthly Rankings** shows their venues in the same
table as EWC's monthly ranking email, a written ranking update, the trend against local competitors, and the
whole AHA NSW list (searchable, by LGA), plus the AHA PDF to download.

## What's in the box

| Part | What it does |
| --- | --- |
| `server.js` | The web server: pages, sign-in, contact form |
| `src/api.js` | Portal data. Every request is checked against the signed-in member's venues |
| `src/auth.js` | Passwords (bcrypt-hashed), sessions, lock-out after 5 wrong tries, set-up and reset links |
| `src/importers.js` | Reads the weekly figures workbook and monthly ranking files you upload |
| `src/mail.js` | Sends enquiries to admin@elsonwhiteconsulting.com.au |
| `views/`, `public/` | Page templates, styles, logo, portal screens |
| `seed/ewc-data.json` | The figures and rankings taken from the EWC artifacts |
| `scripts/seed.js` | Loads that data and creates the first two accounts |
| `src/aha.js` | Reads the monthly AHA NSW Gaming Rankings PDF (every hotel) and links it to EWC venues |
| `views/dashboard-template.html`, `public/dashboard/` | The Executive Performance Dashboard, fed by `/api/dashboard-data.js` |
| `seed/aha/` | The September 2026 AHA release and PDF |
| `seed/reports/gp/` | Weekly and monthly Game Performance reports for Marlow Hotel Group and Vauxhall Inn (w/e 5 Jul – 15 Nov 2026) |
| `src/gp.js` | Reads Game Performance workbooks for the online view |
| `scripts/smoke-test.js` | 60 automatic checks of sign-in, access control, dashboards, AHA list, uploads and email |

## 1. Publish it (one-off, about an hour with your web person)

You need a host that runs **Node.js 20+** and has a **persistent disk** (the database and uploaded
reports live there). Render, Railway, DigitalOcean App Platform and Azure App Service (Linux) all work.

1. Upload this folder to the host (or push it to a private GitHub repository the host deploys from).
2. Add a persistent disk and set `DATA_DIR` to its path. Copy `.env.example` to `.env` and fill it in.
3. Build command `npm install`. Start command `npm start`.
4. Run `npm run seed` **once**. It prints the admin's temporary password (or uses `INITIAL_ADMIN_PASSWORD`).
5. Point `www.elsonwhiteconsulting.com.au` at the host in your domain's DNS and turn on HTTPS (the host does this).
6. Email: fill in the `SMTP_*` settings. For Microsoft 365, SMTP sign-in (SMTP AUTH) must be allowed for the
   sending mailbox; ask whoever manages your 365 tenant. Until email is set up, enquiries and set-up links are
   saved and shown in the portal under **Enquiries**, so nothing is lost.
7. Before launch: delete or deactivate the `westrydehotel` test account (or give it a proper password), and
   replace the placeholders on About Us and Our Team (photos in `public/img/`, bios in `views/partials/person.ejs`).

Optional: put a licensed gaming-room photo at `public/img/hero.jpg` and add
`style="--hero-img:url(/img/hero.jpg)"` to the hero sections to use it.

## 2. Weekly routine (Stephanie)

Sign in as an administrator → **Data & Uploads**.

1. **Weekly gaming figures** — upload each group's weekly figures workbook ("Weekly Figures … (TL Copy)").
   Click *Check file*: you see the venues and weeks it found and anything it couldn't match. Click *Save*.
   Members see the new week immediately. Uploading the same week again simply replaces it.
2. **Game Performance (weekly)** — each Game Performance workbook (the "GAME PERFORMANCE — MACHINE PERFORMANCE"
   layout, old or new) is also shown online on the Game Performance page: same game colours, Floor Average and Bottom 20%
   lines, totals and Net after LPJ, with a venue picker. Venue Members see only their own venue's part of a group file
   (they can download the whole file only if you tick the option below). Upload the clean Excel from the EMAIL Generator Tools clean-up,
   **one file per group**, Report type *Game Performance · Weekly*, Period = week-ending date.
3. Monthly: upload the **AHA NSW Gaming Rankings PDF** under *AHA monthly rankings*. *Check file* shows the
   release, the number of hotels and every EWC venue's ranks before you publish. Members then see the full list,
   their own table and the updated trend; the Gaming Figures dashboard's ranking row updates too.
4. Monthly: Game Performance monthly reports the same way as weekly (*Game Performance · Monthly*).

Workbook layouts the importer understands: `Date | Venue A | Venue B … (turnover) | Venue A | Venue B … (profit)`,
or "Turnover"/"Profit" labels above the venue names, or one row per venue-week with
`Venue, Week ending, Turnover, Profit`. Weeks are stored by week-ending Sunday. Rows where profit is
negative and larger than turnover (an entry error, as with Silverwater on w/e 12 and 19 Oct 2026) are skipped
and listed.

## My Tools (administrators)

Each administrator has their own tools under **My Tools**; members never see them.

| Who | Tools |
| --- | --- |
| Candice (`candice.elsonwhite`) | EWC Client Tools (Game Performance tables + QuickChange Email Maker), QuickChange Email (Authorisation Report → Email v1.4), EWC Ranking Tools |
| Stephanie (`Stephanie.EWC`) and any new administrator | EMAIL Generator Tools, EWC Ranking Tools, EWC Game Performance (GP Report tool) |

Change anyone's tools in **Members → Tools** (tick the ones they should have). Every tool is shown in the
website's light EWC theme with the current logo; the tool files themselves are not changed, so the exports
(PowerPoint slides, PDF and Excel) keep their own export look.
When you improve a tool in Claude, download its HTML and use **Replace with newer version** on that tool's page
(you can only replace tools that are in your own list). The previous version is kept as
`DATA_DIR/tools/<tool>.previous.html`.

Logins created by `npm run seed`: `candice.elsonwhite` (temporary password, must change), `Stephanie.EWC`
(password `stephanie123`, or set `STEPHANIE_PASSWORD` before seeding) and the `westrydehotel` test venue.

## 3. Member accounts

Administrator → **Members** → *Add a member*:

- **Venue Member**: one venue. **Group Account**: every venue in the group. **Company Administrator**: everything.
- Choose *Email them a set-up link*: they get their username and a link to choose their own password (valid 7 days).
  Or set a temporary password; they must change it at first sign-in.
- **Forgot password?** on the login page emails a reset link (valid 1 hour).
- *Deactivate* removes access straight away.

Whole-group Game Performance files are visible to the Group Account. Tick *Venue members in this group can
also see a whole-group file* only if every venue in that group may see the others' machines.

## 4. Security notes

Passwords are stored only as bcrypt hashes. Report files are kept outside the public folder and are only
served after checking the member's group/venue, so changing a number in the address returns "not found".
Sessions are HTTP-only cookies; every change needs a CSRF token; 5 wrong passwords lock that login for
15 minutes; the contact form has hidden-field, timing and rate-limit spam checks.

## Running it on a computer

```
npm install
npm run seed
npm start          # http://localhost:3000
npm test           # runs the 60 checks on a throwaway copy
```
