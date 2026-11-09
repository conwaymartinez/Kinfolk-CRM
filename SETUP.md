# Kinfolk setup

Kinfolk is plain HTML, CSS and JavaScript with no build step. GitHub Pages serves this repo as it is.

## Upgrading to v6 (Leads, and Unqualified instead of Cold)

- The Sources page is now **Leads**. Its list, **To warm up**, holds everyone not engaged yet: new finds and anyone you send back because they went cold (`P`). Being there means cold, so there's no Cold label.
- **Unqualified** replaces Cold as the "don't revive" stage (e.g. they can't afford it). Unqualified people show nowhere except search. Use the **Unqualified** button in Leads, `U` on Follow up, or the person's Stage row.
- Follow up shows only the four engaged stages. The Spreadsheet lists engaged people, and a search finds anyone.

Sheet: paste the new `apps-script/Code.gs`, then Deploy ▸ Manage deployments ▸ pencil icon ▸ Version: **New version**. On the next sync:
- **Coming from v5:** every "cold" stage becomes "unqualified" (Status stays "Cold" for them, so the Dashboard is unchanged).
- **Coming from v4:** the v5 steps below run first, then you're on v6.

## Upgrading to v5 (one Stage per person)

v5 replaces Status, Stage, Active lead and Unqualified with **one Stage**:

| Stage | Means | Shows on |
|---|---|---|
| Prospect | Not engaged yet, or gone cold | Leads |
| Attention / Interest / Desire / Action | Engaged | Follow up board (one column each) |
| Unqualified (Cold in v5) | Not a fit: don't revive | Nowhere (search only) |

1. Open your Kinfolk sheet ▸ Extensions ▸ Apps Script, replace all of `Code.gs` with `apps-script/Code.gs` from this repo, save.
2. Deploy ▸ Manage deployments ▸ pencil icon ▸ Version: **New version** ▸ Deploy. The URL and token stay the same.
3. Reload Kinfolk. On the first sync the script copies People to a **People before v5** tab, then gives every row one stage:
   - next step starting Rejected, Out of Geography/Network/Country, Parked, No way in… → **Unqualified**;
   - old Cold or Prospect: touched with a live next step → **Attention**, otherwise → **Prospect**;
   - old Touch → **Attention** and WIP → **Interest**, unless a higher stage was already set;
   - Active lead → at least **Desire**.

   `status` becomes a mirror (Prospect / Touch / Cold) so the Dashboard keeps working; `active_lead` is cleared. To see the counts, use Kinfolk menu ▸ Migrate to stages (v6). To undo, copy the backup tab back over People.

Until step 2 is done, Kinfolk works out stages from the old columns on each sync and Leads shows a notice.

4. Kinfolk menu ▸ **Merge duplicate people…** lists people entered twice (same name, ignoring case, spaces and doubled letters, e.g. "Mark LLado" / "Mark Llado") and, if you press OK, merges each group into the most recently touched row: blank details are filled in, notes joined, touches moved over, and the extra rows deleted.

## Upgrading to v4 (funnel stages and the Cold pool)

Same steps as below: paste the new `apps-script/Code.gs`, then Deploy ▸ Manage deployments ▸ edit ▸ Version: **New version**. v4 reads and writes the `funnel_stage` and `stage_history` columns again, so stages set in the v2 build come back. Until you redeploy, Cold still syncs (it is the Cold status) but Attention / Interest / Desire / Action reset to Attention on each pull.

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
  - Every find lands in Leads with "First message" due tomorrow.
- **Follow up:** a board with one column per engaged stage (drag to change stage), plus the Spreadsheet of everyone.
  - Select a card, then `T` to log a touch, `]` / `[` to move a stage up / down, `P` back to Leads (gone cold), `U` for Unqualified, and `1` `2` `3` to snooze.
  - A next step starting `SV:` or `IP:` is a win.
- **Leads:** who to warm up (Touch, → Attention once they respond, Unqualified if they're not a fit), then the five sources: Events, Manning, Search, Social and Association.
  - To add a list, pick a source ▸ Paste a company list. Put one company per line, optionally followed by `, industry, note`.
  - Then click "Research N in Today".
- **Bulk add people:** paste rows into the sheet's Staging tab ▸ set Action (Add / Merge / Skip) ▸ Kinfolk menu ▸ Promote staging.
- **Keys:** `?` lists every shortcut. `G` then `T`, `F` or `L` switches pages.
