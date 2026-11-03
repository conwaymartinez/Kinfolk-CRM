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
| `js/views/*.js` | `today`, `followup` (pipeline + spreadsheet), `projects` (folders + ICP builder), `sources`, `modals` — pure functions returning HTML |
| `apps-script/Code.gs` | The sheet bridge (v4) |

Rendering is `root.innerHTML = view()` after every change. Focus and text selection are restored by `id` or `data-bind`.

Form inputs are bound to state through `data-bind`. Typing updates state without a re-render, so drafts survive re-renders. When you add an input, give it a `data-bind` (or an `id`) so this keeps working.

Clicks are routed through `data-action` (handled in `act()` in `app.js`), and forms through `data-form` (handled in `onSubmit()`).

Keep it small. Prefer extending these patterns over adding a framework or a dependency.

## Product model

There are four pages. Three form a daily loop, **Today → Follow up → Sources**, and **Projects** organises the work by asset.

**Today** is the home page.
1. A "Follow-ups first" strip shows people who are late or due today.
2. Below it is a **prospecting session that rewards finding people, not messaging them.**
   - The queue holds `targets` with status `to_research`, filtered by source and project. Skipped targets go to the back of the queue.
   - Saving a find needs a name and a way to reach the person (email, or phone/LinkedIn). It creates a person with:
     - `source` and `foundAt = now`,
     - `nextStep = "First message"`,
     - stage Touch, due in 24 hours.

     The target becomes `found`.
   - Finds are counted toward a daily goal (default 10, editable). No touch is logged for a find; messaging happens in Follow up.
   - "Log a find" does the same for open sources that have no list.

**Follow up** has two views:
- **Pipeline:** Touch / WIP / Late, with drag-and-drop.
- **Spreadsheet:** everyone, sortable, shown as cards on mobile.
  - Multi-select: Shift-click selects a range from the selected row, Cmd/Ctrl-click adds or removes one row, `Shift`+`↑`/`↓` extends. With 2+ selected, a bulk bar sets Active lead, Unqualified, Cold storage, Back in pipeline, follow-up 24H/2D/1W and project, or removes them (two clicks). Bulk actions only touch rows that are visible under the current filters. Selection clears on page or view change.

Filters: search, Active leads only, account, industry (focus industries come first).

