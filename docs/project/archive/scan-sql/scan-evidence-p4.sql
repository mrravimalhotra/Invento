\set ON_ERROR_STOP off
\pset footer off
reset role;
begin;
insert into purchase_orders (id,po_number,vendor_id,invoice_number,invoice_date) values
 ('00000000-0000-0000-0000-00000000d411','PO-Q1','00000000-0000-0000-0000-0000000000c2','INV-Q1',current_date);
insert into purchase_lines (id,purchase_order_id,item_id,batch_number,quantity,unit,qc_qty,stability_qty,rnd_qty,unit_price,gst_pct) values
 ('00000000-0000-0000-0000-00000000e411','00000000-0000-0000-0000-00000000d411','00000000-0000-0000-0000-0000000000c3','Q1-B1',100,'kg',1,1,0,10,5),
 ('00000000-0000-0000-0000-00000000e412','00000000-0000-0000-0000-00000000d411','00000000-0000-0000-0000-0000000000c3','Q1-B2',100,'kg',1,1,0,10,5),
 ('00000000-0000-0000-0000-00000000e413','00000000-0000-0000-0000-00000000d411','00000000-0000-0000-0000-0000000000c3','Q1-B3',100,'kg',1,1,0,10,5);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select t_ok('submit PO', $q$select submit_purchase_order('00000000-0000-0000-0000-00000000d411')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
\echo === A: QC record with sample 9999 'bogus' (batch has 1 kg sample)
select t_ok('A insert QC sample_qty 9999 unit bogus', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-00000000f411','AR-Q1','00000000-0000-0000-0000-00000000e411','00000000-0000-0000-0000-0000000000c3',9999,'bogus')$q$);
select t_ok('A2 insert QC (B2) normal', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-00000000f412','AR-Q2','00000000-0000-0000-0000-00000000e412','00000000-0000-0000-0000-0000000000c3',1,'kg')$q$);
select t_ok('A3 insert QC (B3) normal', $q$insert into quality_checks (id,ar_number,purchase_line_id,item_id,sample_qty,sample_unit) values ('00000000-0000-0000-0000-00000000f413','AR-Q3','00000000-0000-0000-0000-00000000e413','00000000-0000-0000-0000-0000000000c3',1,'kg')$q$);
\echo === B: Round 1 REJECT with no comment (B2) 
select t_ok('B round 1 reject, no comment', $q$update quality_checks set status='rejected', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-00000000f412'$q$);
\echo === C: Round 1 approve then Round 2 REJECT with no comment (B3)
select t_ok('C1 round 1 approve (B3)', $q$update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-00000000f413'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('C2 round 2 reject, no comment', $q$update quality_checks set status='rejected', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now() where id='00000000-0000-0000-0000-00000000f413'$q$);
\echo === D: Round 1 approve (B1) then Round 2 approve with retest 400 days and NO expiry date
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('D1 round 1 approve (B1)', $q$update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where id='00000000-0000-0000-0000-00000000f411'$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('D2 round 2 approve: retest 400 days, no expiry', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=400 where id='00000000-0000-0000-0000-00000000f411'$q$);
reset role;
select 'QC rows: ' || string_agg(ar_number||':'||status||' retest='||coalesce(retest_date::text,'-')||' expiry='||coalesce(expiry_date::text,'-')||' sample='||coalesce(sample_qty::text,'-')||coalesce(sample_unit,''), '; ') from quality_checks where ar_number like 'AR-Q%';
select 'batch status: ' || string_agg(pl.batch_number||'='||s.qc_status, ', ') from purchase_batch_status s join purchase_lines pl on pl.id=s.purchase_line_id where pl.batch_number like 'Q1-%';
rollback;

-- ## P4.2 expired batch retested and re-approved with a later expiry (scanx copy, no surrounding transaction)
\set ON_ERROR_STOP off
\pset footer off
reset role;
update opening_stock_settings set is_open = true where not is_open;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false);
select load_no from load_opening_stock('raw', '[{"item_id":"00000000-0000-0000-0000-0000000000c3","batch_number":"OLD-EXP-42","quantity":10,"receipt_date":"2024-01-10","expiry_date":"2025-01-10","unit_price":null,"gst_pct":null,"qc_status":"approved","old_ar":"OLD-AR-42","approval_date":"2024-01-20","retest_date":"2026-06-01","retests_done":0}]'::jsonb);
\echo === A: batch expired in Jan 2025, retest date passed. Start a retest anyway
select t_ok('A start_retest on an EXPIRED batch', $q$select start_retest((select id from purchase_lines where batch_number='OLD-EXP-42'), null, 0.5, 'kg')$q$);
reset role;
select 'retest QC record: ' || count(*) from quality_checks q join purchase_lines pl on pl.id=q.purchase_line_id where pl.batch_number='OLD-EXP-42' and q.is_retest;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
select t_ok('B round 1 approve retest', $q$update quality_checks set status='checker_approved', checker_by='00000000-0000-0000-0000-0000000000a4', checker_at=now() where is_retest and purchase_line_id=(select id from purchase_lines where batch_number='OLD-EXP-42')$q$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a5',false);
select t_ok('C round 2 approve with expiry two years AFTER the original expiry (2027-06-01)', $q$update quality_checks set status='approved', reviewed_by='00000000-0000-0000-0000-0000000000a5', reviewed_at=now(), retest_period_days=180, expiry_date='2027-06-01' where is_retest and purchase_line_id=(select id from purchase_lines where batch_number='OLD-EXP-42')$q$);
reset role;
select 'batch status after: ' || s.qc_status || ' retest=' || coalesce(s.retest_date::text,'-') || ' expiry=' || coalesce(s.expiry_date::text,'-') from purchase_batch_status s join purchase_lines pl on pl.id=s.purchase_line_id where pl.batch_number='OLD-EXP-42';
select 'usable now: ' || usable from item_stock_status where item_id='00000000-0000-0000-0000-0000000000c3';

-- ## P4.3 AR number used up by a rolled-back transaction (scanq)
\set ON_ERROR_STOP off
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
begin;
select 'inside a transaction that is rolled back: ' || get_next_ar_number();
rollback;
select 'next call after the rollback: ' || get_next_ar_number();

-- ## P4.4 certificate saved as sent; second certificate; update and delete (scanq)
\set ON_ERROR_STOP off
\pset footer off
reset role;
select 'approved current QC: ' || q.ar_number || ' id=' || q.id from quality_checks q join purchase_lines pl on pl.id=q.purchase_line_id where pl.batch_number='OLD-EXP-42' and q.is_retest and q.status='approved';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a4',false);
\echo === A: COA with a wrong batch number, product name, a changed specification and a bogus result
select t_ok('A insert COA 1 (header lies, spec edited)', $q$insert into coa_records (coa_number, quality_check_id, coa_type, header_data, result_lines, remarks, issued_by) select get_next_coa_number(), q.id, 'raw_material', '[{"label":"Batch No","value":"SOMETHING-ELSE"},{"label":"Product","value":"Not this item"}]'::jsonb, '[{"seq":1,"test":"Assay","specification":"NLT 1%","result":"99%"}]'::jsonb, 'ok', '00000000-0000-0000-0000-0000000000a1' from quality_checks q join purchase_lines pl on pl.id=q.purchase_line_id where pl.batch_number='OLD-EXP-42' and q.is_retest and q.status='approved'$q$);
\echo === B: a second COA for the same QC record
select t_ok('B insert COA 2 for the same QC', $q$insert into coa_records (coa_number, quality_check_id, coa_type, header_data, result_lines, remarks, issued_by) select get_next_coa_number(), q.id, 'raw_material', '[]'::jsonb, '[]'::jsonb, '', null from quality_checks q join purchase_lines pl on pl.id=q.purchase_line_id where pl.batch_number='OLD-EXP-42' and q.is_retest and q.status='approved'$q$);
\echo === C: change or remove an issued COA
select t_ok('C update COA remarks', $q$update coa_records set remarks='changed' where true$q$);
select t_ok('D delete COA', $q$delete from coa_records where true$q$);
reset role;
select 'COA rows now: ' || count(*) || '; remarks values: ' || coalesce(string_agg(distinct remarks, ','),'-') || '; issued_by: ' || coalesce(string_agg(distinct issued_by::text, ','),'-') from coa_records;

/* ## P4.4 PDF layout measurements (node script p44_coa_pdf.mjs, uses node_modules/jspdf of the repo):
import { jsPDF } from "/home/claude/invento-app/node_modules/jspdf/dist/jspdf.node.min.js";
import autoTableMod from "/home/claude/invento-app/node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.mjs";
const autoTable = autoTableMod.default ?? autoTableMod;
const doc = new jsPDF();
doc.setFontSize(9); doc.setFont("helvetica","normal");
const samples = [
 ": Ashwagandha Root Extract (10:1) Withanolides 5%",
 ": Boswellia Serrata Gum Resin Extract 65% Boswellic Acids",
 ": 25 kg in HDPE drum, 3 drums sampled from each",
 ": FP-BATCH-0045-12/26 (SHORT 0045)",
];
const avail = 91 - 38;  // left column value width (mm) before it meets the right column
for (const s of samples) console.log(doc.getTextWidth(s).toFixed(1)+" mm", s.length+" chars", doc.getTextWidth(s) > avail ? "OVERFLOWS into right column" : "fits", "(room "+avail+" mm)");
// bottom of page: how many tests until signature lines fall off the page?
for (const n of [8, 14, 18, 22, 26]) {
  const d = new jsPDF(); const y = 100;
  autoTable(d, { startY: y, head:[["S.N.","Test","Result","Specification"]], body: Array.from({length:n},(_,i)=>[String(i+1),"Heavy metals - Lead (Pb)","< 1 ppm","NMT 10 ppm"]),
    styles:{fontSize:8.5,cellPadding:2.5}, columnStyles:{0:{cellWidth:12},1:{cellWidth:45},2:{cellWidth:45},3:{cellWidth:"auto"}} });
  const fy = d.lastAutoTable.finalY; const pages = d.getNumberOfPages(); const pageH = d.internal.pageSize.getHeight();
  const sigY = fy + 8 + 5 + 16; // remarks one line + 16 gap
  console.log(n+" tests: table ends at "+fy.toFixed(0)+" mm on page "+pages+"; signature line at "+sigY.toFixed(0)+" mm; page height "+pageH.toFixed(0)+" ->", sigY > pageH-10 ? "SIGNATURE LINES OFF THE PAGE" : "fits");
}

*/

/* ## P4.5 label text fit (TypeScript, run with the repo's tsx; imports the real buildRmLines):
import { jsPDF } from "/home/claude/invento-app/node_modules/jspdf";
import { CARLITO_BOLD_TTF_BASE64 } from "/home/claude/invento-app/lib/fonts/carlito-bold";
import { buildRmLines } from "/home/claude/invento-app/app/(dashboard)/labels/generate-label-pdf";
const doc = new jsPDF({ unit: "mm", format: "a4" });
doc.addFileToVFS("Carlito-Bold.ttf", CARLITO_BOLD_TTF_BASE64);
doc.addFont("Carlito-Bold.ttf", "Carlito", "bold");
doc.setFont("Carlito", "bold");
const cases: Record<string,string> = {
 name_short: "Ashwagandha Root",
 name_med: "Ashwagandha Root Extract 10:1 Standardised Withanolides 5%",
 name_long: "Boswellia Serrata Gum Resin Extract Standardised to 65% Boswellic Acids by HPLC (Organic)",
 vendor_long: "Shree Ganesh Herbal Agro Processing and Export Private Limited, Pune",
 invoice_long: "INV/2026-27/MH/0004567/REV-B",
};
function run(label: string, fields: {label:string; value:string|null}[]) {
  const lines = buildRmLines(fields, doc);
  for (const l of lines) { const t = l.runs.map(r=>r.text).join(""); if (/…/.test(t)) console.log(label, "TRUNCATED:", t, "@", l.runs.map(r=>r.sizePt).join("/")+"pt"); else if (l.runs.some(r=>r.sizePt<11 && l.yMm>25)) console.log(label, "shrunk:", t, "@", l.runs.map(r=>r.sizePt).join("/")+"pt"); }
}
const base = (name: string, vendor="Atharva Supplier", inv="INV-1") => [
 {label:"Name", value:name},{label:"Status", value:"Approved"},{label:"Batch No.", value:"RM-00031-0012/26"},{label:"Batch Quantity", value:"1250.5 kg"},
 {label:"Purchased From", value:vendor},{label:"Invoice/Ch. No.", value:inv},{label:"Date of Receipt", value:"10 Oct 2026"},{label:"Retest Period", value:"180 days"},{label:"Expiry Date", value:"10 Oct 2028"},{label:"Sign", value:null}];
run("short", base(cases.name_short));
run("med", base(cases.name_med));
run("long", base(cases.name_long));
run("vendor", base(cases.name_short, cases.vendor_long));
run("invoice", base(cases.name_short, "Atharva Supplier", cases.invoice_long));

*/
