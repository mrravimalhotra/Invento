"use client";

import { useMemo, useRef, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber, isLegacyCode } from "@/lib/utils";
import { downloadLabelPdf, type LabelField, type LabelType } from "./generate-label-pdf";
import { RmSheetPreview, RM_PREVIEW_WIDTH_PX, RM_PREVIEW_HEIGHT_PX, loadRmCarlitoFont } from "./rm-sheet-preview";

// The Approved Raw Material sheet preview renders at a fixed native size
// (RM_PREVIEW_WIDTH_PX, chosen for export resolution — see
// rm-sheet-preview.tsx) that's too wide for this card, so it's displayed
// scaled down via a CSS transform on a *wrapper*, not on the ref'd node
// itself — html2canvas captures the ref'd node's own unscaled layout, so
// the JPEG export stays full resolution regardless of this display scale.
const RM_PREVIEW_DISPLAY_WIDTH_PX = 320;
const RM_PREVIEW_DISPLAY_SCALE = RM_PREVIEW_DISPLAY_WIDTH_PX / RM_PREVIEW_WIDTH_PX;

export type RmRecord = {
  id: string;
  itemName: string;
  batchNumber: string;
  quantity: number;
  unit: string;
  vendorName: string;
  invoiceNumber: string;
  receiptDate: string | null;
  qcStatus: string;
  arNumber: string | null;
  retestPeriodDays: number | null;
};

export type FpRecord = {
  id: string;
  productName: string;
  batchNumber: string;
  quantity: number | null;
  unit: string;
  finishDate: string | null;
  expiryMonth: string | null;
  status: string;
};

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

