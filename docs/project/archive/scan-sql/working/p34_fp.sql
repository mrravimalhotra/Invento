-- processed items: ledger on-hand vs sum of finished-product batch bulk remaining (the figure used by Ageing)
with b as (
  select md.finished_product_item_id item_id,
         sum(greatest(coalesce(fpb.batch_yield,0)-coalesce(fpb.qc_sample_qty,0)-coalesce(fpb.stability_qty,0)-coalesce(fpb.rnd_qty,0)-coalesce(fpb.packaged_qty,0),0)) bulk
    from finished_product_batches fpb join mfr_definitions md on md.id=fpb.mfr_definition_id
   where fpb.active and fpb.status <> 'draft' group by 1)
select i.item_code, round(coalesce(sb.on_hand,0),3) ledger_on_hand, round(b.bulk,3) batch_bulk
  from b join items i on i.id=b.item_id left join stock_balance sb on sb.item_id=i.id
 where abs(coalesce(sb.on_hand,0)-b.bulk) > 0.0005;
