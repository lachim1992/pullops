
## Cíl

Postavit Režim kompletace jako plán-per-plán editor (stejná struktura jako Pull Mode). Když správce v Pull Mode potvrdí, že plán je nataženo, objeví se v kompletaci. Tam se odškrtávají stavy na endpointech (agregovaně) a na patch panelech (per panel).

## 1) DB (migrace)

**`pull_day_plans`** — nová pole:
- `completion_ready boolean not null default false`
- `completion_ready_at timestamptz`
- `completion_ready_by uuid`

**`endpoints`** — completion pipeline:
- `completion_status text not null default 'PENDING'`
  hodnoty: `PENDING | PULLED | TERMINATED | TESTED | DONE`
- `completion_updated_at timestamptz`

**`patch_panels`** — completion pipeline:
- `completion_status text not null default 'PENDING'`
  hodnoty: `PENDING | WIRED | LABELED | MEASURED | DONE`
- `completion_updated_at timestamptz`

RLS na endpointech / panelech už existuje (member projektu čte, PM/installer píše) — zachovávám. Pro `mark_plan_ready_for_completion` a `set_patch_panel_completion_status` přidám SECURITY DEFINER RPC `mark_plan_ready_for_completion_tx(p_plan_id)` a `set_panel_completion_status_tx(p_panel_id, p_status)`, které kontrolují `has_project_role` PM/installer/admin.

## 2) Server functions — `src/lib/completion.functions.ts` (rozšíření)

Přidám vedle stávajícího kanban API:

- `listCompletionPlans(projectId)` — pull_day_plans kde `completion_ready=true`, s progressem (počet endpointů v DONE / celkem).
- `listPlansReadyToMark(projectId)` — plans které mají 100 % kabelů `PULLED` a `completion_ready=false`. Používá se pro CTA v Pull Mode.
- `markPlanReadyForCompletion(planId)` — RPC výše.
- `getCompletionPlan(planId)` — vrací plan, floor_plan (id, name, level), calibraci, endpointy s kabely (pro agregaci), patch panely na patře. Podklad pro editor.
- `setEndpointCompletionStatus(endpointId, status)` — server-side ověří že všechny příchozí kabely na endpoint jsou v aspoň zvoleném stavu (agregovaný postup).
- `setPatchPanelCompletionStatus(panelId, status)` — přes RPC.

Stávající kabelový kanban (`listCompletionTasks`, `setCompletionStatus`) zůstává — použije se uvnitř `getCompletionPlan` jako zdroj stavu kabelů.

## 3) UI — nová route sekce `/projects/$projectId/completion`

**`completion.index.tsx`** — dashboard:
- Karta na horní pásce: „Připraveno k převzetí z tahání" — plans s ready-to-mark (100 % PULLED), tlačítko **Poslat do kompletace** (PM/admin).
- Grid karet plánů co jsou v kompletaci (stejný vzhled jako Pull Mode výběr plánu na screenu). Progress bar = % endpointů v DONE.
- Sekundární taby stránky: **Plány** (výchozí), **Racky** (přehled patch panelů napříč celým projektem s filtrem podle stavu).

**`completion.$planId.tsx`** — plán editor (stejné rozvržení jako work editor):
- Levá polovina: mapa patra (read-only, zoom/pan). Endpointy jako půlené markery — levá půlka barva typu endpointu, pravá půlka barva stavu completion: šedá PENDING, žlutá PULLED, oranžová TERMINATED, modrá TESTED, zelená DONE. Kabely v plánu se vykreslují ztlumeně.
- Pravý panel s taby:
  1. **Endpointy** — seznam endpointů v plánu, per endpoint tlačítka postupu (PULLED → TERMINATED → TESTED → DONE). Server ověří, že všechny kabely endpointu jsou v aspoň stejném stavu; při klikání na krok se zobrazí i seznam kabelů toho endpointu.
  2. **Racky** — patch panely na patře plánu, per panel stavy WIRED / LABELED / MEASURED / DONE, dostupné jen technikům a PM.

**`completion.tsx`** wrapper s `<Outlet />`.

## 4) Pull Mode — CTA „Poslat do kompletace"

V editoru plánu tahání (`projects.$projectId.work.$planId` nebo obdobná stránka výběru plánů) přidat pás nahoře, pokud je plán 100 % PULLED a `completion_ready=false`: tlačítko **Označit jako nataženo → kompletace** (PM/admin). Po kliknutí volá `markPlanReadyForCompletion`, přesměruje do `/completion/$planId`.

Existující `completion` stránka (kanban kabelů) zůstává jako submenu / redirect na nový index — aby se nezlomily hluboké odkazy, přesouvám ji na `/completion/kanban`.

## 5) i18n / a11y

Všechny texty česky, monospace hlavičky (design system). Barvy stavů čerpám z tokenů (žlutá = warning, zelená = success, modrá = info).

## Pořadí commitů

1. Migrace (pull_day_plans flagy + completion_status na endpoints/patch_panels + RPCs).
2. Server functions rozšířené.
3. `completion.index.tsx` + přesun kanbanu na `/completion/kanban`.
4. `completion.$planId.tsx` editor (mapa + endpoint panel).
5. Rack tab (patch panel completion).
6. CTA „Poslat do kompletace" v Pull Mode.

Potvrď a jdu na migraci.
