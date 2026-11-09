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
| `js/views/*.js` | `today`, `followup` (pipeline + spreadsheet), `sources`, `modals` — pure functions returning HTML |
| `apps-script/Code.gs` | The sheet bridge (v5) |

Rendering is `root.innerHTML = view()` after every change. Focus and text selection are restored by `id` or `data-bind`.

Form inputs are bound to state through `data-bind`. Typing updates state without a re-render, so drafts survive re-renders. When you add an input, give it a `data-bind` (or an `id`) so this keeps working.

Clicks are routed through `data-action` (handled in `act()` in `app.js`), and forms through `data-form` (handled in `onSubmit()`).

Keep it small. Prefer extending these patterns over adding a framework or a dependency.

## Product model

There are three pages, in a daily loop: **Today → Follow up → Sources**.

**Today** is the home page.
1. A "Follow-ups first" strip shows people who are late or due today.
2. Below it is a **prospecting session that rewards finding people, not messaging them.**
   - The queue holds `targets` with status `to_research`, filtered by source and project. Skipped targets go to the back of the queue.
   - Saving a find needs a name and a way to reach the person (email, or phone/LinkedIn). It creates a person with:
     - `source` and `foundAt = now`,
     - `nextStep = "First message"`,
     - stage Prospect, due in 24 hours, so they land in Sources › Prospects.

     The target becomes `found`.
   - Finds are counted toward a daily goal (default 10, editable). No touch is logged for a find; messaging happens in Follow up.
   - "Log a find" does the same for open sources that have no list.

**Follow up** has two views:
- **Board:** one column per engaged stage (Attention, Interest, Desire, Action), soonest follow-up first, late ones in red. Dragging a card to another column sets its stage. A line above says how many Prospects wait in Sources and how many are Cold.
- **Spreadsheet:** everyone, sortable, shown as cards on mobile. Above it, the **stage strip**: six tiles (every stage) with counts under the other filters; clicking one filters the spreadsheet.
  - Multi-select: Shift-click selects a range from the selected row, Cmd/Ctrl-click adds or removes one row, `Shift`+`↑`/`↓` extends. With 2+ selected, a bulk bar sets the stage, follow-up 24H/2D/1W and project, or removes them (two clicks). Bulk actions only touch rows that are visible under the current filters. Selection clears on page or view change.

Filters: search, account, industry (focus industries come first). Cards and rows carry a stage tag.

**Sources** shows the five fixed sources: **Events, Manning, Search, Social, Association**.
- Each one shows found this week, how many companies are left to research, and how many of its people are engaged now.
- Each has an editable "where to look" note.
- You can paste a company list into a source (one per line: `company, industry, note`).
- The table lists each company and who was found there.
- Events and Association are list-based; Manning, Search and Social are open (log as you go).
- Above them, **Prospects** lists everyone at stage Prospect, sorted by date added (newest first by default), filterable by source. Each row shows **coldness**: days since the last touch, or since added if never touched (Fresh 0–7, Cooling 8–30, Stale 31–90, Frozen 90+). Actions:
  - **Touch** opens the record with a touch ready; they stay a Prospect and their follow-up runs on the same timer as Follow up (due → late).
  - **→ Attention** moves them onto Follow up (overdue or unscheduled → due tomorrow).
  - **Cold** marks them a dead end.

### Stage: the one marker

`stage`: `prospect | attention | interest | desire | action | cold`, with `stageHistory: [{stage, at}]` appended on every change (`patchPerson`). It is the only status-like field a person has, and it decides where they show up:

| Stage | Means | Shows on |
|---|---|---|
| Prospect | Reachable, not engaged yet | Sources › Prospects |
| Attention / Interest / Desire / Action | Engaged | Follow up board |
| Cold | Dead end for now | Nowhere (Spreadsheet and search only) |

Late (an engaged person whose follow-up has passed) and Win (next step starts `SV:`/`IP:`) are derived, never stored. There is no Active lead, Unqualified or Touch/WIP any more.

A Prospect or Cold person may have no follow-up date (`followUpAt: ''`, shown "Not scheduled"). Moving anyone onto the board with no date or an overdue one makes them due tomorrow.

