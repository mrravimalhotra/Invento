"use client";

import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { LegacyTag } from "@/components/ui/legacy-tag";
import { DataTable, type Column } from "@/components/ui/data-table";
import { formatDate, formatNumber, formatQty, isLegacyCode, fpBatchBoth, fpBatchShort } from "@/lib/utils";
import { VoidIssueBox } from "./void-issue-box";
import type { TableExport } from "@/lib/table-export";
import {
  materialsSummary,
  rmFpBatchLines,
  rmFpBatchesText,
  rmFpItemCodes,
  rmFpItemCodesText,
  type PackagingMaterialRow,
  type ProductionIssueBatchRow,
} from "@/lib/packaging-materials";

export type { PackagingMaterialRow };

export type PackagingRow = {
  id: string;
  code: string;
  pack_size: string;
  unit_count: number | string;
  department: string;
  created_at: string;
  issue_date: string;
  finished_product_batches: {
    batch_number: string;
    short_batch_no: string | null;
    is_legacy: boolean;
    mfr_definitions: { items: { item_code: string; name: string; unit: string | null } | null } | null;
  } | null;
  // P6-01: bulk used (in the product's unit), and the void, if any.
  fp_qty_consumed: number | string | null;
  voided_fp_qty: number | string | null;
  voided_at: string | null;
  void_reason: string | null;
  voided_by_name?: string | null;
  packaging_issue_items: PackagingMaterialRow[] | null;
  production_issue_batches: ProductionIssueBatchRow[] | null;
};

// P6-01: what a void puts back, listed in the confirmation box.
function goesBack(r: PackagingRow): string[] {
  const fp = r.finished_product_batches;
  const item = fp?.mfr_definitions?.items;
  const out: string[] = [];
  if (r.fp_qty_consumed != null && fp) {
    out.push(
      `${formatQty(r.fp_qty_consumed)} ${item?.unit ?? ""} of bulk to batch ${fpBatchShort(fp.batch_number, fp.short_batch_no)}${item ? ` (${item.item_code} · ${item.name})` : ""}`
    );
  }
  for (const m of r.packaging_issue_items ?? []) {
    out.push(`${formatQty(m.quantity)} ${m.unit} × ${m.items?.name ?? "material"} to the batches it came from`);
  }
  if (r.department === "production") {
    out.push("its RM-FP batch leaves stock and its QC record is marked Void (refused if that batch has been used)");
  } else {
    out.push(`the ${formatNumber(r.unit_count, 0)} packs are taken off Packaged Finished Product stock`);
  }
  return out;
}

// Positions in baseColumns of the columns that draw a voided row themselves: Code (0) and Status (last).
const CODE_COL = 0;

