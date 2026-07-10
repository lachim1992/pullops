
# PullOps — Plán MVP (revize 3: finální před Checkpointem A)

Zapracovány 3 poslední opravy k Checkpointu A a zafixován kontrakt **Visual Pull Station / Digital Twin**. Rozsah tohoto kola = **pouze Checkpoint A**. Po dokončení zastavím a počkám na schválení Checkpointu B.

---

## A. Poslední opravy před Checkpointem A

### A.1 Vytvoření organizace pouze přes atomickou server function
- `organizations` **NEMÁ** žádnou obecnou INSERT policy typu `auth.uid() is not null`.
- INSERT policy pro `organizations`: **žádná** pro `authenticated` — přístup jde přes `SECURITY DEFINER` RPC nebo přes `supabaseAdmin` v server functionu.
- `createOrganization({ name })` server function (autentikovaná, `requireSupabaseAuth`):
  1. začíná transakci přes RPC `public.create_organization_tx(p_name text, p_creator uuid)` — jedna PL/pgSQL funkce `SECURITY DEFINER`, která atomicky:
     - `INSERT INTO organizations`
     - `INSERT INTO organization_members (creator)`
     - `INSERT INTO user_roles (creator, admin, project_id=null)`
     - `INSERT INTO audit_events` (`entity_type='organization', action='CREATE'`)
     - vrací nové `organization_id`
  2. při jakékoli chybě → celá transakce rollback (PL/pgSQL má implicitní transakci — všechno v jedné funkci = vše nebo nic).
- `grant execute on function public.create_organization_tx(text, uuid) to authenticated;`
- RLS `organizations`: SELECT přes `is_org_member`, UPDATE/DELETE přes `has_org_role admin`, INSERT policy **neexistuje** (RPC `SECURITY DEFINER` obchází RLS na INSERT).

### A.2 Tenant integrita project rolí a projektových členství
- **Přímé client INSERT/UPDATE do `project_members` a project-scoped `user_roles` zakázané.** RLS policies pro INSERT/UPDATE/DELETE těchto tabulek **neexistují pro `authenticated`** — jdou výhradně přes autorizovanou RPC.
- RPC `SECURITY DEFINER`:
  - `public.add_project_member_tx(p_project_id uuid, p_user_id uuid, p_role app_role)`
  - `public.remove_project_member_tx(p_project_id uuid, p_user_id uuid)`
  - `public.set_project_role_tx(p_project_id uuid, p_user_id uuid, p_role app_role, p_grant boolean)`
  - Každá kontroluje:
    - caller je `has_org_role(caller, project.organization_id, 'admin')` NEBO `has_project_role(caller, project_id, 'project_manager')`.
    - target user je `organization_member` organizace projektu (jinak ERROR: user not in tenant).
    - project-scoped user_roles vždy nastavuje `organization_id = projects.organization_id` (dopočet, ne parametr).
- **Validační trigger jako druhá vrstva** (defense in depth) na `user_roles`:
  ```sql
  create function public.validate_user_role_tenant() returns trigger ...
    if new.project_id is not null then
      if (select organization_id from projects where id = new.project_id) <> new.organization_id
        then raise exception 'tenant mismatch';
      end if;
      if not exists (select 1 from organization_members
                     where user_id = new.user_id and organization_id = new.organization_id)
        then raise exception 'user not in organization';
      end if;
    end if;
  ```
  Trigger BEFORE INSERT/UPDATE.
- Analogický trigger na `project_members`: user musí být v `organization_members` organizace projektu.
- SELECT policies zůstávají čitelné pro authenticated dle A.3 v předchozí revizi.

### A.3 Sjednocený scan-code model (kontrakt pro Checkpoint D)
V Checkpointu A **netvoříme**, ale kontrakt fixovaný:

