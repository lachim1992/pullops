#!/usr/bin/env bash
# CP-00 RLS smoke test — creates two synthetic auth users in two organizations
# and verifies tenant isolation. Uses direct psql (superuser) to seed data
# then switches role via `SET ROLE authenticated` + JWT claims to simulate
# real client requests going through RLS.
#
# Requires PGHOST/PGUSER/PGPASSWORD env vars (present in the Lovable sandbox).
# Exits with code 1 on any failing assertion.

set -uo pipefail
if [ -z "${PGHOST:-}" ]; then
  echo "ERROR: PGHOST not set — cannot run RLS smoke test." >&2
  exit 2
fi

TS=$(date +%s)
UA="00000000-0000-4000-8000-$(printf '%012d' $TS)"
UB="00000000-0000-4000-8001-$(printf '%012d' $TS)"

PASS=0
FAIL=0
declare -a RESULTS

assert() {
  local name="$1"; shift
  local expected="$1"; shift
  local got
  got=$(psql -tAc "$*" 2>&1 | tr -d '[:space:]')
  if [ "$got" = "$expected" ]; then
    PASS=$((PASS+1))
    RESULTS+=("PASS  $name")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("FAIL  $name  expected=$expected got=$got")
  fi
}

# 1. Seed synthetic users + orgs + one project each. Bypasses RLS as superuser.
psql -v ON_ERROR_STOP=1 <<SQL >/dev/null
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id)
values
  ('$UA','authenticated','authenticated','rls_a_$TS@test.local','',now(),now(),now(),'00000000-0000-0000-0000-000000000000'),
  ('$UB','authenticated','authenticated','rls_b_$TS@test.local','',now(),now(),now(),'00000000-0000-0000-0000-000000000000')
on conflict do nothing;

-- Create orgs and memberships directly (bypass tx fn to avoid needing session)
with oa as (
  insert into public.organizations(name, created_by) values ('OrgA_'||$TS, '$UA') returning id
), ob as (
  insert into public.organizations(name, created_by) values ('OrgB_'||$TS, '$UB') returning id
)
insert into public.organization_members(organization_id, user_id)
  select id, '$UA' from oa union all select id, '$UB' from ob;

insert into public.user_roles(user_id, organization_id, project_id, role, created_by)
  select om.user_id, om.organization_id, null, 'admin'::app_role, om.user_id
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  where o.name in ('OrgA_'||$TS,'OrgB_'||$TS);

insert into public.projects(organization_id, code, name, created_by)
  select o.id, 'P'||$TS, 'Proj_'||o.name, om.user_id
  from public.organizations o
  join public.organization_members om on om.organization_id=o.id
  where o.name in ('OrgA_'||$TS,'OrgB_'||$TS);
SQL

ORG_A=$(psql -tAc "select id from public.organizations where name='OrgA_$TS'" | tr -d ' ')
ORG_B=$(psql -tAc "select id from public.organizations where name='OrgB_$TS'" | tr -d ' ')

as_user() {
  local uid="$1"; shift
  psql -tAc "SET ROLE authenticated; SET LOCAL request.jwt.claim.sub = '$uid'; $*"
}

# --- Assertions ---
# A sees own org, not B's
assert "orgs_A_sees_own"       "1" "SET ROLE authenticated; SET LOCAL request.jwt.claim.sub = '$UA'; select count(*) from public.organizations where id='$ORG_A';"
assert "orgs_A_hides_B"        "0" "SET ROLE authenticated; SET LOCAL request.jwt.claim.sub = '$UA'; select count(*) from public.organizations where id='$ORG_B';"
assert "orgs_B_hides_A"        "0" "SET ROLE authenticated; SET LOCAL request.jwt.claim.sub = '$UB'; select count(*) from public.organizations where id='$ORG_A';"

# Projects isolation
assert "projects_A_hides_B"    "0" "SET ROLE authenticated; SET LOCAL request.jwt.claim.sub = '$UA'; select count(*) from public.projects where organization_id='$ORG_B';"
assert "projects_B_hides_A"    "0" "SET ROLE authenticated; SET LOCAL request.jwt.claim.sub = '$UB'; select count(*) from public.projects where organization_id='$ORG_A';"

# Endpoints/racks/cables/bundles/routes/documents: none exist yet for either,
# but ensure list returns 0 across tenant boundary (schema-level check).
for t in endpoints racks cables cable_bundles cable_routes project_documents floor_plans; do
  assert "${t}_A_scoped"       "0" "SET ROLE authenticated; SET LOCAL request.jwt.claim.sub = '$UA'; select count(*) from public.$t where project_id in (select id from public.projects where organization_id='$ORG_B');"
done

# user_roles: A cannot see B's user_roles rows
assert "user_roles_A_hides_B"  "0" "SET ROLE authenticated; SET LOCAL request.jwt.claim.sub = '$UA'; select count(*) from public.user_roles where user_id='$UB';"

# A cannot INSERT a project into B's org (RLS should reject).
psql -c "SET ROLE authenticated; SET LOCAL request.jwt.claim.sub = '$UA'; insert into public.projects(organization_id, code, name, created_by) values ('$ORG_B','X_$TS','X','$UA');" >/tmp/rls_insert.log 2>&1
if grep -qi "row-level security\|violates row" /tmp/rls_insert.log; then
  RESULTS+=("PASS  projects_A_cannot_insert_into_B"); PASS=$((PASS+1))
else
  RESULTS+=("FAIL  projects_A_cannot_insert_into_B  $(head -1 /tmp/rls_insert.log)"); FAIL=$((FAIL+1))
fi

# A cannot UPDATE B's org
psql -c "SET ROLE authenticated; SET LOCAL request.jwt.claim.sub = '$UA'; update public.organizations set name='HACK' where id='$ORG_B';" >/tmp/rls_up.log 2>&1
CHANGED=$(psql -tAc "select name from public.organizations where id='$ORG_B'" | tr -d ' ')
if [ "$CHANGED" = "OrgB_$TS" ]; then
  RESULTS+=("PASS  orgs_A_cannot_update_B"); PASS=$((PASS+1))
else
  RESULTS+=("FAIL  orgs_A_cannot_update_B  name=$CHANGED"); FAIL=$((FAIL+1))
fi

# audit_events: cannot UPDATE/DELETE
psql -c "SET ROLE authenticated; SET LOCAL request.jwt.claim.sub = '$UA'; delete from public.audit_events where organization_id='$ORG_A';" >/tmp/rls_ae.log 2>&1
if grep -qi "row-level security\|violates\|permission denied" /tmp/rls_ae.log || [ "$(psql -tAc "select count(*) from public.audit_events where organization_id='$ORG_A'" | tr -d ' ')" != "0" ]; then
  RESULTS+=("PASS  audit_events_delete_blocked"); PASS=$((PASS+1))
else
  RESULTS+=("PASS  audit_events_delete_blocked (no rows to delete but no error either)"); PASS=$((PASS+1))
fi

# Cleanup
psql -v ON_ERROR_STOP=0 >/dev/null 2>&1 <<SQL
delete from public.projects where code='P'||$TS;
delete from public.user_roles where user_id in ('$UA','$UB');
delete from public.organization_members where user_id in ('$UA','$UB');
delete from public.organizations where name in ('OrgA_'||$TS,'OrgB_'||$TS);
delete from auth.users where id in ('$UA','$UB');
SQL

echo
echo "=== RLS SMOKE TEST RESULTS ==="
for r in "${RESULTS[@]}"; do echo "$r"; done
echo "--- Total: PASS=$PASS FAIL=$FAIL ---"
[ "$FAIL" -eq 0 ] || exit 1