**Projects** has one folder per asset (each entry in `state.projects`, the sheet's Projects tab).
- The overview shows each folder's Touch / WIP / Late counts, people, active leads, wins this month and companies left to research. `+ New folder` adds an asset and opens its ICP.
- A folder (`#/projects/<id>`) has three tabs. **Pipeline** and **People** are the Follow up board and spreadsheet scoped to people whose `project` is the folder (`state.ui.scope`): filters, multi-select, bulk edits and every Follow up shortcut work there too. Adding a person from inside a folder files them in it. **ICP** is the builder.
- Folder membership is the person's current `project`, so a person is in one folder at a time, and logging a touch with another project chip moves them.
- **ICP** (`state.icps[project]`): `{industries[], roles, geography, keywords, summary, pitch, updatedAt}`. Roles, geography and keywords are comma-separated and matched as whole words, case-insensitively.
  - `fitScore`: industry 40, role 35, geography (`geography`, organization, headline, notes) 15, signals (headline, notes, organization, role, next step) 10, scaled to the criteria that are set. 70%+ is a strong fit, 40%+ partial. Fits show as tags on the folder's cards and as an ICP fit column in its People tab.
  - The builder rescores everyone live from the draft, splits fits into in this folder / no project / other folders, and can add or move people into the folder, file every unfiled fit at once, tag matching untagged `to_research` companies for the folder, and send you to Today with that project selected.

**Sources** shows the five fixed sources: **Events, Manning, Search, Social, Association**.
- Each one shows found this week, how many companies are left to research, and how many became active.
- Each has an editable "where to look" note.
- You can paste a company list into a source (one per line: `company, industry, note`).
- The table lists each company and who was found there.
- Events and Association are list-based; Manning, Search and Social are open (log as you go).

### Person

| Field | Notes |
|---|---|
| `id` | |
| `name`, `organization`, `role`, `industry`, `project`, `email`, `phone` | |
| `source` | One of the five sources, or blank |
| `nextStep`, `followUpAt` | |
| `stage` | `touch` or `wip` |
| `unqualified` | Not vetted or not a fit yet; out of the pipeline. Replaces the old `contacted` flag |
| `cold` | Cold storage |
| `activeLead` | Manual tag; it replaces the old AIDA funnel |
| `reportsToId`, `strength` (1–3) | |
| `createdAt`, `foundAt` | |
| `headline`, `notes` | Sheet-owned; `notes` is written only on create |
| `geography` | Sheet-owned, read only; used by ICP scoring |

### Status

Status is derived (`statusOf`):
- `cold` if in cold storage;
- else `unqualified` if marked Unqualified;
- else `late` if `followUpAt` has passed;
- else `touch` or `wip`.

Late is never stored. Unqualified and cold people stay out of the pipeline and the Late count. Anyone else is being worked, so they're in the pipeline. Unqualified and Cold are exclusive: setting one clears the other.

### Touches

A touch is append-only: `{touch_id, date, person_id, person, next_step, project}`.
- Logging a touch for someone Unqualified moves them into the pipeline. If the follow-up time was left unchanged and is overdue, it moves to 24 hours from now.
- The "Log a touch now" box ticks itself when the next step changes.
- Logging a touch requires a next step.
- A **win** is a next step starting with `SV:` (site visit) or `IP:` (in-person presentation).

### Moves

- Moving a card to Late sets the follow-up time to the past.
- Moving it out of Late sets it to 24 hours from now.
- Moving it into WIP logs a touch.
- `R` sends someone back to Touch, due tomorrow.
- Bringing someone back from Cold or Unqualified when they're overdue schedules them 24 hours from now.

### Targets

`{id, company, industry, hint, source, list, project, status: to_research|found|not_fit, personId, skippedAt, createdAt}`

## Keyboard

Shortcuts are ignored while typing, while a modal is open (except `Esc`), or when a modifier key is held.

- **Anywhere:** `G` then `T`/`F`/`P`/`S` switches page (P is Projects), `N`/`Q` adds a person, `?` shows the help.
- **Today:** `S` skips, `X` marks not a fit, `L` logs a find, `Enter` saves.
- **Follow up**, and a project folder's Pipeline and People tabs:
  - `↑`/`↓` or `J`/`K` move up and down a column (they stop at the ends). `←`/`→` or `H`/`L` jump to the same row in the next column that has cards. In the spreadsheet only up and down apply. `Esc` clears the selection, `F` or `/` jumps to search.
  - With someone selected: `T` touch, `A` Active lead, `U` Unqualified, `C` cold, `R` back to Touch, `1`/`2`/`3` snooze 24h/2d/1w, `E`/`Enter` edit. With several rows selected in the spreadsheet, `A`/`U`/`C` turn the flag on for all (off if all already have it), `R` puts them all back in the pipeline, and `1`/`2`/`3` snooze them all.

## Persistence

`localStorage` keys:
- `kinfolk-v3-people`, `kinfolk-v3-touches`, `kinfolk-v3-targets`, `kinfolk-v3-meta`, `kinfolk-v3-outbox`;
- `kinfolk-sync-v1`, which holds `{url, token}` and is shared with v2 on purpose.

`kinfolk-v3-meta` also holds `icps` and `newProjects` (folders made on this device that the sheet doesn't list yet).

Saved people that still have `contacted: false` load as Unqualified.

On first load, v3 migrates the v2 keys (`kinfolk-pipe-v2`, `kinfolk-touches-v1`, `kinfolk-meta-v1`, `kinfolk-outbox-v1`) and drops the funnel fields. With no data at all, it starts with demo people plus a sample Association list (target ids `demo*`). Those demo targets are discarded on first sync.

## Google Sheets sync

- `GET ?token=` returns `{version, people, touches, projects, groups, targets, sources, icps}`.
- `POST {token, ops}` applies these ops: `upsertPerson`, `deletePerson`, `logTouch`, `upsertTarget`, `deleteTarget`, `upsertSource`, `upsertProject`, `renameGroup`. Requests are sent as `text/plain`, so there's no CORS preflight.

Behaviour:
- Actions in `store.js` emit ops. Person updates send only the changed sheet fields.
- The outbox flushes about 1 second after a change, in batches of 40, and survives reloads and offline periods.
- Kinfolk pulls on start, on tab focus, when the connection comes back, and every 5 minutes, but only once the outbox is empty.
- Connecting replaces local people with the sheet's.
- `version >= 3` turns on target and source sync. With an older `Code.gs`, targets stay local and the UI says so. The first v3 pull uploads any targets that were created locally.
- `version >= 4` turns on folder and ICP sync through `upsertProject`. Projects from the sheet come first; folders in `newProjects` are kept (and uploaded on v4) until the sheet lists them, so a folder deleted in the sheet stays deleted. If the sheet has no ICPs yet, the first v4 pull uploads the local ones; otherwise the sheet's ICPs win.

Status mapping:

| Sheet status | Meaning |
|---|---|
| Prospect | Unqualified (the sheet keeps the old word so dropdowns and Dashboard formulas still work; `Unqualified` is read too) |
| Touch / WIP | The pipeline stage |
| Cold | Cold storage |

Other sheet fields:
- `active_lead` is `Y` or blank.
- `follow_up_at` is blank for Prospect and Cold.

`Code.gs` v3 and v4:
- It writes only the fields on its writable list.
- It keeps formula cells intact whatever columns they sit in.
- It adds any missing columns at the end, and creates the `Targets` and `Sources` tabs.
- v4 adds `icp_industries`, `icp_roles`, `icp_geography`, `icp_keywords`, `icp_summary`, `icp_pitch` and `updated_at` to the Projects tab (one row per folder, keyed by `project`).
- It never writes the v2 funnel columns.

## Invariants

- Late is derived. Unqualified and cold people never enter the pipeline or the Late count.
- Finds count toward the daily goal. A touch does not.
- A touch is always date + next step + project.
- Kinfolk never writes sheet-owned or formula columns.
- Existing local data must keep loading. New fields need safe defaults in `blankPerson`.
- `Esc` closes modals. Tap targets stay at least 44px on touch screens. Below 760px the left rail becomes a bottom bar.
