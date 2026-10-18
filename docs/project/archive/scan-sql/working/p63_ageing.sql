-- P6.3: what the Ageing view shows for finished product against the product quantity actually on the packaging issues.
-- Scratch database only. Three approved batches were given a QC record with an expiry date to make them appear.
select a.batch_label, a.remaining_qty as ageing_shows, f.batch_yield, f.packaged_qty as packs_counted,
       (select coalesce(sum(fp_qty_consumed),0) from packaging_issues p where p.finished_product_batch_id = f.id) as product_issued,
       greatest(f.batch_yield - coalesce(f.qc_sample_qty,0) - coalesce(f.stability_qty,0) - coalesce(f.rnd_qty,0)
                - (select coalesce(sum(fp_qty_consumed),0) from packaging_issues p where p.finished_product_batch_id = f.id), 0) as true_left
  from batch_ageing a join finished_product_batches f on f.id = a.batch_id where a.kind = 'fp' order by 1;
