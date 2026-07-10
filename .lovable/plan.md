
# Reorganizace plánu + Work Mode

Cílem je udělat editor plánu přehlednější (jedna záložka = jedna činnost) a přidat manažerský režim pro simulaci tahání kabelů.

## 1. Editor plánu — nové záložky

Současné tlačítka (Endpointy / Racky / Kmeny / Trasa z portu / Trasy staré / Kalibrace) se sjednotí na 5 záložek, každá s jinou pravou boční lištou a jiným chováním kliku na mapě:

### Záložka: Endpointy
- Levá mapa: kliknutí = nový endpoint. Existující endpointy jsou přetahovatelné.
- Pravý panel: seznam endpointů na plánu + detail vybraného endpointu se seznamem přiřazených kabelů (dnešní „Přidat kabely" flow).

### Záložka: Racky
- Klik na mapu = nový rack. Existující racky přetahovatelné.
- Pravý panel: detail vybraného racku, editace kódu/názvu **a přiřazení patch panelů k tomuto racku** (checkbox list panelů projektu).
- Po přiřazení panelu se všechny kabely s `from_port` na tomto panelu automaticky považují za „patřící do racku" — v panelu racku se zobrazí jejich počet a seznam (read-only, s odkazem do registru kabelů).

### Záložka: Kmeny
- Klik na mapu = přidat bod do aktuálně editovaného kmene (dnešní chování). Body kmene přetahovatelné.
- Pravý panel: seznam kmenů, výběr **hlavního kmene** (nový flag `is_primary` na `cable_bundles`, unikátní per plán).
- Hlavní kmen se v mapě vykresluje silněji / jinou barvou.

### Záložka: Trasy (nahrazuje „Trasa z portu" + „Trasy staré")
- Klik na mapu **nic nedělá** — je to view režim.
- Tlačítko **„Vygenerovat trasy"** → zavolá `autoAssignBundlesForPlan(overwrite:true)`. Pro každý kabel:
  - Start = pozice racku (přes `from_port → panel → rack`).
  - Průchod = anchor na nejbližším kmeni (přednostně `is_primary` když je blíž než X, jinak nejbližší).
  - Cíl = pozice endpointu.
  - Uloží se do `cables.branch_points`, spočte se metráž přes kalibraci + `reserveM`.
- Pravý panel: tabulka všech kabelů plánu s délkou v metrech, zdrojem (`polyline` / `override` / …), a stavem (má trasu / chybí).
- Legenda barev racku, endpointu, kmene, tras.

### Záložka: Kalibrace
- Beze změn oproti dnešku, jen samostatná záložka.

Sdílené: mapa (SVG s obrázkem podkladu, zoom/pan) zůstává. Přidá se stavová komponenta „aktivní záložka" nahoru (segmented control místo dnešních tlačítek).

## 2. Hlavní menu: Work Mode

Nová top-level route `/_authenticated/projects/$projectId/work` + odkaz v AppShellu („Režim tahání").

Obsah:
- **Přehled**: souhrn projektu — počet kabelů, celková délka (součet `polyline+override+manual_route`), počet spulek podle typu kabelu (dnešní `cable_types.spool_length_m`), odhadovaný odpad.
- **Plán tahání** (seznam kroků):
  1. Auto-návrh pořadí = seskupení kabelů podle `bundle_id` a délky (nejdřív nejdelší běhy v hlavním kmeni, pak větve).
  2. Každý krok = řádek: „Táhnout kabely X, Y, Z spulkou typu CAT6A #2 z RACK-A přes BND-01 do místnosti …", s tlačítky „Označit hotovo / rozpracováno".
  3. Stav se ukládá do nové tabulky `pull_tasks` (task, cable_id, status, started_at, done_at).
- **Simulace spulek**: pro každý cable_type vypočte kolik spulek je potřeba (∑ délek / `spool_length_m`), kolik odpadu vznikne, a která spulka pokrývá které kabely (first-fit-decreasing).
- **Odhad času**: konfigurovatelný `meters_per_hour` per typ; ukáže odhadované člověkohodiny.

Filtry: podle plánu, podle kmene, podle stavu.

## 3. Datové změny (migrace)

```sql
ALTER TABLE cable_bundles ADD COLUMN is_primary boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX cable_bundles_primary_per_plan
  ON cable_bundles(floor_plan_id) WHERE is_primary;

CREATE TABLE pull_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  cable_id uuid NOT NULL REFERENCES cables(id) ON DELETE CASCADE,
  spool_group text,            -- ID logické spulky v rámci projektu
  order_index int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending', -- pending|in_progress|done|skipped
  started_at timestamptz,
  done_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- GRANTy, RLS scoped přes project → organization, updated_at trigger.

ALTER TABLE cable_types ADD COLUMN meters_per_hour numeric; -- volitelné pro odhad
```

## 4. Nové / upravené server functions

- `cableBundles.functions.ts`: `setPrimaryBundle({bundleId})` — nastaví `is_primary=true` a ostatním na plánu na false v jedné transakci (RPC nebo dvě update volání).
- `patchPanels.functions.ts`: `listPanelsByRack({rackId})`, `assignPanelsToRack({rackId, panelIds})` (dnes máme jen `assignPanelToRack` per panel — doplnit bulk).
- `racks.functions.ts`: `listRackCables({rackId})` — joinem přes panely → porty → kabely.
- `pullTasks.functions.ts` (nový): `generatePlan({projectId})`, `listTasks({projectId, filters})`, `updateTask({id, status, notes})`, `simulateSpools({projectId})`.

## 5. Frontend struktura

```text
routes/_authenticated/
  projects.$projectId.plans.$planId.tsx     ← rozdělit interně na 5 pod-komponent (Tab*)
  projects.$projectId.work.tsx              ← nová route
components/plan-editor/
  TabEndpoints.tsx
  TabRacks.tsx
  TabBundles.tsx
  TabRoutes.tsx        (nahradí PortMode + Trasy staré)
  TabCalibration.tsx
  PlanCanvas.tsx       (sdílená SVG mapa, dostává mode + handlers propem)
components/work-mode/
  WorkOverview.tsx
  PullPlanList.tsx
  SpoolSimulation.tsx
```

Segmented control místo dnešní řady tlačítek. AppShell dostane nový odkaz „Režim tahání" v projektovém menu.

## Otevřené otázky / defaulty (můžete potvrdit či změnit až v build módu)

- „Hlavní kmen" = jeden per plán (default). Kdyby jich mělo být víc, řeknete.
- Auto-generování tras = přepíše všechny existující trasy na plánu (overwrite:true). Ne-přepisovací režim ponechám jako alternativu tlačítkem „Doplnit chybějící".
- Pořadí tahání = od nejdelších k nejkratším v rámci hlavního kmene, pak vedlejší kmeny; jinak neseřazujeme podle prostorové geometrie.
- Odhad času vyžaduje `meters_per_hour` per typ; když nebude vyplněno, sloupec se skryje.

## Rozsah po fázích

1. Migrace + `is_primary` + segmented tabs (bez Work Mode).
2. TabRoutes s generováním + tabulkou délek.
3. TabRacks s bulk přiřazením panelů + seznamem kabelů racku.
4. Work Mode: přehled + simulace spulek.
5. Work Mode: pull_tasks CRUD + plán tahání.
