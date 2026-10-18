-- 0121: first migration applied by Supabase's GitHub integration after the
-- history fix (scripts/db/mark-migrations-applied.sql). It only sets a
-- description on the public schema, so it proves the push-to-main pipeline
-- end to end without changing any table, row, function or permission.

comment on schema public is
  'Invento application schema. Changes arrive only as files in supabase/migrations, applied by the Supabase GitHub integration on push to main.';
