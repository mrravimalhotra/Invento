-- committed fixtures for the concurrency tests (scratch database only)
insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values
 ('00000000-0000-0000-0000-00000000c001','PO-C1','00000000-0000-0000-0000-0000000000c2','INV-C1',current_date);
insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values
 ('00000000-0000-0000-0000-00000000c101','00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-0000000000c3','RM-T0001-C1',100,'kg',1,0,0,10,5);
