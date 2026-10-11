"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, isLegacyCode, formatQty } from "@/lib/utils";
import { ELIGIBILITY_HINT } from "./label-eligibility";
import { searchLabelBatches } from "@/lib/actions/labels";
import { LABEL_RESULT_LIMIT, type RmRecord, type FpRecord } from "./label-types";
import {
  downloadLabelPdf,
  HEADER_TEXT,
  FP_FIELD_PREFIX,
  IP_FIELD_PREFIX,
  FP_CELL_HEIGHT_MM,
  IP_CELL_HEIGHT_MM,
  type LabelField,
  type LabelType,
} from "./generate-label-pdf";
import { RmSheetPreview, RM_PREVIEW_WIDTH_PX, RM_PREVIEW_HEIGHT_PX } from "./rm-sheet-preview";
import { FpIpSheetPreview, FPIP_PREVIEW_WIDTH_PX, FPIP_PREVIEW_HEIGHT_PX } from "./fp-ip-sheet-preview";
import { UtSheetPreview, UT_PREVIEW_WIDTH_PX, UT_PREVIEW_HEIGHT_PX } from "./ut-sheet-preview";

// The Approved Raw Material sheet preview renders at a fixed native size
// (RM_PREVIEW_WIDTH_PX — see rm-sheet-preview.tsx) that's too wide for this
// card, so it's displayed scaled down via a CSS transform on a wrapper
// around the preview rather than shrinking the preview's own layout.
const RM_PREVIEW_DISPLAY_WIDTH_PX = 320;
const RM_PREVIEW_DISPLAY_SCALE = RM_PREVIEW_DISPLAY_WIDTH_PX / RM_PREVIEW_WIDTH_PX;
// Same display-scaling approach for the Finished Product / In-process
// sheet preview (see fp-ip-sheet-preview.tsx).
const FPIP_PREVIEW_DISPLAY_WIDTH_PX = 320;
const FPIP_PREVIEW_DISPLAY_SCALE = FPIP_PREVIEW_DISPLAY_WIDTH_PX / FPIP_PREVIEW_WIDTH_PX;
// Same display-scaling approach for the Under Test sheet preview (see
// ut-sheet-preview.tsx).
const UT_PREVIEW_DISPLAY_WIDTH_PX = 320;
const UT_PREVIEW_DISPLAY_SCALE = UT_PREVIEW_DISPLAY_WIDTH_PX / UT_PREVIEW_WIDTH_PX;

const LABEL_TYPE_OPTIONS: { value: LabelType; label: string }[] = [
  { value: "approved_rm", label: "Approved Raw Material" },
  { value: "under_test", label: "Under Test" },
  { value: "inprocess", label: "In-process" },
  { value: "finished_product", label: "Finished Product" },
];

function monthYear(d: string | null) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function dateOrNull(d: string | null) {
  if (!d) return null;
  return formatDate(d);
}

