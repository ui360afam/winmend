# WinMend user manual

WinMend is a Windows error decoder and troubleshooting site. Visitors paste a code or describe a problem and get a plain-language explanation, ranked likely causes and a fix list that starts with the safest step. This manual covers using the site, running it on your own computer, and adding new error codes (one at a time, in bulk, or with the scraper).

## Contents

- Quick start on your computer (port 8093)
- What visitors can do
- The admin panel
- Adding new error codes
- The scraper
- Command-line tools
- How the content is stored
- Entry format reference
- Deploying and backups
- Troubleshooting

## Quick start on your computer

You need Node.js 18 or newer (free from nodejs.org, choose the LTS version). Nothing else is installed: the project has no third-party packages.

1. Unzip the source zip anywhere.
2. Start it with one click:
   - Windows: double-click `start-windows.bat`
   - macOS: double-click `start-mac.command` (the first time, right-click it and choose Open)
   - Linux: run `./start-mac-linux.sh`
3. Your browser opens at http://localhost:8093. Close the window (or press Ctrl+C) to stop it.

Anything you add on your computer is saved in the `data-local` folder next to the code. Delete that folder to start fresh.

You can also start it from a terminal with `npm run local` (same thing) or `PORT=8093 node server.js`.

## What visitors can do

| Feature | Where | What it does |
|---|---|---|
| Decoder | Home, tab 1 | Explains a code instantly: meaning, causes, first steps, plus a "code anatomy" breakdown of any hex or decimal number (HRESULT, NTSTATUS, Win32, stop code). |
| Log scanner | Decoder, "Paste a log" | Finds every code inside pasted Event Viewer text, setup logs or forum posts and matches them all at once. |
| Lookup | Home, tab 2 | Searches and filters the whole database by text, category, severity and sort order. Includes the visitor's saved errors. |
| Triage wizard | Home, tab 3 | Four questions (symptom, timing, recent change, boot state) produce a ranked list with reasons, a comparison table and advice. |
| Fix plan | Home, tab 4 | Turns any fix list into a checklist that remembers progress, with copy or download as Markdown and print. Several errors can be queued. |
| Error pages | /errors/... | Full article per error with copyable commands, "This fixed it" votes, helpful or not feedback, view counts, save, share and print. |
| Error database | /errors | Every entry grouped by category, plus a page per category. |
| Guides | /guides | Six long-form repair walkthroughs with reading progress. |
| Assistant | Sparkle button or A key | Answers questions using the site's own pages, guides and FAQ. It runs locally, needs no AI service and no keys. Conversations can be exported. |
| Command palette | Ctrl+K | Jump to any error, guide or tool. |
| History | Clock button or H key | The visitor's own recent decodes, scans and triage runs, stored only in their browser. |
| Requests | Decoder, when no match | Visitors can ask for a missing code. Requests are counted and shown to you in the admin panel. |
| Extras | Home | Trending errors, error of the day, Surprise me, recent searches, dark mode, keyboard shortcuts (press ?). |

## The admin panel

