# Kinfolk

A lightweight, single-user relationship CRM for one person's sales work. It runs in the browser (`localStorage`) and can sync to a Google Sheet through an Apps Script web app. There is no backend, login or multi-user behaviour.

## How it's built

There is no build step: native ES modules, plain CSS, no dependencies. GitHub Pages serves the repo root as is.

| File | What lives there |
|---|---|
| `index.html` | Shell; loads `main.css` and `js/app.js` |
| `js/app.js` | Layout, hash routing, click/input/submit delegation, drag-and-drop, keyboard shortcuts, toasts |
| `js/store.js` | State, persistence, sheet mapping, derived data, **every action that changes data** |
| `js/sync.js` | Sheet transport: outbox, flush, pull, connect/disconnect |
| `js/ui.js` | `html` tagged template (escapes by default), icons, time helpers |
| `js/views/*.js` | `today`, `followup` (board + spreadsheet), `sources` (the Leads page), `modals` — pure functions returning HTML |
| `apps-script/Code.gs` | The sheet bridge (v7) |

Rendering is `root.innerHTML = view()` after every change. Focus and text selection are restored by `id` or `data-bind`.

Form inputs are bound to state through `data-bind`. Typing updates state without a re-render, so drafts survive re-renders. When you add an input, give it a `data-bind` (or an `id`) so this keeps working.

Clicks are routed through `data-action` (handled in `act()` in `app.js`), and forms through `data-form` (handled in `onSubmit()`).

Keep it small. Prefer extending these patterns over adding a framework or a dependency.

## Product model

There are three pages, in a daily loop: **Today → Follow up → Leads**. Each page shows only what's needed to act there.

**Today** is the home page.
1. A "Follow-ups first" strip shows people who are late or due today.
2. Below it is a **prospecting session that rewards finding people, not messaging them.**
   - The queue holds `targets` with status `to_research`, filtered by source and project. Skipped targets go to the back of the queue.
   - Saving a find needs a name and a way to reach the person (email, or phone/LinkedIn). It creates a person with:
     - `source` and `foundAt = now`,
     - `nextStep = "First message"`,
     - stage Prospect, due in 24 hours, so they land in Leads.

     The target becomes `found`.
   - Finds are counted toward a daily goal (default 10, editable). No touch is logged for a find; messaging happens in Follow up.
   - "Log a find" does the same for open sources that have no list.

**Follow up** has two views:
- **Board:** one column per engaged stage (Marketing, Discovery, Proposal, Negotiation), soonest follow-up first, late ones in red. Each column head shows the stage's follow-up rhythm. Dragging a card to another column sets its stage. A line above says how many people wait in Leads and how many deals were won and lost in the last 30 days. Won, Lost and Unqualified people never appear here.
- **Spreadsheet:** the engaged people, sortable, shown as cards on mobile. Typing a search widens it to everyone (Leads, Won, Lost and Unqualified too), so nobody is out of reach. Above it, the **stage strip**: four tiles (the engaged stages) with counts under the other filters; clicking one filters the spreadsheet. Under the tiles, **Records: Won · Lost** list the closed deals (Lost rows show the reason).
  - Multi-select: Shift-click selects a range from the selected row, Cmd/Ctrl-click adds or removes one row, `Shift`+`↑`/`↓` extends. With 2+ selected, a bulk bar sets the stage, follow-up 24H/2D/1W and project, or removes them (two clicks). Bulk actions only touch rows that are visible under the current filters. Selection clears on page or view change.

Filters: search, account, industry (focus industries come first). Cards and rows carry a stage tag.