export function LabelPicker() {
  const [labelType, setLabelType] = useState<LabelType>("approved_rm");
  // SCAN-P4-16 (Ravi, 12 Oct 2026): the batch list is no longer loaded with the
  // page. What is typed here (an item name or a batch number) is sent to the
  // server, which returns the newest eligible batches that match, at most
  // LABEL_RESULT_LIMIT. FB-0024 (7 Sept 2026) was the original name search.
  const [search, setSearch] = useState<string>("");
  const [rmResults, setRmResults] = useState<RmRecord[]>([]);
  const [fpResults, setFpResults] = useState<FpRecord[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  // The chosen batch is kept on its own so a new search does not lose it.
  const [chosenRm, setChosenRm] = useState<RmRecord | undefined>(undefined);
  const [chosenFp, setChosenFp] = useState<FpRecord | undefined>(undefined);
  const requestNo = useRef(0);

  const isFp = labelType === "finished_product";

  // ACC-14: each template is offered only for batches whose current status
  // matches it (see label-eligibility.ts) — the server applies that filter.
  useEffect(() => {
    const myRequest = ++requestNo.current;
    const timer = setTimeout(async () => {
      try {
        const res = await searchLabelBatches(labelType, search);
        if (myRequest !== requestNo.current) return; // a newer search is already running
        setRmResults(res.rm);
        setFpResults(res.fp);
        setMore(res.more);
        setLoadError(res.error ?? null);
      } catch {
        if (myRequest !== requestNo.current) return;
        setLoadError("The batches could not be loaded. Try again.");
      } finally {
        if (myRequest === requestNo.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [labelType, search]);

  const rm = !isFp ? chosenRm : undefined;
  const fp = isFp ? chosenFp : undefined;

  function handleSelect(id: string) {
    setSelectedId(id);
    if (isFp) setChosenFp(fpResults.find((r) => r.id === id));
    else setChosenRm(rmResults.find((r) => r.id === id));
  }

  // The chosen batch stays in the list even when a later search no longer matches it.
  const rmOptions = chosenRm && !rmResults.some((r) => r.id === chosenRm.id) && !isFp ? [chosenRm, ...rmResults] : rmResults;
  const fpOptions = chosenFp && !fpResults.some((r) => r.id === chosenFp.id) && isFp ? [chosenFp, ...fpResults] : fpResults;

  const fields: LabelField[] = useMemo(() => {
    if (labelType === "approved_rm" && rm) {
      return [
        { label: "Name", value: rm.itemName },
        { label: "Status", value: "Approved" },
        { label: "Batch No.", value: rm.batchNumber },
        { label: "Batch Quantity", value: `${formatQty(rm.quantity)} ${rm.unit}` },
        { label: "Purchased From", value: rm.vendorName },
        { label: "Invoice/Ch. No.", value: rm.invoiceNumber },
        { label: "Date of Receipt", value: dateOrNull(rm.receiptDate) },
        { label: "Retest Period", value: rm.retestPeriodDays != null ? `${rm.retestPeriodDays} days` : null },
        { label: "Expiry Date", value: dateOrNull(rm.expiryDate) },
        { label: "Sign", value: null },
      ];
    }
    if (labelType === "under_test" && rm) {
      return [
        { label: "Name of RM/FP", value: rm.itemName },
        { label: "Batch No.", value: rm.batchNumber },
        { label: "Batch Quantity", value: `${formatQty(rm.quantity)} ${rm.unit}` },
        { label: "Purchased From", value: rm.vendorName },
        { label: "Invoice/Ch. No.", value: rm.invoiceNumber },
        { label: "Date of Receipt", value: dateOrNull(rm.receiptDate) },
        { label: "Sign", value: null },
      ];
    }
    if (labelType === "inprocess" && rm) {
      return [
        { label: "Name", value: rm.itemName },
        { label: "Status", value: "IN-PROCESS" },
        { label: "Batch No.", value: rm.batchNumber },
        { label: "Batch Quantity", value: `${formatQty(rm.quantity)} ${rm.unit}` },
        { label: "Start Date", value: null },
        { label: "Sign", value: null },
      ];
    }
    if (labelType === "finished_product" && fp) {
      return [
        { label: "Name", value: fp.productName },
        { label: "Status", value: "Approved" },
        // FB-0044 follow-up: the short print form when this batch has one,
        // falling back to the full batch number for older batches created
        // before short_batch_no existed.
        { label: "Batch No.", value: fp.shortBatchNumber ?? fp.batchNumber },
        { label: "Batch Quantity", value: fp.quantity != null ? `${formatQty(fp.quantity)} ${fp.unit}` : null },
        { label: "Month of Manufacture", value: monthYear(fp.finishDate) },
        // SCAN-P4-13 (Ravi, 12 Oct 2026): the exact expiry date, not a month, so the label never claims more shelf life than QC approved.
        { label: "Best Before", value: dateOrNull(fp.qcExpiryDate ?? fp.expiryMonth) },
        { label: "Sign", value: null },
      ];
    }
    return [];
  }, [labelType, rm, fp]);

  const canDownload = fields.length > 0;
  const batchNumberForFilename = rm?.batchNumber ?? fp?.batchNumber ?? "label";

  function handleTypeChange(next: LabelType) {
    setLabelType(next);
    setLoading(true);
    setSelectedId("");
    setChosenRm(undefined);
    setChosenFp(undefined);
    setRmResults([]);
    setFpResults([]);
  }

  function handleDownload() {
    const safeBatch = batchNumberForFilename.replace(/[^\w.-]+/g, "_");
    downloadLabelPdf(labelType, fields, `label-${labelType}-${safeBatch}.pdf`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="1. Choose label and record" />
        <CardBody className="flex flex-col gap-4">
          <Field label="Label type" htmlFor="label-type" required>
            <Select
              id="label-type"
              value={labelType}
              onChange={(e) => handleTypeChange(e.target.value as LabelType)}
            >
              {LABEL_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Search"
            htmlFor="batch-search"
            hint={
              isFp
                ? "Type part of the product name or the batch number, e.g. Jatamansi. The newest matching batches are listed below."
                : "Type part of the item name or the batch number, e.g. Jatamansi. The newest matching batches are listed below."
            }
          >
            <Input
              id="batch-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setLoading(true);
              }}
              placeholder={isFp ? "Product name or batch number" : "Item name or batch number"}
              autoComplete="off"
            />
          </Field>

          {!isFp ? (
            <Field label="Purchase batch" htmlFor="record" required hint={`Raw material batch, from Purchase. ${ELIGIBILITY_HINT[labelType]}`}>
              <Select id="record" value={selectedId} onChange={(e) => handleSelect(e.target.value)}>
                <option value="">{loading ? "Searching…" : "Select a batch…"}</option>
                {rmOptions.map((r) => (
                  <option key={r.id} value={r.id} data-legacy={isLegacyCode(r.batchNumber) ? "1" : undefined}>
                    {r.batchNumber}{r.isLegacy ? " (Legacy)" : ""} · {r.itemName}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Finished product batch" htmlFor="record" required hint={ELIGIBILITY_HINT.finished_product}>
              <Select id="record" value={selectedId} onChange={(e) => handleSelect(e.target.value)}>
                <option value="">{loading ? "Searching…" : "Select a batch…"}</option>
                {fpOptions.map((r) => (
                  <option key={r.id} value={r.id} data-legacy={isLegacyCode(r.batchNumber) ? "1" : undefined}>
                    {r.batchNumber}{r.isLegacy ? " (Legacy)" : ""} · {r.productName}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {loadError && (
            <p role="alert" className="rounded-md border border-red/40 bg-red-bg px-3 py-2 text-sm text-red">
              {loadError}
            </p>
          )}
          {!loading && !loadError && (isFp ? fpResults.length === 0 : rmResults.length === 0) && (
            <p className="text-sm text-muted">
              {search.trim()
                ? `No batch matching \u201c${search.trim()}\u201d qualifies for this label.`
                : isFp
                  ? "No finished product batch is QC-approved yet."
                  : "No raw material batch currently qualifies for this label."}
            </p>
          )}
          {!loading && more && (
            <p className="text-sm text-muted">
              Showing the newest {LABEL_RESULT_LIMIT} matches. Type more of the name or batch number to narrow the list.
            </p>
          )}

          {rm && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <span>Current QC status:</span>
              <Badge status={rm.qcStatus}>{rm.qcStatus.replace("_", " ")}</Badge>
              {rm.arNumber && <span>Analytical Report No. {rm.arNumber}</span>}
            </div>
          )}
          {fp && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <span>Current FP status:</span>
              <Badge status={fp.status}>{fp.status.replace(/_/g, " ")}</Badge>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleDownload} disabled={!canDownload} className="self-start">
              Download PDF
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="2. Preview" />
        <CardBody>
          {fields.length === 0 ? (
            <div className="flex aspect-[4/3] w-full max-w-sm items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
              Select a batch to preview the label.
            </div>
          ) : labelType === "approved_rm" ? (
            // Approved Raw Material (19 Sept 2026): a dedicated 6-up A4
            // sheet preview matching Ravi's reference template — see
            // rm-sheet-preview.tsx. Every other label type below keeps the
            // original single-label brand-styled preview.
            <div
              className="overflow-hidden rounded-md border-2 border-border shadow-sm"
              style={{ width: RM_PREVIEW_DISPLAY_WIDTH_PX, height: RM_PREVIEW_HEIGHT_PX * RM_PREVIEW_DISPLAY_SCALE }}
            >
              <div style={{ transform: `scale(${RM_PREVIEW_DISPLAY_SCALE})`, transformOrigin: "top left" }}>
                <RmSheetPreview fields={fields} />
              </div>
            </div>
          ) : labelType === "finished_product" || labelType === "inprocess" ? (
            // Finished Product / In-process (19 Sept 2026): same treatment
            // as Approved Raw Material above — a dedicated 6-up US Letter
            // sheet preview matching Ravi's reference templates, see
            // fp-ip-sheet-preview.tsx.
            <div
              className="overflow-hidden rounded-md border-2 border-border shadow-sm"
              style={{
                width: FPIP_PREVIEW_DISPLAY_WIDTH_PX,
                height: FPIP_PREVIEW_HEIGHT_PX * FPIP_PREVIEW_DISPLAY_SCALE,
              }}
            >
              <div style={{ transform: `scale(${FPIP_PREVIEW_DISPLAY_SCALE})`, transformOrigin: "top left" }}>
                <FpIpSheetPreview
                  fields={fields}
                  title={HEADER_TEXT[labelType]}
                  fieldPrefix={labelType === "finished_product" ? FP_FIELD_PREFIX : IP_FIELD_PREFIX}
                  cellHeightMm={labelType === "finished_product" ? FP_CELL_HEIGHT_MM : IP_CELL_HEIGHT_MM}
                />
              </div>
            </div>
          ) : labelType === "under_test" ? (
            // Under Test (19 Sept 2026): same treatment again — a
            // dedicated 10-up US Legal sheet preview matching Ravi's
            // reference template, see ut-sheet-preview.tsx. No label type
            // is left on the original generic single-label preview below
            // any more.
            <div
              className="overflow-hidden rounded-md border-2 border-border shadow-sm"
              style={{ width: UT_PREVIEW_DISPLAY_WIDTH_PX, height: UT_PREVIEW_HEIGHT_PX * UT_PREVIEW_DISPLAY_SCALE }}
            >
              <div style={{ transform: `scale(${UT_PREVIEW_DISPLAY_SCALE})`, transformOrigin: "top left" }}>
                <UtSheetPreview fields={fields} />
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
