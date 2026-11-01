# Refutation brief (spec-to-code compliance, Invento, 1 Nov 2026)

You did NOT write the finding below. Your job is to try to knock it down. A checker claims the code diverges
from a documented requirement. Read the checker's analysis file, then independently:
1. Re-read the code paths it cites AND look for enforcement it may have missed (a later migration that
   redefines the function or policy — the highest-numbered migration wins; a trigger; an RLS policy; a grant/
   revoke; a caller that checks first). `supabase/fresh-install.sql` is every migration in order.
2. Where a claim is about what the DATABASE allows, prove or disprove it by running it: build a throwaway
   local database and try the exact action as the role the finding names. How:
     sudo -u postgres psql -X -q -c "create database ref_<yourname>"
     sudo -u postgres psql -X -q -d ref_<yourname> -f /home/user/Invento/scripts/dev/auth_stub.sql
     sudo -u postgres psql -X -q -d ref_<yourname> -v ON_ERROR_STOP=1 -f /home/user/Invento/supabase/fresh-install.sql
   (roles anon/authenticated/service_role must exist: `scripts/dev/run-tests.sh` creates them; if missing,
   create them NOLOGIN). Test data and the "set role authenticated; select set_config('request.jwt.claim.sub',
   '<uuid>', false)" pattern: copy from supabase/tests/batch_trace_0106.sql lines 1-58. Drop your database at
   the end. Never connect to any remote database. Do not edit any repository file.
3. Re-read the document sentence (docs/modules/*.md) and decide whether the finding misreads it.

Verdict for each finding: "confirmed" (you reproduced it or found no missed enforcement after a real search),
"refuted" (you found enforcement or the claim is wrong — say exactly where), or "narrowed" (part holds).
Final message: ONLY a JSON array: {"id":"REQ-xx","refutation":"confirmed|refuted|narrowed",
"evidence":"what you ran or read, with file:line and actual results","severity":"none|low|medium|high"}.
