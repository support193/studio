# Explore — Design Spec

**Date:** 2026-05-16
**Project:** 제노 로봇 (`zeno-panda-demo`, public repo `support193/studio`, Railway-deployed)
**Status:** Approved (design); implementation plan to follow.

## 1. Goal

A public data-catalog ("Explore") for the mission/teleop platform, modelled on
Axis Robotics' Explore (`hub.axisrobotics.ai/?tab=explore` + its task-detail
page). It surfaces, transparently, what tasks exist, how much trajectory data
has been collected per task, and the quality distribution — to build buyer /
contributor trust and become the entry point for selling per-task datasets
later.

## 2. Locked decisions

- **Scope:** Explore catalog only. The actual data-sales subsystem
  (licensing, pricing, buyer accounts, download/API, payments, on-chain
  verification) is **out of scope**; only the data model is made sale-ready.
- **Visibility:** Fully public, Axis-style. No login to browse. Wallet
  addresses and per-trajectory quality scores are shown publicly.
- **Sellable unit (future):** the **mission (task)**. A dataset = all stored
  trajectories for one `mission_id`. The task-detail page is therefore the
  future product page.
- **Build approach:** Approach A — Next.js server components (same pattern as
  `src/app/missions/page.tsx`: `force-dynamic`, Supabase server client, public
  anon RLS read), with Postgres views for the aggregations.

## 3. Screens

### 3.1 `/explore` — Catalog index

- **Consistent metric definitions (used identically everywhere — header, table, detail):**
  - *Trajectory / DATA count* = `count(mission_attempt_logs WHERE trajectory_path IS NOT NULL)` ("stored": qualified, score ≥ `trajectory_min_score`).
  - *Avg Score* = `avg(quality_score)` over **finalized** logs (`quality_score IS NOT NULL`, i.e. `status <> 'running'`) — same population as the histogram, so they reconcile. (Includes low scores, like Axis.)
- **Stats header (4 cards):**
  - Total Tasks — `count(missions)`
  - Total Trajectories — stored-trajectory count (def. above)
  - Contributors — `count(distinct user_id)` over finalized logs
  - Avg Score — def. above (all missions)
- **Daily collection chart:** last 14 days, trajectories per day by `completed_at::date`.
- **Breakdown panel:** BY DIFFICULTY (`easy/medium/hard/expert` — real data we
  have; replaces Axis's "BY SCENARIO" which we lack) plus BY SKILL (derived).
- **Task table:** columns `# (short id) · TASK (title) · DIFFICULTY · SKILLS
  (derived chips) · AVG SCORE · DATA (collected / target) · LAST ACTIVE
  (relative)`. Title search, difficulty/skill filter, sort by score or data,
  pagination.

### 3.2 `/explore/[missionId]` — Task detail (= future product page)

- Breadcrumb `Explore / <title>`, title, difficulty chip, derived atomic-skill chips.
- **Stat cards:** Trajectories `collected / target` with progress bar · Avg
  Score · Time Limit / Par Time. (Axis's Asset/Spatial Randomization cards are
  **omitted** — we have no augmentation pipeline; no fake metrics.)
- Description (mission `goal`).
- **Score Distribution histogram:** buckets `90-100 / 70-89 / 55-69 / 40-54 /
  <40` of `quality_score` over this mission's finalized logs (same population
  as Avg Score), shown with percentages.
- **Trajectory data table:** `# (log short id) · OPERATOR (wallet
  display_name, else 0xab..cd) · SCORE (quality_score) · DATA ("Stored" badge
  when trajectory_path present) · TIME (relative completed_at)`. Filter
  Stored/All, operator search, pagination.

## 4. Data layer (SQL views, anon-selectable)

- `explore_totals` — single-row header totals.
- `explore_daily` — date, trajectory_count for last 14 days.
- `mission_explore_rows` — per mission: id, title, difficulty,
  success_conditions (skills derived in app), trajectory_count, avg_score,
  last_active, target_trajectories.
- `mission_score_histogram` — per mission: bucket, count.
- Trajectory list: direct paginated query `mission_attempt_logs` LEFT JOIN
  `wallet_users` (no view needed; needs pagination params).

RLS: views expose only already-public aggregate/log data; anon SELECT granted
consistent with existing public mission read.

## 5. Skill derivation (app-side, no schema change)

Pure helper over `mission.success_conditions` condition `type`:

| condition type | skill label |
|---|---|
| position | Place |
| held | Grasp |
| stackedOn | Stack |
| orientation | Rotate |
| atRest | Settle |
| distance | Move |

Dedupe, stable order. Lives near `src/lib/missions/types.ts`.

## 6. Schema additions (additive, non-breaking — sale-ready)

- `missions.scenario text NULL` — optional category; Explore renders "—" when null.
- `missions.target_trajectories int NOT NULL DEFAULT 1000 CHECK (> 0)` —
  dataset target/quota; defines a sellable dataset's target size and powers
  the `collected / target` progress.

Applied via Supabase migration. No backfill needed (defaults cover existing 6
rows).

## 7. Explicitly out of scope (documented future extensions)

- Sales/marketplace: `mission_datasets`, license, price, buyer/order tables,
  download/export, payments. The per-mission dataset is already addressable as
  `mission_id` + stored trajectories, so this is additive later.
- Data augmentation pipeline and on-chain verification ("verified" is
  represented honestly as "Stored": `trajectory_path` present, i.e.
  `quality_score >= xp_settings.trajectory_min_score`, default 70).

## 8. Non-functional / conventions

- Dark theme, Manrope, existing color tokens; mirror `src/app/missions/page.tsx`.
- Server components + Supabase server client + `force-dynamic`.
- New top-nav entry "Explore".
- Graceful empty states (currently 6 missions, ~0 stored trajectories); UI
  must read correctly at zero and fill as plays accrue.
- All new strings/comments in English (project rule).

## 9. Success criteria

- `/explore` and `/explore/[missionId]` render publicly without login.
- Numbers reconcile with DB (totals, per-mission avg/count, histogram, daily).
- Skills correctly derived from conditions; difficulty filter/sort/search work.
- Zero-data state renders cleanly (no NaN/empty crashes).
- No fabricated metrics; schema additions are additive and migration-safe.