```sql
create type public.scan_entity_type as enum (
  'SPOOL','ENDPOINT','DISPENSER_UNIT','DISPENSER_SLOT'
);

create table public.scan_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  entity_type public.scan_entity_type not null,
  entity_id uuid not null,
  token text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_by uuid references auth.users(id)
);
create unique index scan_codes_active_per_entity
  on scan_codes(entity_type, entity_id)
  where active;
```

- Token = 256bit random URL-safe base64, plaintext (fyzicky vytištěný, není autorizační).
- Resolver: jeden lookup podle `token` → autorizace přes `is_org_member` a — pokud `project_id` nenull — `is_project_member`.
- Integrita `entity_id` kontrolovaná RPC/triggerem podle `entity_type` (RPC při zápisu ověří, že `entity_id` existuje v odpovídající tabulce a patří k `organization_id`/`project_id`).
- QR payload = `https://<app-domain>/s/{token}`. Route `/s/$token` — pokud nepřihlášen, redirect na `/auth?next=/s/{token}`.

---

## B. Fixní kontrakt: Visual Pull Station / Digital Twin

Uloženo do projektové dokumentace (`docs/contracts/visual-pull-station.md`), **žádná implementace v Checkpointu A**. Realizace v D / D+ / E dle fázování níže.

### B.1 Datový model (Checkpoint D)

```sql
-- Šablony fyzických zařízení
create table public.dispenser_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  unit_type text not null,           -- 'DRUM_3_SLOT','SINGLE_UNWINDER','LADDER_ROD','CUSTOM'
  default_slot_count int not null check (default_slot_count > 0),
  geometry_json jsonb,               -- normalized 0-1 slot positions + orientation
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- Verze rozvržení stanoviště (pull_station bude zavedeno spolu s tímto blokem v D)
create type public.pull_station_layout_status as enum (
  'DRAFT','PLANNED','ACTIVE','ARCHIVED'
);
create table public.pull_station_layouts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  pull_station_id uuid not null,     -- FK to pull_stations, zavedeno v D
  name text not null,
  version int not null default 1,
  status public.pull_station_layout_status not null default 'DRAFT',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
-- Právě jeden ACTIVE layout na pull_station:
create unique index pull_station_layouts_active_unique
  on pull_station_layouts(pull_station_id)
  where status = 'ACTIVE';

create table public.dispenser_units (
  id uuid primary key default gen_random_uuid(),
  pull_station_layout_id uuid not null references pull_station_layouts(id) on delete cascade,
  template_id uuid references dispenser_templates(id),
  unit_code text not null,           -- A, B, C, D, E
  name text,
  position_x numeric not null check (position_x between 0 and 1),
  position_y numeric not null check (position_y between 0 and 1),
  rotation_deg numeric not null default 0,
  display_order int not null,
  active boolean not null default true,
  notes text,
  unique (pull_station_layout_id, unit_code)
);

create table public.dispenser_slots (
  id uuid primary key default gen_random_uuid(),
  dispenser_unit_id uuid not null references dispenser_units(id) on delete cascade,
  slot_code text not null,           -- 'A1','A2','A3'
  display_order int not null,
  local_position_x numeric not null check (local_position_x between 0 and 1),
  local_position_y numeric not null check (local_position_y between 0 and 1),
  side text,                          -- 'FRONT','BACK','LEFT','RIGHT', nullable
  active boolean not null default true,
  max_spool_weight_kg numeric,
  max_spool_diameter_mm numeric,
  current_spool_id uuid,              -- FK k spools, zavedeno v D
  unique (dispenser_unit_id, slot_code)
);
-- Jedna cívka nanejvýš v jednom slotu:
create unique index one_slot_per_spool
  on dispenser_slots(current_spool_id)
  where current_spool_id is not null;
```

`pull_assignments` (Checkpoint D+) rozšířeno o:
```
dispenser_slot_id uuid references dispenser_slots(id),
sequence_number int,
planned_after_assignment_id uuid references pull_assignments(id),
optimizer_score numeric,
optimizer_reasons jsonb
```
+ zachovány partial unique indexy pro `spool_id` a `cable_id` v aktivních stavech. **Nezavádět** `simulator_assignments`.

