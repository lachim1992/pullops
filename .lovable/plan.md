# Audit stávajícího systému rezerv

**Kde se rezerva dnes používá:**
- `cable_types.default_reserve_m` — jediný zdroj rezervy
- `length.ts` → `computeCableLength({ reserveM })` — přičítá `2 × reserveM` (obě strany stejně)
- `cables.functions.ts` → `recomputeOne` — načte rezervu z `cable_types`
- `pullTasks.functions.ts` → agregace, také z `cable_types`

**Problémy:**
- Neumí rozlišit, že rack má jinou realitu (kratší přebytek) než venkovní kiosek (dlouhý přebytek)
- Neumí zohlednit vertikální trasy neviditelné ve 2D
- `endpoint_kind` je jen enum bez data — nelze uživatelsky rozšiřovat

# Cílový model

**Rezerva se počítá per strana kabelu podle typu endpointu na dané straně.** Endpoint kind přebíjí rezervu z typu kabelu. Součet obou stran = celková rezerva.

```text
cable.length = polyline × meters_per_unit + reserve_from + reserve_to
```

## Nová tabulka `endpoint_kinds` (per-projekt)

Sloupce: `project_id`, `organization_id`, `code` (string, uniq per projekt), `label` (CS), `default_reserve_m`, `color`, `icon` (Lucide jméno), `sort_order`, `is_system` (bool — systémové nelze smazat, jen editovat rezervu/label).

Vazba: `endpoints.endpoint_kind` zůstane `text`; nově odkazuje na `endpoint_kinds.code` v rámci projektu (bez FK — enum-like, aby migrace nezlomila existující data).

**Seed při vytvoření projektu (rozšíření `create_project_tx`):** nasadí systémové typy s výchozími rezervami dle domluvy:

| code | label | reserve (m) |
|---|---|---|
| WORKSTATION | Pracoviště / PC | 3 |
| MONITOR | Monitor | 3 |
| AP | Wi-Fi AP | 2 |
| CAMERA | Kamera | 2 |
| SOCKET | Datová zásuvka | 3 |
| TRUNK_STRIP | Lišta | 3 |
| CEILING | Strop | 1 |
| KITCHEN | Kuchyně | 3 |
| KIOSK | Kiosek | 5 |
| OUTDOOR_KIOSK | Venkovní kiosek | 5 |
| OUTDOOR_CABLE | Venkovní kabel | 5 |
| PATCH | Patch / rack | 4 |
| OTHER | Jiné | 3 |

Existujícím projektům doplní migrace stejný seed idempotentně.

## Změny v engine

`computeCableLength` — nová signatura:
```ts
{
  routePoints, manualRouteLengthM, calibration,
  reserveFromM: number,   // podle from_endpoint.kind
  reserveToM: number,     // podle to_endpoint.kind
  overrideCableLengthM
}
```
`reserveM` (starý parametr) zůstane volitelně jako fallback (pokud jsou obě `reserveFrom/To` nedodány → `2 × reserveM` jako dřív), aby netříštil kompatibilitu testů.

## Změny v resolveru rezerv (server)

Nová interní helper `getEndpointReserve(supabase, projectId, endpointId, cableTypeId)`:
1. načti `endpoints.endpoint_kind`
2. `select default_reserve_m from endpoint_kinds where project_id=? and code=?`
3. fallback na `cable_types.default_reserve_m`, pak 0

Použije se v:
- `cables.functions.ts` `recomputeOne` — načte from/to endpoint kind → dvě rezervy
- `pullTasks.functions.ts` `simulateSpools` — dtto (batch: načti `endpoint_kinds` do mapy jednou)

`cable_types.default_reserve_m` **neodstraníme** — slouží jako fallback, když kabel nemá endpoint na dané straně (např. patch↔patch bez endpointu, nebo neuzavřený kabel).

## Nové server funkce

`src/lib/endpointKinds.functions.ts`:
- `listEndpointKinds({ projectId })`
- `createEndpointKind({ projectId, code, label, defaultReserveM, color?, icon?, sortOrder? })`
- `updateEndpointKind({ id, ... })`
- `deleteEndpointKind({ id })` — jen pokud `is_system=false`

## Změny v UI

**Nová stránka:** `/projects/:id/endpoint-kinds` — tabulka: kód, název, rezerva (m), barva, ikona, systémový. Inline editace rezervy a labelu. Tlačítko „Přidat vlastní typ". Odkaz z Nastavení projektu.

**Aktualizace `src/lib/endpointKinds.ts`:** místo statické konstanty přejde na React hook `useEndpointKinds(projectId)` (načte z DB a cachuje). Fallback ikona/barva pro custom typy. Systémové výchozí (statická konstanta) zůstane jako defaults pro seedovací migraci.

**Editor plánu** (`plans.$planId.tsx`) — select endpoint kind se plní z DB, nikoli konstanty.

**Detail kabelu** — přidat řádek „Rezerva: from X m + to Y m = Z m" pro transparenci.

# Migrace

```sql
-- 1. tabulka
CREATE TABLE public.endpoint_kinds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  organization_id uuid not null,
  code text not null,
  label text not null,
  default_reserve_m numeric not null default 3 check (default_reserve_m >= 0),
  color text,
  icon text,
  sort_order int not null default 100,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code)
);

-- 2. grants + RLS: read = project member, write = admin/PM na projektu
-- 3. tenant validace + updated_at trigger
-- 4. seed: pro každý existující projekt vlož 13 systémových typů (ON CONFLICT DO NOTHING)
-- 5. rozšířit create_project_tx() aby seedoval při vytvoření
```

# Rollout (pořadí commitů)

1. **Migrace** — tabulka + seed + rozšíření `create_project_tx`.
2. **Server layer** — `endpointKinds.functions.ts`, helper `getEndpointReserve`, update `length.ts` (nové parametry, backward-compat), update `cables.functions.ts` + `pullTasks.functions.ts`.
3. **UI** — stránka nastavení typů, hook `useEndpointKinds`, přepis pickerů v editoru plánu.
4. **Recompute** — tlačítko „Přepočítat všechny kabely" v Nastavení projektu (už existuje? pokud ne, jednorázový server fn).

# Otevřené otázky (mohu rozhodnout sám, ale ptám se)

- **Přepočet existujících kabelů:** spustit ihned po migraci pro všechny projekty, nebo nechat na uživatele (tlačítko)? → navrhuji **automaticky** v samostatné neinvazivní server fn po migraci.
- **Ikona custom typu:** dovolit uživateli zadat Lucide jméno stringem (validace vůči seznamu), nebo pevný set 6–8 obecných ikon k výběru? → navrhuji **pevný set** (Plug, Wifi, Cctv, Monitor, Server, Warehouse, Utensils, HelpCircle) + color picker.

Pokud souhlasíš, začnu migrací a serverovou vrstvou.
