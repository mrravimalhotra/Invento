-- HISTORICAL. Do not run on the live database.
-- One-off read-only impact check for the 28 Sept 2026 accuracy audit (ACC-01 to ACC-19).
-- It returned 0 for every indicator on 29 Sept 2026 (all data was test data).
-- It no longer runs: the ACC-05 line reads packaging_issues.transaction_type, which migration 0079 dropped.
-- Kept for the record. The current checks are in scripts/sql/live-data-checks.sql.
--
-- Original text follows.
-- Invento: read-only impact check for the 28 Sept 2026 accuracy audit.
-- Changes nothing. Run in the Supabase SQL Editor and send a screenshot of the result.
with
reopen_pulls as (
  select purchase_line_id, count(*) as n
  from inventory_ledger
  where event_type = 'pull' and reference_type = 'purchase' and reference_id = purchase_line_id
  group by purchase_line_id
),
on_hand as (
  select item_id,
         sum(case when event_type = 'push' then quantity else -quantity end) as qty
  from inventory_ledger group by item_id
),
latest_qc as (
  select distinct on (purchase_line_id) purchase_line_id, status, retest_date
  from quality_checks where purchase_line_id is not null
  order by purchase_line_id, created_at desc
)
select * from (values
 ('ACC-01', 'Purchase lines reopened 2+ times (stock reversed twice)',
   (select count(*) from reopen_pulls where n >= 2)),
 ('ACC-01', 'Purchase orders affected by the above',
   (select count(distinct pl.purchase_order_id) from reopen_pulls r join purchase_lines pl on pl.id = r.purchase_line_id where r.n >= 2)),
 ('ACC-01/06', 'Items with NEGATIVE stock on hand',
   (select count(*) from on_hand where qty < 0)),
 ('ACC-02', 'Ledger rows whose unit differs from the item''s unit',
   (select count(*) from inventory_ledger l join items i on i.id = l.item_id where l.unit is not null and l.unit <> i.unit)),
 ('ACC-02', 'Items with at least one such ledger row (stock figure suspect)',
   (select count(distinct l.item_id) from inventory_ledger l join items i on i.id = l.item_id where l.unit is not null and l.unit <> i.unit)),
 ('ACC-02', 'Purchase lines entered in a different unit from the item',
   (select count(*) from purchase_lines pl join items i on i.id = pl.item_id where pl.unit <> i.unit)),
 ('ACC-03', 'MFR recipe lines in a different unit from the item',
   (select count(*) from mfr_lines ml join items i on i.id = ml.item_id where ml.unit <> i.unit)),
 ('ACC-04', 'FP batches whose unit differs from their MFR batch-size unit',
   (select count(*) from finished_product_batches b join mfr_definitions m on m.id = b.mfr_definition_id where b.unit <> m.batch_size_unit)),
 ('ACC-02', 'Packaging material lines in a different unit from the item',
   (select count(*) from packaging_issue_items pi join items i on i.id = pi.item_id where pi.unit <> i.unit)),
 ('ACC-05', 'Packaging issues recorded as Unpack or Repack',
   (select count(*) from packaging_issues where transaction_type in ('unpack', 'repack'))),
 ('ACC-06', 'FP components taken from a batch whose PO is now a draft',
   (select count(*) from finished_product_components c join purchase_lines pl on pl.id = c.purchase_line_id where pl.pushed_at is null)),
 ('ACC-09', 'Batch numbers used by more than one purchase line',
   (select count(*) from (select batch_number from purchase_lines group by batch_number having count(*) > 1) d)),
 ('ACC-10', 'Approved batches past retest date with no stability sample (stuck)',
   (select count(*) from latest_qc q join purchase_lines pl on pl.id = q.purchase_line_id
     where q.status = 'approved' and q.retest_date <= current_date and coalesce(pl.stability_qty, 0) = 0 and pl.live_remaining_qty > 0)),
 ('ACC-12', 'Packaging issues with no material lines (possible half-saved)',
   (select count(*) from packaging_issues p where not exists (select 1 from packaging_issue_items pi where pi.packaging_issue_id = p.id))),
 ('ACC-17', 'Draft/cancelled FP batches with no components (failed creates)',
   (select count(*) from finished_product_batches b where b.status in ('draft', 'cancelled') and not exists (select 1 from finished_product_components c where c.finished_product_batch_id = b.id))),
 ('ACC-19', 'FP batches packaged/issued beyond their own yield',
   (select count(*) from finished_product_batches b where b.batch_yield is not null
     and (select coalesce(sum(p.fp_qty_consumed), 0) from packaging_issues p where p.finished_product_batch_id = b.id and p.transaction_type = 'pack') > b.batch_yield)),
 ('info', 'Total purchase lines', (select count(*) from purchase_lines)),
 ('info', 'Total items', (select count(*) from items))
) as t(audit_ref, check_name, how_many);
