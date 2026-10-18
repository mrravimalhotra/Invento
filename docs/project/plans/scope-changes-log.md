# Invento — scope changes against the original requirement files

Method (2 Oct 2026): the original files in the "Invento Requ" folder were re-read in full — spec.md, Software Point.docx, Screens.xlsx, Screens v3 (v1/v2 checked for differences), the pitch deck (Invento - Draft v1.pptx) and the handwritten department list (photo IMG-…0037) — and compared with the app on `main` (172438d) using the module documents and the master list. Not re-read this time: the label templates, the STP/SOP examples and the other 36 legacy screen photos (covered by the earlier gap analysis), and the two "Software queries" workbooks (damaged in transfer; they look like copies of Screens.xlsx).

Sources: SP = Software Point · SPEC = spec.md · S3 = Screens v3 · DECK = pitch deck · HW = handwritten list.

## A. Built differently from what the requirements said, or where they were unclear
| # | Requirement (source) | What was built / decided |
|---|---|---|
| 1 | Retest popup every 6 months for RM in stock (SP, SPEC); retest date = approval + 1 year (S3) | Retest period entered per batch at QC approval; Dashboard cards for retest due within 90 days (RM and FP); full "Start Retest" workflow using the reserved stability sample |
| 2 | QC states In Process → Under Test → Approved/Rejected, reviewer Confirm/Modify (S3) | Two rounds only (Submitted → Approved/Rejected); decision recorded |
| 3 | AR number like ARN001140424 (S3) | AR-NNN-DDMMYYYY; never decided |
| 4 | Batch no. "manual entry or auto-generated" (S3); item expiry on the purchase line (S3) | Auto only (RM-01/26); expiry replaced by Re-Test Date, hidden for packaging |
| 5 | Issue finished product to Production / R&D / Store with pack size and bottles, deduct packaging material (SP) | Bulk finished product converts into a separate packaged item with its own stock and ledger; Production issues become production raw material with full QC and RM Intimation (FB-0043); up to 30 lines per save, issue date |
| 6 | Completing a batch deducts packaging material (SPEC) vs packaging deducted when issuing (SP) | Deducted at the Packaging issue |
| 7 | FIFO "should follow" for RM (SP) | Enforced as a hard rule in the database |
| 8 | BMR entry key, access to QC and Production (SP); Batch Manufacturing Record as a module (DECK, HW) | Built as a module, then deprecated (16 Sept); the BMR Word document on the Finished Product screen is what stays |
| 9 | Line clearance, environmental control with master entry (HW) | Built, then moved to Admin and marked deprecated (22 Sept) |
| 10 | Barcode for all products (HW) | Barcode field and printed Code128 only; no scanning |
| 11 | Item category Asava / Arishta / Churna (SPEC); Herbal / Avaleha types (S3) | Item Type Master; finished-product and packaged items are created automatically from an approved MFR |
| 12 | RM, FP, COA, in-process test report (SP) | RM and FP COA built as structured records with templates per Item Type; in-process test report not built |
| 13 | Notification for low stock and shelf life (SP, HW) | Dashboard cards, not pop-ups or messages |
| 14 | Intimation saved as Word, PDF and Excel (SP); "PDF format creation" per module (HW) | PDF everywhere, Excel on list screens; purchase intimation is PDF only |
| 15 | Department-wise login, hierarchy access (SP) | Six fixed roles enforced in the database |
| 16 | Backup after 7 days; access around campus only (SP); "regular backups" (DECK) | Cloud-hosted (Vercel + Supabase), reachable from anywhere; backup policy not set |

## B. Built with no basis in the original files
| # | Addition |
|---|---|
| 17 | Draft / submit / reopen purchase-order workflow with stock reversal; admin-only delete across masters |
| 18 | Complete audit trail on all business tables and an Audit Log screen (SPEC asked only for status changes) |
| 19 | Account security: sign-up closed, admin-created accounts, disable leavers, last-admin and self-demotion protection, 10-character passwords, security headers |
| 20 | Rules enforced in the database: QC gate, no negative stock, workflow-state guards |
| 21 | One stock unit per item with automatic conversion; quantities to 3 decimals; India time; dd-mm-yyyy |
| 22 | Bulk Data Upload (8 modules), legacy data import, "Hide legacy data" switch, Purge Test Data |
| 23 | Stock Position, running balance, ledger filters, Finished Product in the ledger |
| 24 | Four Reports registers, Excel/PDF export on every list, one company identity on printouts |
| 25 | Tester Feedback module (tickets FB-0001 to FB-0053), User Guide, per-screen tab titles |
| 26 | Usability: searchable dropdowns, success/failure notice on every action, plain-language errors, forms keep entries after a failed save |
| 27 | Phone menu and install on home screen |
| 28 | Batch numbering: FP-00001-01/26 with yearly reset, short PR-/OR- number (labels, now screens and downloads), RM-001 codes |
| 29 | Rules from tester feedback: Unit mandatory (RM, Packaging), Item Type mandatory (RM), wastage needs a batch, R&D sample optional, `count` renamed `nos`, "Analytical Report No." wording |
| 30 | MFR: versioning built then turned off; editable only before approval |
| 31 | COA template upload and per-Item-Type templates (per-item templates requested, FB-0053, undecided) |

## C. Asked for in the originals but not built (scope reductions)
Staff information (SP, SPEC, S3) · Control Sample Qty for packaging items (SP) · Purchase restricted to the Production In-charge (SP) · In-process test report (SP) · Barcode scanning (HW) · SOP/STP as a workflow (SP; a link register exists) · Campus-only access and 7-day backup (SP) · Word/Excel purchase intimation (SP) · "Calculations on specific form" (HW 32, "not clear yet").
Note: Instrument/Equipment Master with calibration status and the Dead Stock Register (25% depreciation) are built (after the 26 Aug gap analysis listed them as missing).
