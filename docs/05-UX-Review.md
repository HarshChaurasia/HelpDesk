# 05 — UI/UX Review

_Heuristic review of the Help Desk web app (agent/admin + customer roles). Grounded in
walkthroughs of the live app: Login, Tickets list, Ticket detail, New Ticket, Admin
Settings, and the action modals. Findings are prioritized P0 (fix soon) → P2 (nice to have)._

---

## 1. Overall assessment

The product is **feature-complete and visually clean**. The indigo-accented, card-based
design is modern and consistent; badges, priority dots, age/SLA chips and the activity
timeline read well. The ticket detail page is genuinely powerful (conversation, time
tracking, SLA, CC, tags, related tickets, escalation, change request, RCA/resolution).
The list page has strong affordances: search, multi-facet filters, scope tabs, sortable
columns, saved views, bulk actions, and CSV/XLSX export.

The gaps are mostly **polish, consistency, accessibility, and information density** —
not missing capability. The biggest themes:

1. **Inconsistent feedback patterns** — native `alert()`/`confirm()` mixed with styled modals.
2. **Information density** — the detail sidebar and the 13-column list table are heavy.
3. **Accessibility** — icon-only (emoji) buttons, color-only encodings, unverified focus/keyboard support.
4. **A few functional UX gaps** — no requester selection when staff raise a ticket; no attach-on-create.

---

## 2. Strengths (keep these)

- **Draft-then-save** on the detail page — edits don't hit the server until "Save changes". Good guardrail.
- **Quick action bar** (Assign to Me, PDF, Resolve, Close, Merge, Change Request, Escalate) — discoverable, role-aware.
- **CSAT auto-prompt** on resolve/close for customers — well-timed.
- **Empty / loading / error states** exist on the list (empty state, spinner, error with Retry).
- **SLA + age color coding** with text labels (On Track / At Risk / Breached, 2h/3d) — not color-only.
- **Saved views + scope tabs** (All / Mine / Unassigned) — efficient triage.

---

## 3. Findings by area

### 3.1 Global / navigation
- **P0 — Replace native `alert()` / `confirm()` with in-app toasts + styled confirm dialogs.**
  Used in bulk actions, quick-resolve errors, attachment/message deletes. They break the
  visual language, can't be themed, and block the thread. Add a toast system for success/error
  and reuse the existing `.preview-modal` overlay for confirmations.
- **P1 — No toast/confirmation of success.** Saving changes, assigning, adding CC etc. succeed
  silently. A lightweight toast ("Changes saved") closes the feedback loop.
- **P2 — No keyboard shortcuts / command palette.** Power agents would benefit from `g t`
  (go to tickets), `/` (focus search), `c` (compose), `j/k` row nav.
- **P2 — Sidebar** has no collapse and limited active-state for sub-sections.

### 3.2 Tickets list
- **P1 — 13 columns is very wide.** Likely horizontal scroll on laptops/tablets. Add a
  **column-visibility toggle** and/or a **density switch** (comfortable/compact), and drop
  lower-value columns to an expandable row on narrow widths.
- **P1 — Redundant "View" action.** The row is already a link to the ticket; "View" duplicates
  it and costs width. Replace the text actions (View/Comment/Resolve) with **icon buttons +
  tooltips**, and drop "View".
- **P1 — Multi-value filters are client-side only.** Status/Priority with >1 value filter only
  the current page (server takes a single value), so the header count and pagination can
  mislead. Move multi-value filtering server-side, or clearly scope the count to the page.
- **P2 — No visible pagination / page-size control.** Confirm behavior on large datasets.
- **P2 — Age thresholds** (green/yellow/orange/red) would benefit from a tooltip/legend.
- **P2 — List has no PDF export** (only per-ticket). CSV/XLSX cover most needs; low priority.

### 3.3 Ticket detail
- **P1 — Sidebar is long and dense.** ~12 stacked fields + System Info + Resolution + RCA +
  Related + Activity. Consider **tabs within the right rail** (Details · System · Resolution ·
  Activity) or grouping secondary fields behind a "More" disclosure to cut scroll length.
