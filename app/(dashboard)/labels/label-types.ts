// Records the Label Printing page works with. Kept apart from the picker
// (a client component) so the search action can build them on the server.

// Most batches listed for one search; "more" is shown when there are more matches.
export const LABEL_RESULT_LIMIT = 50;

export type RmRecord = {
  id: string;
  itemName: string;
  batchNumber: string;
  isLegacy?: boolean;
  quantity: number;
  unit: string;
  vendorName: string;
  invoiceNumber: string;
  receiptDate: string | null;
  qcStatus: string;
  arNumber: string | null;
  retestDate: string | null;
  expiryDate: string | null;
  poSubmitted: boolean;
  retestPeriodDays: number | null;
};

export type FpRecord = {
  id: string;
  productName: string;
  batchNumber: string;
  // FB-0044 follow-up (27 Sept 2026): print-only short form (PR-01/26 /
  // OR-01/26) — printed on the label in place of the long compound batch
  // number. Null for older batches; the label then uses the full number.
  shortBatchNumber: string | null;
  isLegacy?: boolean;
  quantity: number | null;
  unit: string;
  finishDate: string | null;
  expiryMonth: string | null;
  qcExpiryDate: string | null;
  status: string;
};
