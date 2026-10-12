"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useFlashActionState } from "@/lib/use-flash-action";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import {
  loadOpeningChoices, submitOpeningRows, type OpeningChoices, type OpeningUploadState,
} from "@/lib/actions/opening-stock";
import { MAX_OPENING_ROWS, OPENING_COLUMNS, type OpeningKind } from "@/lib/opening-stock/columns";
import { UNITS } from "@/lib/constants/units";
import { todayIst } from "@/lib/utils";
import { OpeningResult } from "./result-panel";

// Typed-in opening stock (Ravi, 12 Oct 2026): the same rows as the Excel sheet, filled in on the
// page. One card per row. "Check rows" and "Load N rows" send every row at once to the same checks
// and the same database function as an Excel file, so both routes follow the same rules and either
// everything is loaded or nothing is.

type Choices = Exclude<OpeningChoices, { error: string }>;
type Row = { key: number; v: Record<string, string> };

const HEADERS = {
  raw: OPENING_COLUMNS.raw.map((c) => c.header),
  packaging: OPENING_COLUMNS.packaging.map((c) => c.header),
  finished: OPENING_COLUMNS.finished.map((c) => c.header),
};

const ITEM_H: Record<OpeningKind, string> = { raw: "Item Code", packaging: "Item Code", finished: "Product Code" };
const QC_STATUSES = ["Approved", "Pending QC", "Rejected"];

let nextKey = 1;
function blankRow(): Row {
  return { key: nextKey++, v: {} };
}
function isBlank(r: Row): boolean {
  return Object.values(r.v).every((x) => x.trim() === "");
}

export function OpeningEntryForm({ kind }: { kind: OpeningKind }) {
  const headers = HEADERS[kind];
  const [state, formAction, pending] = useFlashActionState<OpeningUploadState, FormData>(submitOpeningRows, undefined);
  const [rows, setRows] = useState<Row[]>(() => [blankRow()]);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [choicesError, setChoicesError] = useState<string | null>(null);
  // The last answer is hidden the moment anything on the page is edited.
  const [dismissed, setDismissed] = useState(false);
  const today = useMemo(() => todayIst(), []);

  useEffect(() => {
    let live = true;
    loadOpeningChoices(kind)
      .then((c) => {
        if (!live) return;
        if ("error" in c) setChoicesError(c.error);
        else setChoices(c);
      })
      .catch(() => live && setChoicesError("Could not read Item Master. Reload the page and try again."));
    return () => { live = false; };
  }, [kind]);

  useEffect(() => {
    if (!state) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(false);
    if (state.success) setRows([blankRow()]);
  }, [state]);

  const itemByCode = useMemo(() => new Map((choices?.items ?? []).map((i) => [i.code, i])), [choices]);
  const filled = rows.filter((r) => !isBlank(r));
  const shown = dismissed ? undefined : state;
  const ready = shown?.checked;

  // "Row 3: …" messages belong inside card 3; anything else stays in the panel above.
  const byRow = new Map<number, string[]>();
  const loose: string[] = [];
  for (const e of shown?.rowErrors ?? []) {
    const m = /^Row (\d+): (.*)$/.exec(e);
    if (m) byRow.set(Number(m[1]), [...(byRow.get(Number(m[1])) ?? []), m[2]]);
    else loose.push(e);
  }

  function edit(fn: (prev: Row[]) => Row[]) {
    setDismissed(true);
    setRows(fn);
  }
  function setField(key: number, header: string, value: string) {
    edit((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const v = { ...r.v, [header]: value };
        if (header === ITEM_H[kind]) {
          // Picking an item fills the unit it is kept in.
          const item = itemByCode.get(value);
          if (item && kind !== "finished") v["Unit"] = item.unit;
        }
        if (header === "QC status") {
          // Fields that do not apply to the chosen status are cleared so they cannot be sent by mistake.
          if (value !== "Approved") { v["Retest date"] = ""; v["Retests already done"] = ""; }
          if (value === "Pending QC" || value === "") { v["Old AR No"] = ""; v["QC approval date"] = ""; }
        }
        return { ...r, v };
      }),
    );
  }

  const payload = JSON.stringify(rows.map((r) => headers.map((h) => r.v[h] ?? "")));

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="rows" value={payload} />

      {choicesError && (
        <p role="alert" className="rounded-md border border-red/30 bg-red/5 px-3 py-2 text-sm text-red">{choicesError}</p>
      )}
      {!choices && !choicesError && <p className="text-sm text-muted">Reading Item Master…</p>}
      {choices && choices.items.length === 0 && (
        <p className="rounded-md border border-amber/30 bg-amber-bg px-3 py-2 text-sm text-amber">
          {kind === "finished"
            ? "No finished product with an MFR yet. Create the MFR first, then load its opening stock."
            : `No active ${kind === "raw" ? "raw material" : "packaging"} items in Item Master yet. Add the items first.`}
        </p>
      )}

      {choices && choices.items.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <RowCard
              key={r.key}
              kind={kind}
              n={i + 1}
              row={r}
              today={today}
              choices={choices}
              itemByCode={itemByCode}
              errors={byRow.get(i + 1)}
              canRemove={rows.length > 1}
              onField={(h, v) => setField(r.key, h, v)}
              onDuplicate={() =>
                edit((prev) => {
                  const at = prev.findIndex((x) => x.key === r.key);
                  const copy: Row = { key: nextKey++, v: { ...r.v } };
                  // A batch number cannot repeat, so the copy starts without one.
                  delete copy.v["Batch No"];
                  delete copy.v["Lot No"];
                  delete copy.v["Old AR No"];
                  return [...prev.slice(0, at + 1), copy, ...prev.slice(at + 1)];
                })
              }
              onRemove={() => edit((prev) => (prev.length > 1 ? prev.filter((x) => x.key !== r.key) : prev))}
            />
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={rows.length >= MAX_OPENING_ROWS}
              onClick={() => edit((prev) => [...prev, blankRow()])}
            >
              <Plus size={14} /> Add row
            </Button>
            <Button type="submit" name="intent" value="check" size="sm" variant="secondary" disabled={pending || filled.length === 0}>
              {pending ? "Working…" : "Check rows"}
            </Button>
            {ready && !dismissed && (
              <Button type="submit" name="intent" value="load" size="sm" disabled={pending}>
                Load {ready.rows} row{ready.rows === 1 ? "" : "s"}
              </Button>
            )}
            <span className="text-xs text-muted">
              {filled.length} row{filled.length === 1 ? "" : "s"} filled in · limit {MAX_OPENING_ROWS} per load
            </span>
          </div>
        </div>
      )}

      <OpeningResult shown={shown} rowErrors={loose} noun="Rows" />
    </form>
  );
}