export function PackagingTable({ rows, canVoid = false }: { rows: PackagingRow[]; canVoid?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const close = useCallback(() => setOpenId(null), []);
  const baseColumns: Column<PackagingRow>[] = [
    {
      header: "Code",
      accessor: (r) => (r.voided_at ? <span className="text-muted line-through">{r.code}</span> : r.code),
      searchValue: (r) => r.code,
    },
    {
      header: "FP Batch",
      accessor: (r) =>
        r.finished_product_batches ? (
          <>
            {fpBatchBoth(r.finished_product_batches.batch_number, r.finished_product_batches.short_batch_no)}
            <LegacyTag show={r.finished_product_batches.is_legacy} />
          </>
        ) : (
          "—"
        ),
      searchValue: (r) =>
        r.finished_product_batches
          ? fpBatchBoth(r.finished_product_batches.batch_number, r.finished_product_batches.short_batch_no)
          : "",
    },
    { header: "Pack size", accessor: (r) => r.pack_size, searchValue: (r) => r.pack_size },
    { header: "Unit count", accessor: (r) => formatNumber(r.unit_count, 0) },
    { header: "Department", accessor: (r) => <Badge status={r.department}>{r.department}</Badge> },
    {
      header: "Packaging materials",
      accessor: (r) => materialsSummary(r.packaging_issue_items),
      searchValue: (r) => (r.packaging_issue_items ?? []).map((m) => m.items?.name ?? "").join(" "),
    },
    {
      header: "RM-FP item code",
      accessor: (r) => {
        const codes = rmFpItemCodes(r.production_issue_batches);
        return codes.length ? codes.map((c) => <div key={c} className="font-medium">{c}</div>) : "—";
      },
      searchValue: (r) => rmFpItemCodesText(r.production_issue_batches),
    },
    {
      header: "RM-FP batch",
      accessor: (r) => {
        const lines = rmFpBatchLines(r.production_issue_batches);
        return lines.length ? lines.map((l, i) => <div key={i}>{l}</div>) : "—";
      },
      searchValue: (r) => rmFpBatchesText(r.production_issue_batches),
    },
    { header: "Issue date", accessor: (r) => formatDate(r.issue_date) },
    {
      header: "Status",
      accessor: (r) =>
        r.voided_at ? (
          <div className="min-w-40">
            <Badge status="voided">Void</Badge>
            <p className="mt-1 text-xs text-muted">
              {r.voided_fp_qty != null && (
                <>
                  {formatQty(r.voided_fp_qty)} {r.finished_product_batches?.mfr_definitions?.items?.unit ?? ""} bulk returned
                  <br />
                </>
              )}
              {formatDate(r.voided_at)}
              {r.voided_by_name ? ` · ${r.voided_by_name}` : ""}:
              <br />
              &ldquo;{r.void_reason}&rdquo;
            </p>
          </div>
        ) : canVoid ? (
          <button
            type="button"
            onClick={() => setOpenId(openId === r.id ? null : r.id)}
            className="text-sm text-red underline hover:opacity-80"
          >
            Void
          </button>
        ) : (
          ""
        ),
      searchValue: (r) => (r.voided_at ? `void ${r.void_reason ?? ""}` : ""),
    },
  ];
  const OWN_VOID_STYLE = new Set([CODE_COL, baseColumns.length - 1]);
  // P6-01: a voided issue's row is greyed out, as in the approved mockup. Columns that style a
  // voided row themselves (Code, Status) are listed in OWN_VOID_STYLE by their position in baseColumns.
  const columns: Column<PackagingRow>[] = baseColumns.map((c, i) =>
    OWN_VOID_STYLE.has(i)
      ? c
      : { ...c, accessor: (r: PackagingRow) => (r.voided_at ? <span className="text-muted">{c.accessor(r)}</span> : c.accessor(r)) }
  );

  // Excel of the register (export decision (c), 29 Sept 2026); the PDF button stays on the page.
  const exportConfig: TableExport<PackagingRow> = {
    title: "Packing Register",
    filename: "packing-register",
    formats: ["excel"],
    columns: [
      { header: "Code", value: (r) => r.code },
      {
        header: "FP Batch",
        value: (r) =>
          r.finished_product_batches
            ? fpBatchShort(r.finished_product_batches.batch_number, r.finished_product_batches.short_batch_no)
            : "",
      },
      { header: "Pack size", value: (r) => r.pack_size },
      { header: "Unit count", type: "number", decimals: 0, value: (r) => Number(r.unit_count) },
      { header: "Department", value: (r) => r.department },
      { header: "Packaging materials", value: (r) => (r.packaging_issue_items?.length ? materialsSummary(r.packaging_issue_items) : "") },
      { header: "RM-FP item code", value: (r) => (r.production_issue_batches?.length ? rmFpItemCodesText(r.production_issue_batches) : "") },
      { header: "RM-FP batch", value: (r) => (r.production_issue_batches?.length ? rmFpBatchesText(r.production_issue_batches) : "") },
      { header: "Issue date", type: "date", value: (r) => r.issue_date },
      { header: "Status", value: (r) => (r.voided_at ? `Void (${formatDate(r.voided_at)}): ${r.void_reason ?? ""}` : "") },
    ],
  };

  return (
    <DataTable
      columns={columns}
      rows={rows}
      searchPlaceholder="Search by code, FP batch, RM-FP item or batch, or packaging item…"
      emptyLabel="No packaging issues yet." emptyHint="Issues appear here once saved with New issue."
      isLegacy={(r) => isLegacyCode(r.finished_product_batches?.batch_number)}
      isOpeningStock={(r) => !!r.finished_product_batches?.is_legacy}
      exportConfig={exportConfig}
      rowAfter={(r) =>
        openId === r.id && !r.voided_at ? (
          <VoidIssueBox id={r.id} code={r.code} goesBack={goesBack(r)} onClose={close} />
        ) : null
      }
    />
  );
}