**Leads** (route `#/leads`; `#/sources` still works; the view lives in `views/sources.js`) starts with **To warm up**, then the five fixed sources: **Events, Manning, Search, Social, Association**.
- A **search bar** at the top (`state.ui.pool.search`, separate from Follow up's search) filters To warm up (name, organization, role, project, industry, source, next step, email, phone) and the selected source's companies and logged finds (company, industry, note, list, project, person found). While searching, each source card shows its match count, and the source panel links to other sources that match.
- Each one shows found this week, how many companies are left to research, and how many of its people are engaged now.
- Each has an editable "where to look" note.
- You can paste a company list into a source (one per line: `company, industry, note`).
- The table lists each company and who was found there.
- Events and Association are list-based; Manning, Search and Social are open (log as you go).
- **To warm up** lists everyone at stage Prospect: new finds and anyone sent back because they went cold. Being here *is* being cold, so there's no Cold label. Sorted by date added (newest first by default), filterable by source. Each row shows whether they've been touched (count, or "Never touched") and **coldness**: days since the last touch, or since added if never touched (Fresh 0–7, Cooling 8–30, Stale 31–90, Frozen 90+). Actions:
  - **Touch** opens the record with a touch ready; they stay in Leads and their follow-up runs on the same timer as Follow up (due → late).
  - **→ Marketing** once they respond: onto Follow up (due within a week, Marketing's rhythm).
  - **Unqualified** when they're not a fit (e.g. can't afford it).
- **Unqualified** (below To warm up, open by default, Hide/Show toggle `state.ui.pool.showUnq`) lists everyone at stage Unqualified, most recently marked first, under the same source chips and search. Actions: **Back to Leads** (→ Prospect) and **→ Marketing**.
- **Moving someone to another source:** drag a name (a To warm up or Unqualified row, or a Logged find) onto a source card or a source chip (`data-drag-person` → `data-drop-source`, `setSource` in store.js). Each row's Source menu does the same without dragging (touch screens). Only the person's `source` changes; a company-list target keeps its own source.

### Stage: the one marker

`stage`: `prospect | marketing | discovery | proposal | negotiation | won | lost | unqualified`, with `stageHistory: [{stage, at}]` appended on every change (`patchPerson`). It is the only status-like field a person has, and it decides where they show up. The engaged stages follow the standard B2B pipeline (Salesforce/HubSpot style), each with a follow-up rhythm (`cadence`, hours):

| Stage | Means | Rhythm | Shows on |
|---|---|---|---|
| Prospect | Not engaged yet, or gone cold: worth reviving | — | Leads › To warm up |
| Marketing | Contacted, no active need yet (keep me updated, gave referrals) | 1W | Follow up |
| Discovery | In conversation, finding out whether there's a need | 1W | Follow up |
| Proposal | Need confirmed; presenting the offer | 48H | Follow up |
| Negotiation | Offer on the table; terms, price, objections | 24H | Follow up |
| Won | Purchased | — | Records only (spreadsheet ▸ Records, search) |
| Lost | Final no, with `lostReason` | — | Records only (spreadsheet ▸ Records, search) |
| Unqualified | Not a fit: don't revive | — | Leads › Unqualified, and search |

An objection keeps a deal live; Lost is only for a final no. Cold vs Unqualified: sending someone back to Leads (`P`) means "went cold, revive later". Unqualified (`U`) means "never touch again".

Older names: v5 called Unqualified `cold`; v6 used Attention / Interest / Desire / Action for the board. `renamed()` (store.js) and `renamed_()` (Code.gs) read them as Unqualified and Marketing / Discovery / Proposal / Negotiation wherever they are still stored.

Late (an engaged person whose follow-up has passed) and Win (next step starts `SV:`/`IP:`) are derived, never stored.

**Rhythm.** With the follow-up date left unchanged: logging a touch on a board stage sets it the stage's full gap from now; moving to a board stage (drag, keys, Leads, the modal) keeps the date if it's sooner than that stage's gap, otherwise pulls it in to the gap (overdue or empty → the gap). Picking a date or preset always wins.

A Prospect, Won, Lost or Unqualified person may have no follow-up date (`followUpAt: ''`, shown "Not scheduled"); the sheet's `follow_up_at` is blank for Won, Lost and Unqualified.

**Old data.** `legacyStage` (store.js) and `legacyStage_` (Code.gs) turn the old markers into a stage, and must stay in step: a dead-end next step (Rejected, Out of Geography/Network/Country, Parked, No way in…) → Unqualified; old Cold storage or Prospect/Unqualified → Marketing if touched with a live next step, else Prospect; old Touch/WIP keep an engaged funnel stage, else Marketing/Discovery; Active lead → at least Proposal. Old history entries `cold` become `prospect`. Local data is upgraded on load (`upgradeLocal`); a pre-v5 sheet is mapped on every pull.

### Person

| Field | Notes |
|---|---|
| `id` | |
| `name`, `organization`, `role`, `industry`, `project`, `email`, `phone` | |
| `source` | One of the five sources, or blank |
| `nextStep`, `followUpAt` | |
| `lostReason` | Why a Lost deal was lost; asked for when the stage is set to Lost (sheet `lost_reason`) |
| `stage`, `stageHistory` | See Stage |
| `reportsToId`, `strength` (1–3) | |
| `createdAt`, `foundAt` | |
| `headline`, `notes` | Sheet-owned; `notes` is written only on create |

### Touches

A touch is append-only: `{touch_id, date, person_id, person, next_step, project}`.
- Logging a touch for someone Unqualified or Lost brings them back to Marketing. A Prospect stays in Leads (if the follow-up time was left unchanged and is overdue or empty, it moves to 24 hours from now). On the board, the stage's rhythm sets the next follow-up (see Rhythm).
- The "Log a touch now" box ticks itself when the next step changes.
- Logging a touch requires a next step.
- A **win** is a next step starting with `SV:` (site visit) or `IP:` (in-person presentation).

### Moves

- Dragging a card to another board column sets that stage. Dragging a name on Leads onto a source sets the source.
- `]` / `[` move one stage up or down (Prospect … Negotiation). Won, Lost and Unqualified don't step; set Won or Lost in the person's Stage row (or the bulk bar).
- `P` sends someone back to Leads (gone cold). `U` toggles Unqualified (back to Marketing).
- Joining or moving between board stages applies the stage's rhythm (see Rhythm).

### Targets

`{id, company, industry, hint, source, list, project, status: to_research|found|not_fit, personId, skippedAt, createdAt}`

## Keyboard

Shortcuts are ignored while typing, while a modal is open (except `Esc`), or when a modifier key is held.

- **Anywhere:** `G` then `T`/`F`/`L` switches page (`S` still goes to Leads), `N`/`Q` adds a person, `?` shows the help.
- **Today:** `S` skips, `X` marks not a fit, `L` logs a find, `Enter` saves.
- **Leads:** `F` or `/` jumps to search.
- **Follow up:**
  - `↑`/`↓` or `J`/`K` move up and down a column (they stop at the ends). `←`/`→` or `H`/`L` jump to the same row in the next column that has cards. In the spreadsheet only up and down apply. `Esc` clears the selection, `F` or `/` jumps to search.
  - With someone selected: `T` touch, `]`/`[` stage up/down, `P` back to Leads, `U` Unqualified on/off, `1`/`2`/`3` snooze 24h/2d/1w, `E`/`Enter` edit. With several rows selected in the spreadsheet, the same keys apply to all of them (`U` makes all Unqualified, or all back to Marketing if they're all Unqualified already).

## Persistence

`localStorage` keys:
- `kinfolk-v3-people`, `kinfolk-v3-touches`, `kinfolk-v3-targets`, `kinfolk-v3-meta`, `kinfolk-v3-outbox`;
- `kinfolk-sync-v1`, which holds `{url, token}` and is shared with v2 on purpose.

Saved people in the old shape (`funnel`, `cold`, `unqualified`, `activeLead`, `stage: touch|wip`, or `contacted: false`) are upgraded to one `stage` on load.

On first load, v3 migrates the v2 keys (`kinfolk-pipe-v2`, `kinfolk-touches-v1`, `kinfolk-meta-v1`, `kinfolk-outbox-v1`), keeping the funnel fields. With no data at all, it starts with demo people plus a sample Association list (target ids `demo*`). Those demo targets are discarded on first sync.

## Google Sheets sync

- `GET ?token=` returns `{version, people, touches, projects, groups, targets, sources}`.
- `POST {token, ops}` applies these ops: `upsertPerson`, `deletePerson`, `logTouch`, `upsertTarget`, `deleteTarget`, `upsertSource`, `renameGroup`. Requests are sent as `text/plain`, so there's no CORS preflight.

Behaviour:
- Actions in `store.js` emit ops. Person updates send only the changed sheet fields.
- The outbox flushes about 1 second after a change, in batches of 40, and survives reloads and offline periods.
- Kinfolk pulls on start, on tab focus, when the connection comes back, and every 5 minutes, but only once the outbox is empty.
- Connecting replaces local people with the sheet's.
- `version >= 3` turns on target and source sync. With an older `Code.gs`, targets stay local and the UI says so. The first v3 pull uploads any targets that were created locally.

Sheet columns:
- `funnel_stage` holds the stage, `stage_history` its JSON log.
- `status` is a mirror for the Dashboard and dropdowns: `Prospect` (prospect), `Touch` (any engaged stage), `Cold` (won, lost, unqualified: off the pipeline; the old dropdown has only these three). Kinfolk always sends `status` and `funnel_stage` together.
- `follow_up_at` is blank for Won, Lost and Unqualified, and may be blank for a Prospect.
- `lost_reason` holds `lostReason` (v7; added at the end of People if missing).
- `active_lead` is retired: v5 clears it once and no longer writes it.

`Code.gs`:
- It writes only the fields on its writable list.
- It keeps formula cells intact whatever columns they sit in.
- It adds any missing columns at the end, and creates the `Targets` and `Sources` tabs.
- Kinfolk menu ▸ **Merge duplicate people…** (`findDuplicates_` / `mergeDuplicates_`) groups rows whose names match once case, spaces and doubled letters are ignored, plus a nameless row whose next step is such a name. It shows the groups and asks first; then the most recently touched row is kept, its blank cells are filled from the others (notes are joined), their touches move to it, and the other rows are deleted.
- v5 migrates every People row to one stage the first time it runs (copying People to "People before v5" first), tracked by the `KINFOLK_STAGES_V5` script property. On a sheet v5 already migrated, `renameStages_` renames once per step in `funnel_stage` and `stage_history`: v6 `cold` → `unqualified` (`KINFOLK_STAGES_V6`), then v7 attention/interest/desire/action → marketing/discovery/proposal/negotiation (`KINFOLK_STAGES_V7`). A v4 sheet goes straight to v7 stages. `version >= 6` sets `state.sync.v6`, `>= 7` sets `state.sync.v7`; an older sheet is mapped on each pull (`legacyStage` before v5, `renamed` after) and Leads shows a notice.

## Invariants

- Stage is the only marker. Late and Win are derived. Prospects, Won, Lost and Unqualified people never enter the board or the Late count. Won and Lost show only under Records and in search; Unqualified only in Leads › Unqualified and in search.
- Finds count toward the daily goal. A touch does not.
- A touch is always date + next step + project.
- Kinfolk never writes sheet-owned or formula columns.
- Existing local data must keep loading. New fields need safe defaults in `blankPerson`.
- `Esc` closes modals. Tap targets stay at least 44px on touch screens. Below 760px the left rail becomes a bottom bar.