Open `/admin` (for example http://localhost:8093/admin).

- The first visit asks you to create a password (8 characters or more). On the live site, do this right after it goes online: whoever sets it first controls the panel. You can also fix the password with the `ADMIN_PASSWORD` environment variable.
- Tabs: Overview, All entries, Add an error, Bulk import, Scraper, Visitor requests, Settings.
- The "Download source zip" button gives you the complete project (code, content, manuals, one-click start files). Entries you added in the admin are included as `content/errors.d/admin-export.json`, so the zip runs with your additions.

## Adding new error codes

There are four ways. All of them produce pages in exactly the same format as the built-in ones (summary, meaning, causes, ordered fixes with difficulty and time, cautions, prevention, triage signals, related errors, tags).

### 1. One error in the admin panel

1. Admin > Add an error.
2. Type the main code, for example `0x80070490`, `PAGE_FAULT_IN_NONPAGED_AREA` or `Code 28`. If you know the official message, put it in the second box.
3. Press Auto-fill content. The generator decodes the number (facility, Win32 name, stop code and so on), picks the right category and fills every field with a complete draft built from proven, safe repair steps for that kind of error.
4. Edit anything you like: reorder steps, add a caution note, tick triage signals.
5. Save and publish, or save as a draft (drafts are hidden from visitors; use View to preview them).

You can also edit or hide any built-in entry from All entries. Edits are stored separately, so "Revert" brings the original back.

### 2. Many errors at once (bulk import)

Admin > Bulk import accepts three formats. Paste the text or upload a file, press Preview, untick anything you do not want, then Import selected.

Plain list, one code per line (everything after the code is optional):

```
0x80070490
0x8024402C | Windows Update error 0x8024402C | update | The proxy or DNS name could not be resolved.
KMODE_EXCEPTION_NOT_HANDLED
Code 28
```

CSV with a header row. Columns you leave out are generated. Lists inside a cell are separated with `|`, and fixes are written as `Title: instructions`:

```
code,title,category,severity,summary,aliases,causes,fixes,prevention,tags
0x80070490,Windows Update error 0x80070490,update,medium,"Short summary",ERROR_NOT_FOUND,Cause one|Cause two,"Step one: do this|Step two: do that",Tip one,windows-update
```

JSON: an array of entries (see the format reference below). A JSON item can be as small as `{"code": "0x80240034"}`.

Sample files are in `docs/samples/` and downloadable from the Bulk import screen. The preview marks codes that already exist; they are skipped unless you tick "Replace entries that already exist".

### 3. Files in the repository

Put a JSON file in `content/errors.d/` (one entry or an array) and restart or redeploy. This is the best option when you want new content to be part of the source code itself. The command-line tools below create these files for you.

### 4. Visitor requests

Admin > Visitor requests lists codes visitors asked for, most requested first. "Create page" opens the editor already auto-filled.

### Writing tips

- Order fixes from safest and quickest to riskiest.
- Put commands in backticks, like `sfc /scannow`. They become copy buttons on the page.
- Use the caution note for anything that can lose data or stop Windows from starting.
- Avoid the long dash character; the site style uses commas, colons or parentheses instead.

## The scraper

Admin > Scraper collects code lists from public reference pages and puts them in an inbox.

Built-in sources:

| Source | About |
|---|---|
| Blue screen stop codes | Every bug check name and number (about 380) |
| Windows Update error codes | WU_E_* codes with their official descriptions (about 260) |
| Device Manager error codes | Code 1 to Code 57 with their CM_PROB names |
| Win32 system error codes 0 to 1299 | The most common range (about 730) |
| Win32 system error codes 0 to 15999 | The full list (about 2,800), across ten pages |

You can also paste any other URL that lists codes in a table, or in "NAME / number / message" blocks.

After a scrape:

1. Codes the site already covers are marked "covered" and linked to the existing page.
2. New codes wait in the inbox. Select some and press "Create pages for selected", or press "Create pages for all waiting" to generate them all. Choose Publish or As drafts first.
3. Each generated page uses the official name and message from the source, the decoded number and the category's repair steps, in the same layout as the hand-written pages. Visitors see a short note that the page was compiled from the official code reference.
4. Ignore codes you never want, or empty the inbox.

The scraper only fetches public web pages. Local and private network addresses are blocked on purpose.

## Command-line tools

All commands run from the project folder.

| Command | What it does |
|---|---|
| `npm run local` | Start on http://localhost:8093 with data in `data-local` |
| `npm start` | Start on port 8080 with data in `/data` (what the server uses) |
| `node scripts/import.js my-list.csv` | Turn a list, CSV or JSON file into `content/errors.d/my-list.json`. Add `--draft` to keep them hidden, `--overwrite` to replace existing entries, `--to-data` to write into the data folder instead (stop the server first). |
| `node scripts/scrape.js --list` | Show the scraper sources |
| `node scripts/scrape.js --preset bugchecks` | Scrape and write `content/errors.d/scraped-bugchecks.json`. Add `--limit 200` to cap the number, `--draft` to keep them hidden. |
| `node scripts/scrape.js --url https://... --kind update` | Scrape any page |
| `npm run zip` | Build `dist/winmend-source.zip` |
| `npm run check` | Check that everything loads and that no long dashes slipped into the content |

## How the content is stored

| What | Where | Survives a redeploy? |
|---|---|---|
| Built-in errors, guides, FAQ, categories | `content/*.json` | Yes (part of the code) |
| Drop-in errors | `content/errors.d/*.json` | Yes (part of the code) |
| Errors added or edited in the admin | `DATA_DIR/custom-errors.json` | Yes, `/data` is kept between deploys |
| Scraper inbox | `DATA_DIR/scraped.json` | Yes |
| Views, votes, feedback, requests, counters | `DATA_DIR/community.json` | Yes |
| Admin password (hashed) and signing key | `DATA_DIR/admin.json`, `DATA_DIR/secret.json` | Yes |

`DATA_DIR` is `/data` on the server and `data-local` on your computer. Visitor-side things (history, saved errors, fix plan progress, guide progress, theme) live in each visitor's browser.

Later sources win: an entry in the admin overrides a drop-in file, which overrides a built-in entry with the same slug.

## Entry format reference

| Field | Required | Notes |
|---|---|---|
| `slug` | no | Page address, generated from the code if missing |
| `title` | no | Shown as the page heading |
| `codes` | yes (or `code`) | First item is the main code; the rest are aliases used by search and the log scanner (hex, decimal, names) |
| `category` | no | bsod, update, win32, store, activation, network, startup, driver, hardware, performance, file-system, audio, security |
| `severity` | no | low, medium, high, critical |
| `frequency` | no | rare, uncommon, common, very-common |
| `windowsVersions` | no | For example `["Windows 10", "Windows 11"]` |
| `summary` | no | One or two sentences |
| `meaning` | no | A paragraph |
| `commonCauses` | no | List of strings |
| `fixes` | no | List of `{title, detail, difficulty, timeEstimate, riskNote?}`; difficulty is easy, intermediate or advanced |
| `prevention` | no | List of strings |
| `signals` | no | Triage matches, for example `symptom:bsod`, `when:startup`, `change:windows-update`, `boot:yes` |
| `relatedSlugs` | no | Slugs of related entries |
| `tags` | no | Free keywords |

Anything missing is generated when the entry is imported.

## Deploying and backups

- The included `Dockerfile` serves the site on port 8080 and keeps all state in `/data`. The health check is `/healthz`.
- To change the brand name, edit `lib/config.js` (or set `SITE_NAME`, `SITE_NAME_A`, `SITE_NAME_B`).
- If you change a file in `public/assets`, raise `ASSET_V` in `lib/config.js` so browsers fetch the new version.
- Back up your additions with Admin > Settings > Export my entries. Restore them on any copy with Bulk import (JSON).

## Troubleshooting

- "Node.js is not installed": install the LTS version from nodejs.org, then start again.
- Port 8093 is busy: close the other program, or run `PORT=8094 npm run local`.
- Forgot the admin password: on your computer, delete `data-local/admin.json` and open /admin to set a new one. On a server, set the `ADMIN_PASSWORD` environment variable.
- New files in `content/errors.d` do not show up: restart the server; drop-in files are read at startup.
