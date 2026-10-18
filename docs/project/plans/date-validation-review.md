---
title: Date validation review — screen, field, recommendation
---

# Date validation review (3 Oct 2026)

Replaces A24 / FB-0055. For Ravi's review; nothing built. "Today" = India date; past dates allowed unless a relation forbids; new saves only.

| # | Screen | Field | Recommendation | Decision needed |
|---|---|---|---|---|
| 1 | Purchase › New purchase order (/purchase/new) | Invoice date | Not later than today. Past dates allowed. | Decide: any limit on how far back? I suggest none. |
| 2 | Purchase › Purchase line (/purchase/[id]) | Expiry date (new, from FB-0058) | If you want it added: later than the invoice date and later than today. | Decide: add this field at all, required or optional? |
| 3 | Finished Product › New batch (/finished-product/new) | Batch start date | Not in the future, and not before the MFR's approval date. Past dates allowed. | Decide: also limit how far back (e.g. 30 days)? I suggest no. |
| 4 | Finished Product › Complete batch (/finished-product/[id]) | Finish date | Not before the batch start date (already enforced) and not later than today. | — |
| 5 | Finished Product › Complete batch (/finished-product/[id]) | Expiry date | Later than the finish date. Future dates allowed. | Decide: a maximum shelf life (e.g. 5 years) as a typing guard? |
| 6 | Packaging › New issue (/packaging/new) | Issue date | Not later than today (already enforced). Add: not before the QC approval date of the finished-product batch. | Decide: add the approval-date rule? I suggest yes. |
| 7 | Quality Control › Reviewer decision (/qc/[id]) | Retest period (days) | Maximum 180 days per retest and 3 retests (up to 18 months), from FB-0061. | Decide: confirm B45. |
| 8 | Certificate of Analysis › New COA (/coa/new) | Analysis date, Reporting date, Mfg. date, Best before date | Make these read-only: they already come from the QC record and batch. If they stay editable: Mfg ≤ Analysis ≤ Reporting ≤ today, Best before after Mfg. | Decide: lock (suggested) or keep editable with checks? |
| 9 | Equipment › New / Edit (/equipment) | Last calibration date | Not later than today. | — |
| 10 | Equipment › New / Edit (/equipment) | Next calibration due | After the last calibration date. Past dates allowed (shown as overdue). | Decide: allow a past due date? I suggest yes. |
| 11 | Dead Stock › New / Edit (/dead-stock) | Date of purchase | Not later than today. | — |
| 12 | Dead Stock › New / Edit (/dead-stock) | Resolution date | Not before the date of purchase and not later than today. | — |
| 13 | Documents › New document (/documents) | Effective date | No change. Future dates allowed (an SOP can take effect later). | — |
| 14 | Audit Log, Inventory Ledger, Reports (/audit, /inventory, /reports) | From date, To date | From not after To. To not later than today. | — |
| 15 | Inventory › RM Report (/inventory/rm-report) | As on date | Not later than today. | Decide: now, or after C1 (the report still shows today's figures)? |
| 16 | Bulk Upload (/bulk-upload) | Invoice date, Last / Next calibration date, Date of purchase, Resolution date | Same rule as the matching screen above, checked row by row; the error names the row. | — |
| 17 | System-set dates (no typing) (—) | QC checker and reviewer time, COA issued time, Re-Test Date on a purchase line, Environmental Control and Line Clearance time | No change. | — |