**Zdroj pravdy pro aktuální kabel slotu** = aktivní `pull_assignment` se stejným `dispenser_slot_id`. `dispenser_slots.current_spool_id` je zdroj pravdy pro fyzické osazení slotu cívkou; kabel čte přes assignment. Změna slotu cívky = audit event + concurrency check + supervisor confirmation pokud tah `ACTIVE`.

### B.2 Moduly (fázování)

- **D (Equipment & Static Layout):**
  1. Equipment Template Editor
  2. Station Layout Editor (drag-and-drop canvas, normalized 0–1 souřadnice)
  3. Spool Mounting Mode (drag-and-drop / manual / QR spool→slot / QR slot→spool)
  4. Batch Setup View (statické zobrazení bez optimizeru)
- **D+ (Optimizer & Simulation):**
  5. Automatic Layout Suggestion — deterministický optimizer s pevnými hard constraints (správný cable_type, cívka v jednom slotu, kabel v jednom aktivním assignmentu, dostatečný conservative remaining, kapacita slotů, deaktivovaný slot vyloučen, blokovaný kabel vyloučen) a soft goals (společná trasa, seskupení větví, minimalizace křížení, výměn a přestaveb, konzistentní pořadí odbočení, bezpečná rezerva).
  6. Simulation / Rehearsal Mode (krokování, auto-play, simulace failure scénářů, přepočet varianty).
  7. Scenario Comparison (metriky: skupiny, průchody, výměny, přestavby, využití, časy, metry, rizika, počet rozhodnutí).
  8. Assignment queue per slot.
- **E (Live & Offline):**
  9. Live Station Mode (mobil/tablet, klepnutí na slot → instrukce bez QR).
  10. Offline execution (sync layout, jednotky, sloty, cívky, assignment queue). Offline **povoleno**: otevřít synchronizovaný layout, otevřít slot, zahájit/dokončit připravený assignment, přejít na předem rezervovaný další, zaznamenat metráž a problém. Offline **zakázáno**: přesun cívky mezi sloty bez rezervace, dynamický assignment, cizí rezervovaná cívka, supervisor override.
  11. QR Reconciliation Mode.
  12. Conflict resolution přes `lock_version` na assignments a slotech.

### B.3 QR a Visual hybridní pravidla (Checkpoint E)
- QR není povinný před každým kabelem.
- Sestavení stanoviště: scan/výběr cívky → přiřazení slotu.
- Během tahu: pracovník používá grafické sloty, žádné opakované scanování.
- Výměna: scan nové cívky nebo ruční supervisor confirm.
- Nesoulad: režim Reconcile Station ověří všechny sloty proti fyzice.
- Fyzický přesun cívky → aktualizace `dispenser_slots.current_spool_id` s audit + concurrency + supervisor confirm pokud tah ACTIVE.

### B.4 Akceptační scénář (bude ověřen na konci Checkpointu E)
Přesně dle vaší specifikace: layout 4×3 sloty, přidání dočasné jednotky E, přiřazení C-014 do A1, optimizer 201+204, grafické zobrazení, simulace, autopostup na 204 po dokončení 201, scénářové srovnání 12 vs 15 slotů, Live Mode instrukce bez QR, spotřeba a auto-posun slotu, QR ověření po fyzické výměně, konkurenční ochrana proti duplicitnímu assignmentu.

---

## C. Checkpoint A — deliverables (nezměněno oproti revizi 2, s vloženými opravami A.1/A.2)

### C.1 Databázové schéma (jediná migrace)

Enums:
- `app_role` (admin, project_manager, site_lead, puller, rack_technician, test_technician, viewer)
- `project_status` (planning, active, on_hold, completed, archived)

Tabulky: `organizations`, `profiles` (žádné `organization_id`; `default_organization_id` nullable jen jako UI hint), `organization_members`, `projects`, `project_members`, `user_roles` (s dvěma partial unique indexy dle revize 2), `audit_events`.