**Old data.** `legacyStage` (store.js) and `legacyStage_` (Code.gs) turn the old markers into a stage, and must stay in step: a dead-end next step (Rejected, Out of Geography/Network/Country, Parked, No way in…) → Cold; old Cold storage or Prospect/Unqualified → Attention if touched with a live next step, else Prospect; old Touch/WIP keep an engaged funnel stage, else Attention/Interest; Active lead → at least Desire. Old history entries `cold` become `prospect`. Local data is upgraded on load (`upgradeLocal`); a pre-v5 sheet is mapped on every pull.

### Person

| Field | Notes |
|---|---|
| `id` | |
| `name`, `organization`, `role`, `industry`, `project`, `email`, `phone` | |
| `source` | One of the five sources, or blank |
| `nextStep`, `followUpAt` | |
| `stage`, `stageHistory` | See Stage |
| `reportsToId`, `strength` (1–3) | |
| `createdAt`, `foundAt` | |
| `headline`, `notes` | Sheet-owned; `notes` is written only on create |

### Touches

A touch is append-only: `{touch_id, date, person_id, person, next_step, project}`.
- Logging a touch for someone Cold brings them back to Attention. A Prospect stays a Prospect. If the follow-up time was left unchanged and is overdue or empty, it moves to 24 hours from now.
- The "Log a touch now" box ticks itself when the next step changes.
- Logging a touch requires a next step.
- A **win** is a next step starting with `SV:` (site visit) or `IP:` (in-person presentation).

### Moves

- Dragging a card to another board column sets that stage.
- `]` / `[` move one stage up or down (Prospect … Action). Cold doesn't step.
- `C` toggles Cold (back to Attention). `P` sends someone back to Prospects.
- Joining the board with no date or an overdue one schedules them 24 hours from now.

### Targets

`{id, company, industry, hint, source, list, project, status: to_research|found|not_fit, personId, skippedAt, createdAt}`

## Keyboard

Shortcuts are ignored while typing, while a modal is open (except `Esc`), or when a modifier key is held.

- **Anywhere:** `G` then `T`/`F`/`S` switches page, `N`/`Q` adds a person, `?` shows the help.
- **Today:** `S` skips, `X` marks not a fit, `L` logs a find, `Enter` saves.
- **Follow up:**
  - `↑`/`↓` or `J`/`K` move up and down a column (they stop at the ends). `←`/`→` or `H`/`L` jump to the same row in the next column that has cards. In the spreadsheet only up and down apply. `Esc` clears the selection, `F` or `/` jumps to search.
  - With someone selected: `T` touch, `]`/`[` stage up/down, `C` Cold on/off, `P` back to Prospects, `1`/`2`/`3` snooze 24h/2d/1w, `E`/`Enter` edit. With several rows selected in the spreadsheet, the same keys apply to all of them (`C` sends all to Cold, or all back to Attention if they're all Cold already).

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
- `status` is a mirror for the Dashboard and dropdowns: `Prospect` (prospect), `Touch` (any engaged stage), `Cold` (cold). Kinfolk always sends `status` and `funnel_stage` together.
- `follow_up_at` is blank for Cold, and may be blank for a Prospect.
- `active_lead` is retired: v5 clears it once and no longer writes it.

`Code.gs`:
- It writes only the fields on its writable list.
- It keeps formula cells intact whatever columns they sit in.
- It adds any missing columns at the end, and creates the `Targets` and `Sources` tabs.
- v5 migrates every People row to one stage the first time it runs (copying People to "People before v5" first), tracked by the `KINFOLK_STAGES_V5` script property. `version >= 5` sets `state.sync.v5`; an older sheet is mapped with `legacyStage` on each pull and Sources shows a notice.

## Invariants

- Stage is the only marker. Late and Win are derived. Prospects and Cold people never enter the board or the Late count.
- Finds count toward the daily goal. A touch does not.
- A touch is always date + next step + project.
- Kinfolk never writes sheet-owned or formula columns.
- Existing local data must keep loading. New fields need safe defaults in `blankPerson`.
- `Esc` closes modals. Tap targets stay at least 44px on touch screens. Below 760px the left rail becomes a bottom bar.
