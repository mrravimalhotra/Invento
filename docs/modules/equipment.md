# Module 17 — Instrument / Equipment Master

Not part of the original 15-module baseline. Requested per the
open-requirements-log gap analysis (12-13 Sept 2026): spec.md lists
"Equipment | Instrument ID, Name, Room No, Section, Calibration Status" as a
key master-data entity with no equivalent anywhere in the schema; Software
Point.docx separately lists "Instrument ID | Name of instrument and ID no"
under Master data. Migration: `0034_equipment_master.sql`.

## Screens
- `/equipment` — add-form-and-list combined screen (same pattern as Vendor
  Master), sorted by Room, then Equipment code. Columns: Code, Name, Room,
  Section, Asset ID, Qty, Calibration. Searchable across all of them.
- `/equipment/[id]` — edit screen; read-only fallback for users without
  write access.

## Data
`equipment(equipment_code, name, room_no, section, asset_id,
quantity, calibration_status, last_calibration_date,
next_calibration_due, active)`. `equipment_code` is auto-generated
(`EQ-0001...`) via `get_next_equipment_code()`/`peek_next_equipment_code()`,
same non-consuming-preview pattern as Vendor/Item Master.

`calibration_status` is one of `calibrated` / `due` / `not_applicable` —
this field has no equivalent anywhere in the source data (it's a
spec.md-only ask) and starts null on every row; it's meant to be filled in
going forward, not backfilled from history that doesn't exist.

## Seed data
Seeded from the real legacy inventory: "ROOM WISE INSTRUMENT AND EQUIPMENT
ID DEC 2023 FINAL.xlsx" — 304 rows across 13 rooms/sections plus a
"Common" area. Only Sheet1 of that workbook was used: Sheet2 is a
near-duplicate of Room 7 (skipped), and Sheet3 is an unrelated
raw-material/vendor purchase list that appears to have landed in the same
workbook by mistake (skipped, not equipment data).

Per Ravi (13 Sept 2026), this source data is for reference only, not
production-critical, so the source sheet's two-level "type + individually
tagged unit" structure (e.g. one "Wooden Barrels" entry expanding into 15
separately tagged physical barrels) is deliberately flattened to one row
per line in the sheet: a bare count with no tag becomes one row with that
quantity; a tagged physical unit becomes its own row with quantity 1. 274
of the 304 seeded rows carry an `asset_id` (the existing printed/engraved
tag, e.g. `ANHC/QC/07/205(B1)`); the remaining 30 are bare-count entries
with no individual tag (e.g. "Silica crucible — 2"). Renamed from
`legacy_asset_id` to `asset_id` 14 Sept 2026 (Ravi:
`0040_rename_equipment_asset_id.sql`) — the column is meant to hold both
legacy and newly assigned tags going forward, not just legacy ones, and
the app's own UI had already been calling it "Asset ID" everywhere; this
brought the DB column, code, and bulk-upload template header in line with
that. Pure rename, no data change — every existing value (including these
274 rows) was preserved exactly.

## Role / access
Write gated to `system_admin`, `inventory_manager`, `mfr_manager`,
`quality_checker`, `qc_reviewer` — broader than the plain master-data
default, per Ravi's 13 Sept 2026 decision: equipment lives across QC and
production rooms alike, and calibration status is itself a QC concern.
Enforced via `canWrite(user.roles, "equipment")` and by RLS
(`equipment_insert`/`equipment_update`). Delete is split out and kept
admin-only (`equipment_delete`), matching the convention set in
`0009_master_data_delete_policy.sql` for every other master-data table.
Read is open to any signed-in user.

## Not done in this pass
- No barcode/QR generation for equipment tags (Item Master's barcode
  feature is a separate, item-specific mechanic, not reused here).
- No calibration-due alert on the Dashboard — `calibration_status`/
  `next_calibration_due` exist to be set, but nothing currently surfaces
  an equipment item that's due, unlike RM's "Retest due soon" card.
