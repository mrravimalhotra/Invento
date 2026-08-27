# Module 12 — Environmental Control

First requested only in the handwritten requirements list photo — invisible
in `Invento-Modular-Requirements.docx` and every other source document.
Cross-reference: `docs/DESIGN.md` §4.12.

## Screens
- `/environmental-control` — list of `environmental_control_readings`,
  sorted newest first. Columns: Area, Temperature (°C), Humidity (%RH),
  Recorded at. Searchable by area.
- `/environmental-control/new` — form: Area (text, required), Temperature
  (numeric, optional), Humidity (numeric, optional).

## Data
`environmental_control_readings(area, temperature, humidity, recorded_by, recorded_at)`
— `recorded_by` set to the signed-in user on insert; `recorded_at` defaults
to `now()`. No edit/detail screen — a point-in-time reading log, same
pattern as Line Clearance.

## Role / access
Write gated to `system_admin`, `quality_checker`, `qc_reviewer`,
`mfr_manager` — enforced via `canWrite(user.roles, "environmental_control")`
(role list already present in `lib/constants/roles.ts`, matching this
module's inline check spec) and by RLS. Read is open to any signed-in user.
