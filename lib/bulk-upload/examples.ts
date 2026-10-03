// The example rows each downloadable template ships with, one array per data
// sheet. They live here (not inside templates.ts) so the upload can recognise
// an untouched example row and skip it — ACC-23 (29 Sept 2026): the example
// rows sat in the data sheet as ordinary rows, so uploading a template
// without deleting them imported "Ashwagandha Powder", the sample vendor,
// the sample purchase order, and so on as real records.
//
// A row is skipped only when EVERY cell equals the example row's cell, so a
// real record that shares a name with an example is still imported.

export type ExampleKey =
  | "items"
  | "vendors"
  | "item-types"
  | "mfr-recipe"
  | "mfr-procedure"
  | "purchase"
  | "equipment"
  | "dead-stock"
  | "coa-templates";

export const EXAMPLE_ROWS: Record<ExampleKey, string[][]> = {
  items: [["Ashwagandha Powder", "Raw Material", "Powder", "kg", "Withania somnifera", "", ""]],
  vendors: [["Ambadas Vanaushadhalaya", "Pune, Maharashtra", "9800000000", "020-00000000", "vendor@example.com"]],
  "item-types": [["Powder"]],
  // Same A. Jatamansi Tail example, laid out across the two MFR sheets and
  // joined by the repeated MFR Name.
  "mfr-recipe": [
    ["A. Jatamansi Tail", "100", "ltr", "", "Til Taila", "80", "ltr"],
    ["A. Jatamansi Tail", "100", "ltr", "", "Jatamansi", "20", "kg"],
  ],
  "mfr-procedure": [
    ["A. Jatamansi Tail", "Weigh/measure all raw materials at production level (Batch size 100 ltr)", "100", "98", "Cleaning", "Clean and sieve Jatamansi to remove foreign matter"],
    ["A. Jatamansi Tail", "", "", "", "Preparation of Kwath", "Boil Til Taila with Jatamansi as per SOP until moisture content is nil"],
  ],
  purchase: [
    ["Ambadas Vanaushadhalaya", "INV-2026-0091", "2026-09-10", "Raw Material", "Jatamansi", "20", "kg", "0.5", "0.2", "0.1", "", "450", "5"],
    ["Ambadas Vanaushadhalaya", "INV-2026-0091", "2026-09-10", "Packaging Item", "White Cap 28 mm", "500", "nos", "", "", "", "", "3.2", "18"],
  ],
  equipment: [["Analytical Balance", "R-101", "QC Lab", "", "1", "Calibrated", "2026-06-01", "2027-06-01"]],
  "dead-stock": [["Old HPLC Column", "2022-03-15", "1", "12000", "25", "", "0", "0", "", "", ""]],
  "coa-templates": [
    ["RM-001", "Loss on drying", "Not More Than 10 %w/w"],
    ["RM-001", "Total Ash", "Not More Than 5 %w/w"],
    ["FP-00001", "Specific gravity", "0.90 to 0.95"],
  ],
};
