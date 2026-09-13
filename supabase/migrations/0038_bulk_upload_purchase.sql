-- ============================================================
-- Bulk data upload — Purchase RPC.
--
-- Ravi (13 Sept 2026): "can we have purchase, instrument and dead stock
-- entries done as excel as part of bulk upload utility we created."
-- Purchase was deliberately left out of the original Bulk Data Upload
-- pass (0037_bulk_upload_mfr.sql's header comment) as "a materially more
-- complex multi-table shape... left for a later, separately-scoped
-- pass" — this is that pass. Equipment and Dead Stock need no new
-- migration at all (see lib/actions/bulk-upload.ts): both are flat,
-- single-table master data with no cross-table references, same shape
-- as Vendor Master, so a loop of get_next_equipment_code()/
-- get_next_dead_stock_code() calls followed by one multi-row insert is
-- already atomic — no new RPC required, same reasoning 0037's header
-- comment gives for why Item/Vendor/Item Type Master didn't need one.
--
-- Purchase does, for the same reason MFR did: one purchase order in this
-- app is a header row plus one-or-more line rows (one row = one recipe
-- line for MFR; here, one row = one purchase line), and "all-or-nothing
-- across the whole uploaded file" needs those to land in a single
-- transaction, not one createPurchaseOrder()/createPurchaseLine() call
-- per group from the app layer (a failure on PO #8 would otherwise leave
-- POs #1-7 already committed).
--
-- Scoped with Ravi via AskUserQuestion before writing this: a bulk-
-- uploaded purchase order lands as a Draft, exactly like one entered by
-- hand — nothing in it touches inventory_ledger until someone opens it
-- and clicks Final Submit (submit_purchase_order(), unchanged). This
-- needs zero extra work here beyond simply not calling that function:
-- purchase_orders.status already defaults to 'draft'
-- (0019_purchase_submit_workflow.sql), and the trigger that used to push
-- to the ledger the instant a line was inserted was dropped by that same
-- migration — a plain insert into purchase_lines has had no ledger side
-- effect at all since FB-0018 shipped.
--
-- Same caveats as bulk_create_mfr_definitions (0037), same reasons:
--  - get_next_po_number()/get_next_batch_number() are not undone by a
--    rollback (sequence advances / count()-based batch numbers aren't
--    transactional) — a file that fails partway through leaves the PO/
--    batch numbers already generated before the failing group "spent,"
--    a cosmetic gap only, not a data-integrity issue.
--  - This function trusts the app layer (lib/actions/bulk-upload.ts) has
--    already done the bulk of validation (vendor/item existence and
--    category match, unit validity, QC/Stability/R&D unit conversion,
--    the qc+stability+rnd <= quantity bound) before calling it — the
--    checks below are a defensive backstop, not the primary layer,
--    matching this project's "app-level + RPC-level + DB constraint"
--    defense-in-depth convention. remaining_not_negative (0001_init.sql)
--    and purchase_lines_item_batch_unique (0013_batch_number_integrity.sql)
--    are the real DB-level backstops underneath both layers.
-- ============================================================

create or replace function public.bulk_create_purchase_orders(p_payload jsonb)
returns table(po_number text, invoice_number text, line_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po jsonb;
  v_line jsonb;
  v_vendor_id uuid;
  v_invoice_number text;
  v_invoice_date date;
  v_lines jsonb;
  v_po_number text;
  v_po_id uuid;
  v_batch_number text;
  v_line_count int;
  v_idx int := 0;
begin
  -- Mirrors MODULE_WRITE_ROLES.purchase (lib/constants/roles.ts) — same
  -- reason every other SECURITY DEFINER write function in this app checks
  -- roles explicitly: SECURITY DEFINER bypasses RLS, so the po_write/
  -- pl_write policies are not what's actually gating this call.
  if not public.has_any_role('system_admin', 'inventory_manager') then
    raise exception 'Not authorized to bulk-create purchase orders.';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'array' or jsonb_array_length(p_payload) = 0 then
    raise exception 'No purchase orders to create.';
  end if;

  for v_po in select * from jsonb_array_elements(p_payload)
  loop
    v_idx := v_idx + 1;
    v_vendor_id := nullif(v_po->>'vendor_id', '')::uuid;
    v_invoice_number := trim(both from coalesce(v_po->>'invoice_number', ''));
    v_invoice_date := nullif(v_po->>'invoice_date', '')::date;
    v_lines := v_po->'lines';

    if v_vendor_id is null then
      raise exception 'Purchase order #%: vendor is required.', v_idx;
    end if;
    if v_invoice_number = '' then
      raise exception 'Purchase order #%: invoice number is required.', v_idx;
    end if;
    if v_invoice_date is null then
      raise exception 'Purchase order "%": invoice date is required.', v_invoice_number;
    end if;
    if v_lines is null or jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
      raise exception 'Purchase order "%": needs at least one line.', v_invoice_number;
    end if;

    v_po_number := public.get_next_po_number();
    insert into public.purchase_orders (po_number, vendor_id, invoice_number, invoice_date)
      values (v_po_number, v_vendor_id, v_invoice_number, v_invoice_date)
      returning id into v_po_id;
    -- status defaults to 'draft' and nothing here pushes to
    -- inventory_ledger — see the header comment above.

    v_line_count := 0;
    for v_line in select * from jsonb_array_elements(v_lines)
    loop
      if (v_line->>'item_id') is null or (v_line->>'quantity') is null
         or v_line->>'unit' is null or v_line->>'unit' = '' then
        raise exception 'Purchase order "%": every line needs an item, quantity, and unit.', v_invoice_number;
      end if;
      if (v_line->>'quantity')::numeric <= 0 then
        raise exception 'Purchase order "%": line quantity must be greater than 0.', v_invoice_number;
      end if;

      -- batch_number is always generated here, never trusted from the
      -- file — same rule as every other code column in this feature.
      v_batch_number := public.get_next_batch_number((v_line->>'item_id')::uuid);
      insert into public.purchase_lines
        (purchase_order_id, item_id, batch_number, quantity, unit, qc_qty, stability_qty, rnd_qty, unit_price, gst_pct)
        values (
          v_po_id,
          (v_line->>'item_id')::uuid,
          v_batch_number,
          (v_line->>'quantity')::numeric,
          v_line->>'unit',
          coalesce((v_line->>'qc_qty')::numeric, 0),
          coalesce((v_line->>'stability_qty')::numeric, 0),
          coalesce((v_line->>'rnd_qty')::numeric, 0),
          nullif(v_line->>'unit_price', '')::numeric,
          nullif(v_line->>'gst_pct', '')::numeric
        );
      -- remaining_qty (generated column) and live_remaining_qty
      -- (trg_purchase_line_live_remaining, 0029) both compute themselves
      -- from the row just inserted — nothing else to set here.
      v_line_count := v_line_count + 1;
    end loop;

    po_number := v_po_number;
    invoice_number := v_invoice_number;
    line_count := v_line_count;
    return next;
  end loop;
end $$;

-- No explicit grant needed — see 0037's closing comment (default
-- privileges already cover functions created after 0001_init.sql).
