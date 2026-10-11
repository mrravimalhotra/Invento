-- 0116: Largest values the database accepts (SCAN-P10-05, Ravi 12 Oct 2026: "both layers")
--
-- The limits only stop the impossible (an extra zero is caught by the 10-times warning on the
-- purchase line form, which never blocks). They are checked on new and changed rows only
-- (NOT VALID), so nothing already stored can fail.
--
--   Quantity   weight: up to 1,000 tonnes (1,000,000 kg = 1,000,000,000 g = 1,000,000,000,000 mg)
--              volume: up to 1,000,000 ltr (= 1,000,000,000 ml)
--              nos, bottle, pack and any other unit: up to 100,000,000
--   Unit price up to 10,000,000 (Rs 1 crore) per unit
--   Text       names 200 characters, address 500, remarks and descriptions 2,000,
--              MFR procedure steps 5,000

begin;

create or replace function public.qty_limit(p_unit text)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_unit, '')))
    when 'kg'  then 1000000::numeric
    when 'g'   then 1000000000::numeric
    when 'mg'  then 1000000000000::numeric
    when 'ltr' then 1000000::numeric
    when 'ml'  then 1000000000::numeric
    else 100000000::numeric
  end
$$;
revoke all on function public.qty_limit(text) from public, anon;
grant execute on function public.qty_limit(text) to authenticated, service_role;

-- If a stored row is already above a limit, a later save of that row would be refused, so stop
-- BEFORE changing anything and list the rows; correct them (or tell Claude) and run again.
do $$
declare
  c record;
  v_ids text;
  v_msg text := '';
begin
  for c in
    select * from (values
      ('purchase_lines', 'quantity above the limit for its unit', 'quantity > public.qty_limit(unit)'),
      ('purchase_lines', 'unit price above 10,000,000', 'unit_price > 10000000'),
      ('finished_product_batches', 'target quantity or wastage above the limit', 'target_qty > public.qty_limit(unit) or wastage > public.qty_limit(unit)'),
      ('production_issue_batches', 'quantity above the limit', 'quantity > public.qty_limit(unit)'),
      ('packaging_issue_items', 'quantity above the limit', 'quantity > public.qty_limit(unit)'),
      ('packaging_issues', 'unit count above 100,000,000', 'unit_count > 100000000'),
      ('mfr_lines', 'quantity above the limit', 'quantity > public.qty_limit(unit)'),
      ('mfr_definitions', 'batch size or name above the limit', 'batch_size_qty > public.qty_limit(batch_size_unit) or char_length(name) > 200'),
      ('items', 'name longer than 200 characters', 'char_length(name) > 200'),
      ('vendors', 'name over 200 or address over 500 characters', 'char_length(name) > 200 or char_length(address) > 500'),
      ('item_types', 'description longer than 200 characters', 'char_length(description) > 200'),
      ('equipment', 'name longer than 200 characters', 'char_length(name) > 200'),
      ('dead_stock_items', 'article name over 200 or remark over 2,000 characters', 'char_length(article_name) > 200 or char_length(remark) > 2000'),
      ('documents', 'title longer than 200 characters', 'char_length(title) > 200'),
      ('mfr_procedure_steps', 'operation longer than 5,000 characters', 'char_length(operation) > 5000'),
      ('page_feedback', 'observation longer than 2,000 characters', 'char_length(observation) > 2000')
    ) as v(tbl, what, cond)
  loop
    execute format('select string_agg(id::text, '', '') from (select id from public.%I where %s limit 5) s', c.tbl, c.cond) into v_ids;
    if v_ids is not null then
      v_msg := v_msg || format(E'\n  %s: %s (ids: %s)', c.tbl, c.what, v_ids);
    end if;
  end loop;
  if v_msg <> '' then
    raise exception 'Nothing was changed. These stored rows are above the new limits; correct them first, then run this again:%', v_msg;
  end if;
end $$;

-- Quantities (checked against the row's own unit)
alter table public.purchase_lines
  add constraint purchase_lines_quantity_limit check (quantity <= public.qty_limit(unit)) not valid,
  add constraint purchase_lines_unit_price_limit check (unit_price is null or unit_price <= 10000000) not valid;

alter table public.finished_product_batches
  add constraint finished_product_batches_target_qty_limit check (target_qty <= public.qty_limit(unit)) not valid,
  add constraint finished_product_batches_wastage_limit check (wastage is null or wastage <= public.qty_limit(unit)) not valid;

alter table public.production_issue_batches
  add constraint production_issue_batches_quantity_limit check (quantity <= public.qty_limit(unit)) not valid;

alter table public.packaging_issue_items
  add constraint packaging_issue_items_quantity_limit check (quantity <= public.qty_limit(unit)) not valid;

alter table public.packaging_issues
  add constraint packaging_issues_unit_count_limit check (unit_count is null or unit_count <= 100000000) not valid;

alter table public.mfr_lines
  add constraint mfr_lines_quantity_limit check (quantity <= public.qty_limit(unit)) not valid;

alter table public.mfr_definitions
  add constraint mfr_definitions_batch_size_qty_limit check (batch_size_qty <= public.qty_limit(batch_size_unit)) not valid;

-- Text lengths
alter table public.items
  add constraint items_name_limit check (char_length(name) <= 200) not valid;
alter table public.vendors
  add constraint vendors_name_limit check (char_length(name) <= 200) not valid,
  add constraint vendors_address_limit check (address is null or char_length(address) <= 500) not valid;
alter table public.mfr_definitions
  add constraint mfr_definitions_name_limit check (char_length(name) <= 200) not valid;
alter table public.item_types
  add constraint item_types_description_limit check (char_length(description) <= 200) not valid;
alter table public.equipment
  add constraint equipment_name_limit check (char_length(name) <= 200) not valid;
alter table public.dead_stock_items
  add constraint dead_stock_items_article_name_limit check (char_length(article_name) <= 200) not valid,
  add constraint dead_stock_items_remark_limit check (remark is null or char_length(remark) <= 2000) not valid;
alter table public.documents
  add constraint documents_title_limit check (char_length(title) <= 200) not valid;
alter table public.mfr_procedure_steps
  add constraint mfr_procedure_steps_operation_limit check (operation is null or char_length(operation) <= 5000) not valid;
alter table public.page_feedback
  add constraint page_feedback_observation_limit check (observation is null or char_length(observation) <= 2000) not valid;

commit;