function RowCard({
  kind, n, row, today, choices, itemByCode, errors, canRemove, onField, onDuplicate, onRemove,
}: {
  kind: OpeningKind;
  n: number;
  row: Row;
  today: string;
  choices: Choices;
  itemByCode: Map<string, Choices["items"][number]>;
  errors?: string[];
  canRemove: boolean;
  onField: (header: string, value: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const v = (h: string) => row.v[h] ?? "";
  const idp = `os-${kind}-${row.key}`;
  const fid = (h: string) => `${idp}-${h.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const status = v("QC status");
  const item = itemByCode.get(v(ITEM_H[kind]));
  const packs = Number(v("Packs in stock") || 0);

  const text = (h: string, label: string, opts: { required?: boolean; hint?: string; placeholder?: string } = {}) => (
    <Field label={label} htmlFor={fid(h)} required={opts.required} hint={opts.hint}>
      <Input id={fid(h)} value={v(h)} placeholder={opts.placeholder} onChange={(e) => onField(h, e.target.value)} />
    </Field>
  );
  const number = (h: string, label: string, opts: { required?: boolean; hint?: string; max?: number; step?: string } = {}) => (
    <Field label={label} htmlFor={fid(h)} required={opts.required} hint={opts.hint}>
      <Input
        id={fid(h)} type="number" inputMode="decimal" min={0} max={opts.max} step={opts.step ?? "any"}
        value={v(h)} onChange={(e) => onField(h, e.target.value)}
      />
    </Field>
  );
  const date = (h: string, label: string, opts: { required?: boolean; hint?: string; noFuture?: boolean } = {}) => (
    <Field label={label} htmlFor={fid(h)} required={opts.required} hint={opts.hint}>
      <Input
        id={fid(h)} type="date" max={opts.noFuture ? today : undefined}
        value={v(h)} onChange={(e) => onField(h, e.target.value)}
      />
    </Field>
  );
  const itemPicker = (
    <Field
      label={kind === "finished" ? "Finished product" : kind === "raw" ? "Raw material" : "Packaging item"}
      htmlFor={`${idp}-item`}
      required
      hint={item ? `Kept in ${item.unit}` : undefined}
    >
      <Select id={`${idp}-item`} value={v(ITEM_H[kind])} onChange={(e) => onField(ITEM_H[kind], e.target.value)}>
        <option value="">Select…</option>
        {choices.items.map((i) => (
          <option key={i.code} value={i.code}>{i.code} — {i.name}</option>
        ))}
      </Select>
    </Field>
  );
  const vendorPicker = (
    <Field label="Vendor" htmlFor={`${idp}-vendor`} hint="Optional">
      <Select id={`${idp}-vendor`} value={v("Vendor Code")} onChange={(e) => onField("Vendor Code", e.target.value)}>
        <option value="">Not recorded</option>
        {choices.vendors.map((x) => (
          <option key={x.code} value={x.code}>{x.code} — {x.name}</option>
        ))}
      </Select>
    </Field>
  );
  const unitPicker = (
    <Field label="Unit" htmlFor={`${idp}-unit`} required hint="The unit you counted in">
      <Select id={`${idp}-unit`} value={v("Unit")} onChange={(e) => onField("Unit", e.target.value)}>
        <option value="">Select…</option>
        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </Select>
    </Field>
  );

  return (
    <fieldset className={`rounded-lg border p-3 ${errors?.length ? "border-red/40 bg-red/[0.02]" : "border-border"}`}>
      <legend className="sr-only">Row {n}</legend>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Row {n}
          {item && <span className="ml-2 font-normal text-muted">{item.name}</span>}
        </p>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={onDuplicate} aria-label={`Duplicate row ${n}`}>
            <Copy size={14} /> <span className="max-sm:hidden">Duplicate</span>
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={!canRemove} onClick={onRemove} aria-label={`Remove row ${n}`}>
            <Trash2 size={14} /> <span className="max-sm:hidden">Remove</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kind === "raw" && (
          <>
            {itemPicker}
            {text("Batch No", "Batch No", { required: true, hint: "As printed on the container", placeholder: "AB-2291" })}
            {number("Quantity in stock", "Quantity in stock", { required: true, hint: "Above 0" })}
            {unitPicker}
            {date("Receipt date", "Receipt date", { required: true, noFuture: true })}
            <Field label="QC status" htmlFor={`${idp}-status`} required>
              <Select id={`${idp}-status`} value={status} onChange={(e) => onField("QC status", e.target.value)}>
                <option value="">Select…</option>
                {QC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            {(status === "Approved" || status === "Pending QC") &&
              date("Manufacturer expiry date", "Manufacturer expiry date", { required: true })}
            {(status === "Approved" || status === "Rejected") && (
              <>
                {text("Old AR No", "Old AR No", { required: true, hint: "From the old records", placeholder: "AR/24-25/118" })}
                {date("QC approval date", "QC approval date", { required: true, noFuture: true })}
              </>
            )}
            {status === "Approved" && (
              <>
                {date("Retest date", "Retest date", { required: true, hint: "After the QC approval date" })}
                {number("Retests already done", "Retests already done", { max: 3, step: "1", hint: "0 to 3. Blank means 0" })}
              </>
            )}
            {vendorPicker}
            {number("Unit price", "Unit price", { hint: "Optional" })}
            {number("GST %", "GST %", { max: 100, hint: "Optional. 18 means 18%" })}
          </>
        )}

        {kind === "packaging" && (
          <>
            {itemPicker}
            {number("Quantity", "Quantity", { required: true, hint: "Above 0" })}
            {unitPicker}
            {date("Receipt date", "Receipt date", { required: true, noFuture: true })}
            {text("Lot No", "Lot No", { hint: "Optional. Left blank, the app numbers it", placeholder: "L-77" })}
            {vendorPicker}
            {number("Unit price", "Unit price", { hint: "Optional" })}
            {number("GST %", "GST %", { max: 100, hint: "Optional. 18 means 18%" })}
          </>
        )}

        {kind === "finished" && (
          <>
            {itemPicker}
            {text("Batch No", "Batch No", { required: true, hint: "As in the old records", placeholder: "B-1042" })}
            {date("Manufacture date", "Manufacture date", { required: true, noFuture: true })}
            {date("Expiry date", "Expiry date", { required: true, hint: "After the manufacture date" })}
            {number("Bulk quantity unpacked", "Bulk quantity unpacked", { hint: item ? `In ${item.unit}. Blank means 0` : "Blank means 0" })}
            {number("Packs in stock", "Packs in stock", { step: "1", hint: "Whole number. Blank means 0" })}
            {packs > 0 &&
              text("Pack size", "Pack size", {
                required: true,
                hint: item && !item.hasPackaged ? "This product has no packaged item yet, so packs cannot be recorded" : "e.g. 100 ml or 0.5 kg",
                placeholder: "100 ml",
              })}
            {text("Old AR No", "Old AR No", { required: true, hint: "From the old records", placeholder: "AR/24-25/310" })}
            {date("QC approval date", "QC approval date", { required: true, noFuture: true, hint: "Every batch loaded here is Approved" })}
            {date("Retest date", "Retest date", { hint: "Optional. After the QC approval date, not after the expiry date" })}
            {number("Retests already done", "Retests already done", { max: 3, step: "1", hint: "0 to 3. Blank means 0" })}
          </>
        )}
      </div>

      {errors && errors.length > 0 && (
        <ul role="alert" className="mt-3 list-disc rounded-md border border-red/30 bg-red/5 py-2 pl-7 pr-3 text-sm text-red">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </fieldset>
  );
}