Sloupce `projects`: `id, organization_id, code, name, address, customer, status, timezone, default_cable_type, default_rack_reserve_m, default_endpoint_reserve_m, default_vertical_allowance_m, default_handling_factor, use_compound_panel_port_ids, is_demo, created_at, updated_at, created_by`, unique `(organization_id, code)`.

### C.2 Security-definer funkce
- `has_org_role`, `has_project_role`, `is_org_member`, `is_project_member`, `share_org` — vše `stable`, `security definer`, `set search_path = public`, execute pro `authenticated`.

### C.3 Transakční RPC (nové v této revizi)
- `create_organization_tx(text)` — atomicky org + member + admin role + audit.
- `add_project_member_tx(uuid, uuid, app_role)`
- `remove_project_member_tx(uuid, uuid)`
- `set_project_role_tx(uuid, uuid, app_role, boolean)`
- `create_project_tx(uuid, text, text, ...)` — atomicky project + creator jako project_member + PM role + audit.

Všechny `SECURITY DEFINER`, s explicitní autorizací uvnitř (kontrola `has_org_role` / `has_project_role`), `set search_path = public`, `grant execute to authenticated`.

### C.4 GRANT + RLS + policies
Pro každou tabulku standardní grant a RLS enable. Policies:

- `organizations`: SELECT `is_org_member`, UPDATE/DELETE `has_org_role admin`. **Žádná INSERT policy** — pouze přes RPC.
- `profiles`: SELECT vlastní + přes `share_org`; INSERT/UPDATE vlastní; DELETE service_role.
- `organization_members`: SELECT `is_org_member`; INSERT/DELETE `has_org_role admin` (org-level členství admin může spravovat přímo, ale s trigger validací že user existuje).
- `projects`: SELECT `is_project_member` OR `has_org_role admin`. **Žádná INSERT/UPDATE/DELETE policy** — přes `create_project_tx` a `update_project_tx`.
- `project_members`: SELECT `is_project_member`. **Žádná INSERT/UPDATE/DELETE policy** — přes RPC.
- `user_roles`: SELECT vlastní OR `has_org_role admin`. INSERT/UPDATE/DELETE **jen** přes RPC (žádná policy). Validační trigger jako druhá vrstva.
- `audit_events`: SELECT `has_org_role admin`. Žádná INSERT/UPDATE/DELETE policy pro authenticated.

### C.5 Triggery
- `handle_new_user` na `auth.users` insert → vytvoří `profiles`.
- `validate_user_role_tenant` BEFORE INSERT/UPDATE na `user_roles`.
- `validate_project_member_tenant` BEFORE INSERT na `project_members`.
- Generický `audit_row` AFTER INSERT/UPDATE/DELETE na `organizations, projects, project_members, organization_members, user_roles` (`SECURITY DEFINER`, zapisuje do `audit_events`).

### C.6 Auth flow (frontend)
- `supabase--configure_social_auth google` v tomto checkpointu.
- `/auth` — email/heslo + Google přes `lovable.auth.signInWithOAuth`.
- `/_authenticated/route.tsx` — integration-managed.
- `/onboarding` — pokud uživatel není v žádné org → formulář „vytvořit organizaci" → `createOrganization` server fn.
- Root `onAuthStateChange` listener v `__root.tsx` (SIGNED_IN/SIGNED_OUT/USER_UPDATED filter).
- Bearer `functionMiddleware` v `src/start.ts`.
- Sign-out hygiene: `cancelQueries` → `clear` → `signOut` → `navigate({ to: '/auth', replace: true })`.

