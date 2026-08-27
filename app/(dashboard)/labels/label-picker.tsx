"use client";

import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatNumber } from "@/lib/utils";
import { downloadLabelPdf, type LabelField, type LabelType } from "./generate-label-pdf";

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
  const [selectedId, setSelectedId] = useState<string>("");

  const isFp = labelType === "finished_product";
  const rm = !isFp ? rmRecords.find((r) => r.id === selectedId) : undefined;
  const fp = isFp ? fpRecords.find((r) => r.id === selectedId) : undefined;

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
    setSelectedId("");
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

          {!isFp ? (
            <Field label="Purchase batch" htmlFor="record" required hint="Raw material batch, from Purchase.">
              <Select id="record" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">Select a batch…</option>
                {rmRecords.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.batchNumber} · {r.itemName}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Finished product batch" htmlFor="record" required>
              <Select id="record" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">Select a batch…</option>
                {fpRecords.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.batchNumber} · {r.productName}
                  </option>
                ))}
              </Select>
            </Field>
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

          <Button onClick={handleDownload} disabled={!canDownload} className="self-start">
            Download PDF
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="2. Preview" />
        <CardBody>
          {fields.length === 0 ? (
            <div className="flex aspect-[4/3] w-full max-w-sm items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
              Select a batch to preview the label.
            </div>
          ) : (
            <div className="w-full max-w-sm rounded-md border-2 border-brand bg-white p-3 text-foreground shadow-sm">
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
