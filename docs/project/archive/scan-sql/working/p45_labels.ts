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
