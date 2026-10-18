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
