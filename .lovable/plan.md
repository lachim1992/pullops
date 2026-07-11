## Cíl

Zprovoznit tři propojené věci: (1) opravit neviditelné vygenerované trasy, (2) postavit plnohodnotný **Režim tahání** pro techniky, (3) přidat **Členové – pozvat emailem** a novou záložku **Úkoly** s přiřazováním na den.

---

## 1. Bugfix — vygenerované trasy nejsou v seznamu

**Hypotéza (ověřím před opravou):** `autoAssignBundlesForPlan` vytvoří `cable_routes` řádky, ale buď (a) nezaloží `cable_route_points` (trasa bez bodů → filtr `points.length > 0` ji skryje), (b) přiřadí je pod jiný `plan_id`/`floor_plan_id`, nebo (c) `listCableRoutes` filtruje jen ty s ne-null `bundle_id`. Zkontroluji SQL po vygenerování, opravím konkrétní příčinu, přidám vitest.

**Akce:** oprava generátoru + doplnění chybějícího zápisu bodů/plan_id + refetch invalidace `["cable-routes", planId]` po generování.

---

## 2. Režim tahání (Pull Mode)

Nová routa `projects.$projectId.pull.tsx` (dostupná všem členům projektu, ne jen adminům).

**Layout: split-view**

```text
┌──────────────────────────┬────────────────────┐
│                          │  Moje úkoly dnes   │
│      MAPA plánu          │  ────────────────  │
│  • kmeny (linie)         │  ☐ Kabel A-01  ✎📷│
│  • trasy (tenké linie)   │  ☐ Kabel A-02  ✎📷│
│  • endpointy (klik)      │  ☑ Kabel A-03      │
│  • patch panely          │  ────────────────  │
│                          │  Filtr: [dnes ▾]   │
│                          │  [jen moje ☑]      │
└──────────────────────────┴────────────────────┘
```

**Chování:**
- Přepínač plánů (pokud jich je víc).
- Klik na kabel v seznamu → highlight jeho trasy na mapě + zoom.
- Klik na endpoint na mapě → zobrazí kabely daného endpointu v pravém panelu.
- Checkbox „hotovo" → `cables.pull_status = 'done'` + `cables.pulled_at = now()` + `pulled_by = auth.uid()`.
- Tlačítko poznámky/foto na řádku kabelu → dialog: text + upload do `cable-photos` bucketu (nový).
- Read-only pro editační funkce: nelze mazat kmen, kreslit, měnit typ.

---

## 3. Úkoly (Tasks) — nová záložka

Routa `projects.$projectId.tasks.tsx` (viditelná project_managerům a adminům pro editaci; technici vidí jen své).

**Model úkolu (ad-hoc granularita dle odpovědi):**
- title, description
- assigned_to (user_id, člen projektu)
- scheduled_date (den)
- status: pending / in_progress / done
- vazba na kabely přes join tabulku `pull_task_cables` (M:N) — vedoucí ručně vybere kabely z registru
- vazba na plán (volitelně)

**UI vedoucího:**
- Kalendářový/list view úkolů projektu
- „Nový úkol" → dialog: title, den, přiřadit členu (select z project_members), vybrat kabely (multi-select s filtrem)
- Edit/smazat

**UI technika (v Pull Mode):**
- Filtr „Moje úkoly na [datum]" agreguje kabely ze všech `pull_task_cables` kde `assigned_to = auth.uid() AND scheduled_date = <dnes>`.

---

## 4. Členové — pozvat emailem

**Rozšíření `organizations.$orgId.settings.tsx` a `projects.$projectId.members.tsx`:**
- Input „Email" + tlačítko „Pozvat"
- Server function `invite_member_to_org_tx(email, org_id, role)`:
  - Pokud user existuje → přidat do org rovnou (dnešní chování)
  - Pokud neexistuje → INSERT do nové tabulky `pending_invitations` (email, org_id, project_id?, role, token, expires_at) + odeslat email přes **Lovable Emails** (auth-email scaffold) s odkazem `/invite?token=…`.
- Route `/invite`: pokud user není přihlášen → sign-up flow (email předvyplněn); po přihlášení → RPC `accept_invitation_tx(token)` přidá do org/projektu.

---

## 5. Databázové změny (jedna migrace)

```sql
-- Pull mode stav na kabelu
ALTER TABLE cables
  ADD COLUMN pull_status text NOT NULL DEFAULT 'pending'
    CHECK (pull_status IN ('pending','in_progress','done')),
  ADD COLUMN pulled_at timestamptz,
  ADD COLUMN pulled_by uuid REFERENCES auth.users(id),
  ADD COLUMN pull_note text;

-- Foto k pull akci
CREATE TABLE cable_pull_photos (
  id uuid PK, project_id, cable_id, storage_path, uploaded_by, created_at
);

-- Úkoly
CREATE TABLE tasks (
  id, project_id, title, description, assigned_to, scheduled_date,
  status, created_by, created_at, updated_at
);
CREATE TABLE task_cables (
  task_id, cable_id, PRIMARY KEY (task_id, cable_id)
);

-- Pozvánky
CREATE TABLE pending_invitations (
  id, organization_id, project_id nullable, email, role,
  token uuid unique, invited_by, expires_at, accepted_at nullable
);

-- Storage bucket cable-photos (private)

-- RPCs: accept_invitation_tx, invite_member_to_org_tx,
--       mark_cable_pulled_tx, assign_task_tx
```

Všechny tabulky: GRANT + RLS scoped přes `is_project_member` / `has_project_role`.

---

## 6. Technické detaily

- **Pull Mode routa je pod `_authenticated`** ale bez admin gate — každý project_member vidí.
- **Emaily**: použiju `email_domain--scaffold_auth_email_templates`, přidám nový template `member-invitation.tsx` do transactional scaffoldu.
- **Bucket `cable-photos`**: private, signed URLs.
- **Zachování** existující logiky endpointů, kmenů, bundle segmentů — žádné breaking změny.

---

## Pořadí implementace

1. Diagnóza + fix bugu neviditelných tras (+ vitest).
2. Migrace (schema + RLS + RPCs).
3. Server functions (`tasks.functions.ts`, `invitations.functions.ts`, `pullMode.functions.ts`).
4. Routa Pull Mode + Task management UI.
5. Rozšíření Members o invite email.
6. Auth-email scaffold + invitation template.
7. Playwright smoke: přihlásit techniku, otevřít Pull Mode, odškrtnout kabel, ověřit v DB.

---

## Předpokládaný rozsah

~1 migrace, ~6 nových server-fn souborů, ~3 nové routy, ~4 nové komponenty. Doba: velký checkpoint, budu commitovat po fázích.

## Před startem potřebuji odsouhlasit 2 věci

- **Emailová doména**: máš už nastavenou v Lovable Cloud? Pokud ne, spustím setup dialog jako první krok (bez toho pozvánky přes email nefungují — vrátíme se k „přidat existujícího usera").
- **Role pro pull mode**: stačí, že je uživatel `project_member` (jakákoli role), nebo chceš rozlišovat roli `technician` samostatně (zatím žádný `technician` role v `app_role` enum není)?