### C.7 UI (Checkpoint A)
- Head: `title="PullOps"`, `description="Plánování a provedení strukturované kabeláže"`. Žádné „Lovable App".
- `/` public landing (jednoduchý, ne AI-generic; průmyslová paleta, vysoký kontrast, sans-serif jiný než Inter/Poppins — navrhnu např. **Space Grotesk** headings + **Inter** body… nebo raději **IBM Plex Sans** kvůli technickému charakteru; pokud máte preferenci, dejte vědět, jinak volím IBM Plex Sans + IBM Plex Mono pro human IDs).
- `/auth`, `/onboarding`.
- `/_authenticated/`:
  - `/` dashboard (přepínač org, seznam projektů, „nový projekt" tlačítko dle rolí).
  - `/organizations/$orgId/settings` — CRUD org členů + org rolí.
  - `/projects/$projectId/` — shell s info projektu + poznámka „Obsah přijde v Checkpointu B".
  - `/projects/$projectId/members` — CRUD projektových členů + rolí.
  - `/projects/$projectId/settings` — editace defaultů + `use_compound_panel_port_ids` + `is_demo`.
  - `/audit` — admin only.
- Design tokens v `src/styles.css` (semantické, žádné hardcode barvy v komponentách).

### C.8 Server functions (Checkpoint A)
Všechny v `src/lib/*.functions.ts`, `.middleware([requireSupabaseAuth])`, volají RPC:
- `createOrganization`, `updateOrganization`, `listMyOrganizations`.
- `createProject`, `updateProject`, `listMyProjects`.
- `addProjectMember`, `removeProjectMember`, `setProjectRole`.
- `setOrgRole` (grant/revoke).
- `addOrgMember` (pro Checkpoint A: admin přidá existujícího uživatele podle emailu přes `supabaseAdmin` uvnitř handleru po autorizaci; e-mailové pozvánky odkládám do B).
- `listAuditEvents({ organizationId, limit, before })`.

### C.9 Testy (Definition of Done)
1. `bun run build` bez chyb.
2. `bunx vitest run` — Zod schéma testy zelené.
3. `scripts/rls-smoke.ts` (2 uživatelé ze 2 organizací) ověří:
   - user_a nevidí projekty user_b (RLS reject).
   - Přímý client INSERT do `organizations`, `projects`, `project_members`, `user_roles` selže (policy chybí).
   - `createOrganization` RPC funguje; při vyvolané chybě uvnitř transakce (např. duplicitní jméno / mock injected fail) nezůstane osiřelý řádek.
   - `add_project_member_tx` odmítne user_b (není v org).
   - Trigger `validate_user_role_tenant` odmítne přímý insert s nesouhlasným tenantem (pokusíme se přes service_role, kde RLS neplatí, aby trigger reálně chytil).
   - `audit_events` immutable (UPDATE/DELETE reject).
   - `has_project_role` vrací true pro org admina i bez projektové role.
4. Playwright headless smoke: signup → onboarding → create project → invite user → sign-out replace.
5. Head metadata není „Lovable App".
6. `/` není placeholder.

**Po splnění DoD zastavím a čekám na schválení Checkpointu B.**

---

## D. Fixní kontrakty pro pozdější checkpointy (bez implementace teď)

- **B:** normalized coords 0–1 s CHECK, two-point kalibrace autoritativní.
- **C:** `cables.patch_port_id` jediný zdroj pravdy, žádný `patch_panel_id`, žádný `patch_ports.cable_id`. Import review bez `Hodiny_kabeláž_ČB2.xlsx`.
- **D:** jednotný `scan_codes` (B.3 kontrakt A.3). `dispenser_templates`, `pull_station_layouts`, `dispenser_units`, `dispenser_slots` (B.1). Equipment Template Editor, Station Layout Editor, Spool Mounting, Batch Setup View. `spools.active_assignment_id` **nezavádět** — zdroj pravdy `pull_assignments`.
- **D+:** optimizer, simulation, scenario comparison, assignment queue s `pull_assignments` rozšířeními.
- **E:** Live Station Mode, offline execution s definovanými povolenými/zakázanými operacemi, QR reconciliation, conflict resolution.

Po vašem schválení začnu Checkpointem A přesně v rozsahu C.
