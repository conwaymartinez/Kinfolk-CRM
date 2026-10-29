# Kinfolk setup

Kinfolk is plain HTML, CSS and JavaScript with no build step. GitHub Pages serves this repo as it is.

## Upgrading from v2 (you already have a sheet and a deployment)

1. Open your Kinfolk sheet ▸ Extensions ▸ Apps Script.
2. Replace all of `Code.gs` with `apps-script/Code.gs` from this repo, then save.
3. Deploy ▸ Manage deployments ▸ pencil icon ▸ Version: **New version** ▸ Deploy. The web app URL and the token stay the same.
4. Reload Kinfolk. On the next sync, the script:
   - adds the `Targets` and `Sources` tabs,
   - adds the `phone`, `source`, `active_lead` and `found_at` columns to People.

   Existing data and formula columns are left alone.

Your browser keeps its connection, because Kinfolk v3 reads the same saved URL and token. Until step 3 is done, people and touches still sync, but these stay on the device only:
- Active lead tags,
- finds,
- company lists.

The Sync settings dialog and the Sources page both tell you when that's the case.

## Fresh setup (about 15 minutes, free)

### 1. Put the database in Google Sheets
Upload `Kinfolk_Database.xlsx` to Google Drive ▸ Open with Google Sheets ▸ File ▸ Save as Google Sheets.

### 2. Add the sync script
1. In the sheet: Extensions ▸ Apps Script. Delete what's there, paste all of `apps-script/Code.gs`, then save.
2. Choose `setup` in the toolbar ▸ Run ▸ approve the permissions. It's your own script, acting on your own sheet.
3. Copy the token it shows. If you lose it: Kinfolk menu in the sheet ▸ Show sync token.

### 3. Publish it as a web app
Deploy ▸ New deployment ▸ gear icon ▸ Web app.
- Execute as: **Me**.
- Who has access: **Anyone**.

Copy the web app URL (it ends in `/exec`). "Anyone" means anyone who has both the URL *and* the token.

### 4. Host Kinfolk
Repo Settings ▸ Pages ▸ Deploy from a branch ▸ `main` / root. The app is then at `https://<you>.github.io/<repo>/`.

### 5. Connect
In Kinfolk, click the sync pill at the bottom of the left rail ▸ paste the URL and the token ▸ Connect. Do this once on each device.

## Daily use

- **Today:** clear the follow-ups first, then prospect.
  - Research the next company on your list and save the person who decides on space (`Enter`).
  - `S` skips a company for now; `X` marks it not a fit.
  - `L` logs someone you found at an event, while manning, searching or on social.
  - Every find lands in Follow up › Touch with "First message" due tomorrow.
- **Follow up:** the Touch / WIP / Late board, plus the Spreadsheet of everyone.
  - Select a card, then `T` to log a touch, `A` to toggle Active lead, `C` for cold storage, and `1` `2` `3` to snooze.
  - A next step starting `SV:` or `IP:` is a win.
- **Sources:** the five sources are Events, Manning, Search, Social and Association.
  - To add a list, pick a source ▸ Paste a company list. Put one company per line, optionally followed by `, industry, note`.
  - Then click "Research N in Today".
- **Bulk add people:** paste rows into the sheet's Staging tab ▸ set Action (Add / Merge / Skip) ▸ Kinfolk menu ▸ Promote staging.
- **Keys:** `?` lists every shortcut. `G` then `T`, `F` or `S` switches pages.
