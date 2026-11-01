// Label sizes, headings and field prefixes shared by the PDF (generate-label-pdf.ts), the
// on-screen previews and the Label Printing page. No jsPDF and no fonts here, so the page can
// open without loading them (React review, 1 Nov 2026). Values moved unchanged.

export type LabelType = "approved_rm" | "under_test" | "inprocess" | "finished_product";

export type LabelField = { label: string; value: string | null };

export const HEADER_TEXT: Record<LabelType, string> = {
  approved_rm: "APPROVED RAW MATERIAL",
  under_test: "UNDER TEST",
  inprocess: "INPROCESS",
  finished_product: "Finished Product",
};

export const RM_PAGE_WIDTH_MM = 210;
export const RM_PAGE_HEIGHT_MM = 297;
export const FPIP_PAGE_WIDTH_MM = 215.9; // US Letter
export const FPIP_PAGE_HEIGHT_MM = 279.4;
export const UT_PAGE_WIDTH_MM = 215.9; // US Legal
export const UT_PAGE_HEIGHT_MM = 355.6;
export const FP_CELL_HEIGHT_MM = 67.03;
export const IP_CELL_HEIGHT_MM = 60.35;

export const FP_FIELD_PREFIX: Record<string, string> = {
  Name: "Name                  :",
  Status: "Status                  :",
  "Batch No.": "Batch No.            :",
  "Batch Quantity": "Batch Quantity   :",
  "Month of Manufacture": "Month of Manufacture:",
  "Best Before": "Best Before          :",
  Sign: "Sign                      :",
};
export const IP_FIELD_PREFIX: Record<string, string> = {
  Name: "Name                  :",
  Status: "Status                  :",
  "Batch No.": "Batch No.            :",
  "Batch Quantity": "Batch Quantity  :",
  "Start Date": "Start Date           :",
  Sign: "Sign                     :",
};

// The previews' on-screen size: a page drawn at a fixed pixel width.
export const RM_PREVIEW_WIDTH_PX = 794;
export const RM_PREVIEW_HEIGHT_PX = RM_PAGE_HEIGHT_MM * (RM_PREVIEW_WIDTH_PX / RM_PAGE_WIDTH_MM);
export const FPIP_PREVIEW_WIDTH_PX = 816;
export const FPIP_PREVIEW_HEIGHT_PX = FPIP_PAGE_HEIGHT_MM * (FPIP_PREVIEW_WIDTH_PX / FPIP_PAGE_WIDTH_MM);
export const UT_PREVIEW_WIDTH_PX = 816;
export const UT_PREVIEW_HEIGHT_PX = UT_PAGE_HEIGHT_MM * (UT_PREVIEW_WIDTH_PX / UT_PAGE_WIDTH_MM);