- **P1 — "Save changes" appears in 3 places** (Details header, Details footer, and inside the
  RCA/Resolution cards). Consolidate into **one sticky "You have unsaved changes — Save / Discard"
  bar** that appears when the draft is dirty. Clearer and avoids partial-save confusion.
- **P2 — Quick-action row can wrap** awkwardly with many buttons; an overflow "⋯ More" menu
  would keep it tidy and group destructive/rare actions.
- **P2 — Internal notes** are distinguished by a yellow background + tag (good); make the
  contrast a touch stronger and label the compose area state more prominently when in
  "Internal note" mode.
- **P2 — Reactions/emoji** are a nice touch; ensure they're not the only signal for important state.

### 3.4 Create ticket
- **P0 (functional UX gap) — Staff can't set the requester.** The ticket creator is always the
  current user, so an agent raising a ticket on a customer's behalf records the agent as the
  customer. Add a **"Requester" combobox** (search existing customers / enter email) for staff.
- **P1 — No attachments at creation.** Users must create first, then attach. Allow files to be
  added on the create form (the detail page already supports upload).
- **P2 — Validation is submit-time and generic** ("Description is required"). Add inline
  field-level validation and focus the first invalid field.

### 3.5 Admin settings
- Solid: tabbed (Email / SLA / Categories / System), inline category + subcategory management.
- **P2 — Subcategory add** has no validation messaging on the 2-char minimum (the backend
  enforces it; the UI just no-ops). Surface a hint or inline error.
- **P2** — Destructive category/subcategory deletes should use a styled confirm (see P0 above).

### 3.6 Accessibility (P0/P1 cluster)
- **P0 — Icon-only buttons** (✏️ 🗑 👁 ⬇ 😊+) rely on emoji + `title`. Add `aria-label`s so
  screen readers announce the action; `title` alone is unreliable.
- **P1 — Color-only encodings.** Priority dots and some status cues lean on color. Most have
  text labels already — audit the few that don't (e.g., priority dot in the list).
- **P1 — Verify focus states and keyboard operability** of custom controls (comboboxes,
  filter chips, collapsibles, modals). Modals should trap focus and close on Esc.
- **P2 — Contrast** of muted text (`var(--text-3)`) on white is likely borderline against WCAG AA;
  verify and darken if needed.

### 3.7 Responsive
- **P1 — Activity column is hidden entirely below ~1100px.** Losing audit history on common
  laptop widths is a real loss — move Activity into a **tab/disclosure** instead of hiding it.
- **P1 — Wide table on tablet/mobile** ties back to the column-visibility/density work in 3.2.

### 3.8 Visual / theming
- **P2 — No dark mode**, though the CSS-variable setup suggests it's achievable. Agents stare
  at this all day; a dark theme is a high-satisfaction, low-risk add.
- **P2 — Perceived performance**: swap full-page spinners for **skeleton loaders** on the list
  and detail.

---

## 4. Prioritized action list

**P0 — do soon (consistency + accessibility + a real gap)**
1. Replace all `alert()` / `confirm()` with toasts + a styled confirm dialog.
2. Add `aria-label`s to every icon-only button.
3. Add a "Requester" selector on the create form for staff (raise-on-behalf-of).

**P1 — high impact**
4. Detail page: single sticky "unsaved changes" save bar; consider tabbed right rail.
5. List: icon row-actions (drop "View"), column-visibility/density, responsive columns.
6. Move multi-value filtering server-side (fix count/pagination correctness).
7. Move Activity into a tab so it isn't hidden on mid-width screens.
8. Allow attachments on the create form.
9. Audit/verify keyboard focus + modal focus-trap/Esc.

**P2 — polish**
10. Toast on successful actions.
11. Command palette / keyboard shortcuts.
12. Dark mode.
13. Skeleton loaders.
14. Age legend/tooltip; subcategory min-length hint.

---

## 5. Notes / environment
- Review based on the running app earlier in the session (paper screenshots of every screen).
- At time of writing, the backend was failing to start with `P1000: Authentication failed
  against database server at localhost` — the Postgres reachable earlier (the migration applied
  successfully) was no longer accepting the configured credentials. This is an environment/infra
  issue (likely the DB container/service stopped or a different Postgres took port 5432), not a
  code defect, and does not affect the findings above.