export function LabelPicker({ rmRecords, fpRecords }: { rmRecords: RmRecord[]; fpRecords: FpRecord[] }) {
  const [labelType, setLabelType] = useState<LabelType>("approved_rm");
  // FB-0024 (7 Sept 2026, Namrata Gaikwad): a second picker, in between
  // Label type and the batch field, so a user can find a batch by the raw
  // material/finished product's *name* (e.g. "jatamansi") rather than
  // needing to already recognize its batch code. Picking a name here
  // narrows the batch field below it to just that product's batches;
  // clearing it (or switching Label type) shows every batch again, same
  // as before this existed.
  const [nameFilter, setNameFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string>("");
  // FB-0037 (12 Sept 2026, Namrata Gaikwad): a JPEG download alongside the
  // existing PDF, for pasting the label straight into a chat/doc without a
  // PDF viewer. Captures the already-rendered on-screen preview below
  // (ref'd via previewRef) with html2canvas rather than re-implementing the
  // jsPDF vector layout a second time — the two exports can drift slightly
  // in typography since one is a canvas rasterization of HTML/CSS and the
  // other is native PDF vector drawing, but they show the same fields.
  const previewRef = useRef<HTMLDivElement>(null);
  const [downloadingJpeg, setDownloadingJpeg] = useState(false);

  const isFp = labelType === "finished_product";
  const rm = !isFp ? rmRecords.find((r) => r.id === selectedId) : undefined;
  const fp = isFp ? fpRecords.find((r) => r.id === selectedId) : undefined;

  // Distinct product names for the currently active record set, so the
  // name picker offers each RM/FP item once rather than once per batch.
  const nameOptions = useMemo(() => {
    const names = isFp ? fpRecords.map((r) => r.productName) : rmRecords.map((r) => r.itemName);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [isFp, rmRecords, fpRecords]);

  const filteredRmRecords = nameFilter ? rmRecords.filter((r) => r.itemName === nameFilter) : rmRecords;
  const filteredFpRecords = nameFilter ? fpRecords.filter((r) => r.productName === nameFilter) : fpRecords;

  const fields: LabelField[] = useMemo(() => {
    if (labelType === "approved_rm" && rm) {
      return [
        { label: "Name", value: rm.itemName },
        { label: "Status", value: "Approved" },
        { label: "Batch No.", value: rm.batchNumber },
        { label: "Batch Quantity", value: `${formatNumber(rm.quantity)} ${rm.unit}` },
        { label: "Purchased From", value: rm.vendorName },
        { label: "Invoice/Ch. No.", value: rm.invoiceNumber },
        { label: "Date of Receipt", value: dateOrNull(rm.receiptDate) },
        { label: "Retest Period", value: rm.retestPeriodDays != null ? `${rm.retestPeriodDays} days` : null },
        { label: "Sign", value: null },
      ];
    }
    if (labelType === "under_test" && rm) {
      return [
        { label: "Name of RM/FP", value: rm.itemName },
        { label: "Batch No.", value: rm.batchNumber },
        { label: "Batch Quantity", value: `${formatNumber(rm.quantity)} ${rm.unit}` },
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
        { label: "Batch Quantity", value: `${formatNumber(rm.quantity)} ${rm.unit}` },
        { label: "Start Date", value: null },
        { label: "Sign", value: null },
      ];
    }
    if (labelType === "finished_product" && fp) {
      return [
        { label: "Name", value: fp.productName },
        { label: "Status", value: "Approved" },
        { label: "Batch No.", value: fp.batchNumber },
        { label: "Batch Quantity", value: fp.quantity != null ? `${formatNumber(fp.quantity)} ${fp.unit}` : null },
        { label: "Month of Manufacture", value: monthYear(fp.finishDate) },
        { label: "Best Before", value: monthYear(fp.expiryMonth) },
        { label: "Sign", value: null },
      ];
    }
    return [];
  }, [labelType, rm, fp]);

  const canDownload = fields.length > 0;
  const batchNumberForFilename = rm?.batchNumber ?? fp?.batchNumber ?? "label";

  function handleTypeChange(next: LabelType) {
    setLabelType(next);
    setNameFilter("");
    setSelectedId("");
  }

  function handleNameFilterChange(next: string) {
    setNameFilter(next);
    // The previously selected batch may not belong to this product — clear
    // it rather than leave a stale, now-hidden batch selected underneath.
    setSelectedId("");
  }

  function handleDownload() {
    const safeBatch = batchNumberForFilename.replace(/[^\w.-]+/g, "_");
    downloadLabelPdf(labelType, fields, `label-${labelType}-${safeBatch}.pdf`);
  }

  async function handleDownloadJpeg() {
    const node = previewRef.current;
    if (!node) return;
    setDownloadingJpeg(true);
    try {
      // The Approved Raw Material preview embeds Carlito (matching the
      // PDF's font) as a data: URI font. A passive CSS @font-face alone
      // doesn't guarantee it's loaded by the time html2canvas fires — that
      // race is what caused Ravi's "letters going out of border" bug: with
      // Carlito not yet loaded, html2canvas captured a wider fallback font
      // that no longer fit the cell, even though both the PDF and this
      // preview's own layout math say the text fits. loadRmCarlitoFont()
      // explicitly awaits the font via the Font Loading API (and was
      // already kicked off when the preview mounted, so this is usually an
      // instant no-op by the time the user clicks Download).
      if (labelType === "approved_rm") await loadRmCarlitoFont();
      if (document.fonts?.ready) await document.fonts.ready;
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(node, { scale: 3, backgroundColor: "#ffffff" });
      const safeBatch = batchNumberForFilename.replace(/[^\w.-]+/g, "_");
      const link = document.createElement("a");
      link.download = `label-${labelType}-${safeBatch}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.92);
      link.click();
    } finally {
      setDownloadingJpeg(false);
    }
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
            label="Search by Item Name"
            htmlFor="name-filter"
            hint="Type to find a raw material or finished product by name, e.g. Jatamansi — narrows the batch list below."
          >
            <Select id="name-filter" value={nameFilter} onChange={(e) => handleNameFilterChange(e.target.value)}>
              <option value="">All products</option>
              {nameOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>

          {!isFp ? (
            <Field label="Purchase batch" htmlFor="record" required hint="Raw material batch, from Purchase.">
              <Select id="record" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">Select a batch…</option>
                {filteredRmRecords.map((r) => (
                  <option key={r.id} value={r.id} data-legacy={isLegacyCode(r.batchNumber) ? "1" : undefined}>
                    {r.batchNumber} · {r.itemName}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Finished product batch" htmlFor="record" required>
              <Select id="record" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">Select a batch…</option>
                {filteredFpRecords.map((r) => (
                  <option key={r.id} value={r.id} data-legacy={isLegacyCode(r.batchNumber) ? "1" : undefined}>
                    {r.batchNumber} · {r.productName}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {nameFilter && (!isFp ? filteredRmRecords.length === 0 : filteredFpRecords.length === 0) && (
            <p className="text-sm text-muted">No batches on file for &ldquo;{nameFilter}&rdquo;.</p>
          )}

          {rm && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <span>Current QC status:</span>
              <Badge status={rm.qcStatus}>{rm.qcStatus.replace("_", " ")}</Badge>
              {rm.arNumber && <span>AR No. {rm.arNumber}</span>}
            </div>
          )}
          {fp && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <span>Current FP status:</span>
              <Badge status={fp.status}>{fp.status.replace(/_/g, " ")}</Badge>
            </div>
          )}

          {!isFp && rmRecords.length === 0 && (
            <p className="text-sm text-muted">No purchase batches available yet.</p>
          )}
          {isFp && fpRecords.length === 0 && (
            <p className="text-sm text-muted">No finished product batches available yet.</p>
          )}

          <div className="flex gap-2">
            <Button onClick={handleDownload} disabled={!canDownload} className="self-start">
              Download PDF
            </Button>
            <Button
              onClick={handleDownloadJpeg}
              disabled={!canDownload || downloadingJpeg}
              variant="secondary"
              className="self-start"
            >
              {downloadingJpeg ? "Preparing…" : "Download JPEG"}
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
                <RmSheetPreview ref={previewRef} fields={fields} />
              </div>
            </div>
          ) : (
            <div
              ref={previewRef}
              className="w-full max-w-sm rounded-md border-2 border-brand bg-white p-3 text-foreground shadow-sm"
            >
              <p className="text-center text-[11px] font-bold text-brand-dark leading-tight">
                Atharva Nature Healthcare Pvt. Ltd.
              </p>
              <p className="text-center text-[9px] text-muted leading-tight">
                Wagholi, Pune · Mfg. Lic. No.: PD/AYU-111
              </p>
              <div className="my-1.5 border-t border-brand" />
              <p className="text-center text-sm font-bold text-brand-dark mb-2">
                {LABEL_HEADER[labelType]}
              </p>
              <dl className="flex flex-col gap-1 text-[11px]">
                {fields.map((f) => (
                  <div key={f.label} className="flex gap-1">
                    <dt className="font-semibold shrink-0">{f.label}:</dt>
                    <dd className={f.value ? "" : "flex-1 border-b border-black/30"}>
                      {f.value ?? " "}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

const LABEL_HEADER: Record<LabelType, string> = {
  approved_rm: "APPROVED RAW MATERIAL",
  under_test: "UNDER TEST",
  inprocess: "INPROCESS",
  finished_product: "Finished Product",
};
