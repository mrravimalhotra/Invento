# Opening stock before go-live — plan for discussion

Draft 3 Oct 2026. Covers FB-0054 and B4. Nothing is built yet; the open decisions in section 5 settle the design.

## 1. The problem

On go-live day the stores already hold raw material, packaging material and finished product. The app starts at zero, so none of it can be issued, composed, packed or shown in a report until it is entered. Today the only way to add stock is a Purchase Order, which was never meant for this.

## 2. How stock enters the app today

| Type | How it enters | Gate before use | Why this does not fit opening stock |
|---|---|---|---|
| Raw material | Purchase line on a PO; the stock appears when the PO is Final Submitted | Needs a QC record (AR number, two review rounds) before it can be consumed | Needs a vendor, invoice and PO per batch; the sample quantities are pulled again; every batch would go through QC a second time; the FIFO order follows the entry time, not the real receipt date |
| Packaging | Purchase line on a PO | None | Same PO overhead, otherwise simple |
| Finished product | Pushed to stock only when the QC Reviewer approves a batch that was composed in the app; packaged stock is pushed when it is packed | QC approval | A batch that was made in the old system has no components, no BMR, no yield record, so it cannot be created through the normal path |

## 3. Proposed design

Opening stock gets its own controlled path that writes to the same inventory ledger, so Stock Position, the RM Report, FIFO, labels, retest alerts and the Dashboard all work without special cases. Every opening batch is marked as opening, dated on the day of the load, and cannot be mistaken for a purchase.

1. **One Excel template per type** (Raw material, Packaging, Finished product), in the existing Bulk upload area, with the same all-or-nothing validation and row-by-row error list. Codes come from the Item Master, so Items (and approved MFRs for finished product) must be loaded first.
2. **Draft, review, finalize.** An upload creates a draft opening list. Nothing touches stock until a System Administrator clicks Finalize, the same idea as Final Submit on a PO. A draft can be cleared and re-uploaded. After Finalize the screen locks.
3. **Opening Stock Register.** A screen and an Excel/PDF export of everything loaded (item, batch, quantity, unit, status, dates, total value), to sign against the physical stock count.
4. **Raw material rows** carry: item code, batch number (as it is on the container), quantity in stock now, unit, receipt date, vendor (optional), unit price (optional), manufacturer expiry date, and a QC status per row: Approved (with the old AR number and retest date), Pending QC (the batch goes to the QC queue like a new purchase) or Rejected/Quarantine (kept out of usable stock). An Approved row creates a closed QC record marked opening, so retest, expiry, FIFO, labels and COA behave as for any other batch.
5. **Packaging rows** carry: item code, quantity, unit, receipt date, vendor and price (optional). No QC.
6. **Finished product rows** carry: product (MFR/FP code), batch number, bulk quantity still unpacked, packs in stock, pack size, manufacture date, expiry date, and the AR number and QC status. They create an opening finished-product batch with no composition, so it appears in the Finished Product list, bulk can be packed, packaged stock can be issued, and it is labelled opening.
7. **FIFO and dates.** Opening batches are ordered by their real receipt date, so oldest stock is used first across opening and new purchases.
8. **Controls.** System Administrator only; one opening load per item (a second one is refused); full audit trail; a reconciliation line at Finalize (rows, quantities and value per type) so nothing is loaded blind.

## 4. Build order

1. Design sign-off (this discussion).
2. Raw material and packaging: migration, upload, draft and Finalize, Opening Stock Register, tests.
3. Finished product: opening batches and packaged stock.
4. Rehearsal: load a real sample in the staging environment (B40) and compare with a physical count.
5. Go-live loading, after the test data is purged and the masters are loaded.

## 5. Decisions (Ravi, 3 Oct 2026)

1. **Raw material QC status:** per row, Approved (with old AR number, retest date, expiry), Pending QC (goes to the QC queue) or Rejected (kept out of usable stock).
2. **Finished product:** packaged stock and unpacked bulk, so packing can continue from opening bulk after go-live.
3. **Vendor and unit price:** optional on both, used for stock value where present.
4. **Source:** physical stock count sheet, counted on the cut-off date and entered into the template.

5. **Who loads:** all roles. **Cut-off:** one pre-agreed cut-off for everything, but the app does not store a cut-off date. Loading stays open while testing and the System Administrator closes it manually after the legacy data is entered (Ravi, 3 Oct 2026).
6. **Legacy tagging:** the system must tell new and legacy batches and AR numbers apart. Legacy AR numbers are kept as typed, and a Legacy tag shows next to them.

Design (3 Oct 2026, mockup `opening-stock-design.html` sent to Ravi for approval): the Finalize step is replaced by an open/closed switch. An upload is checked, then loaded in one go. Proposed additions for Ravi to confirm: System Administrator can re-open (audited); System Administrator can undo a load while loading is open and none of its batches has been used; retests already done are carried so the 3-retest limit still holds.

## Status (4 Oct 2026)
- **Part 1 live** (raw material and packaging): commit `4ef09bd`, migration `0100_opening_stock`, live check E33 in the master list. Built as an Admin → Opening Stock page, not a draft/Finalize flow: loads are immediate and all-or-nothing; the System Administrator closes loading by hand, can re-open it, and can undo a load while open if nothing was used.
- **Part 2 live** (finished product, packed and bulk): commit `1d9d49c`, migration `0101_opening_stock_finished_product`, live check E34. A row is one Approved batch with the old AR kept as typed; yield = bulk + packs × pack size; packs are one Store packaging entry dated at the QC approval date; bulk stays on the batch for later packing. Undo refused once packs are issued, new packaging is done, or a COA exists.
- Known gaps: Legacy tag not yet on Reports and a few secondary lists; a reopened opening-stock purchase order can still be edited like any other.
