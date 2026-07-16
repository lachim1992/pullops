# Manažer tahání (Pull Manager)

Kompletní workflow pro fyzické tahání kabelů: od výběru endpointů na půdorysu, přes přiřazení cívek z plánu, po vizuální průběh tahání a auditní frontu kol.

## 1. Uživatelský tok

```text
[Mapa: klikni endpointy] → [Přiřaď relace = kabely]
       → [Trasa přes existující cable_routes → délka]
       → [Auto-návrh cívka pro každý kabel + ruční úprava]
       → [Spusť KOLO (batch = tolik kabelů, kolik je cívek na plánu)]
       → [Runtime obrazovka: která cívka = který kabel, který endpoint právě]
       → [Ukonči kolo] → historie kola do fronty (audit)
       → zpět na mapu, další endpointy, další kolo … opakuj
```

## 2. Nová záložka a struktura stránky

Route: `src/routes/_authenticated/projects.$projectId.pull-manager.tsx` — položka „Manažer tahání“ v projektové navigaci hned vedle „Cívky“.

Tři panely (tabs uvnitř):
- **Mapa & výběr** — půdorys s endpointy, výběr, sestavení kabelů kola.
- **Aktuální kolo** — vizuální panel běžícího kola (cívka ↔ kabel ↔ endpointy).
- **Fronta kol** — historie proběhlých i naplánovaných kol pro audit.

Vstup je vždy vázán na jeden `pull_day_plan` (výběr v hlavičce stránky).

## 3. Datový model (nová migrace)

Nové tabulky (public, s GRANT + RLS + triggery pro tenant):

- `pull_rounds` — jedno „kolo“ tahání
  - `day_plan_id`, `project_id`, `organization_id`
  - `round_number` (seq per plan), `status` `PLANNED|IN_PROGRESS|COMPLETED|CANCELLED`
  - `started_at`, `started_by`, `completed_at`, `completed_by`, `notes`
- `pull_round_items` — jeden kabel v kole (mapování cívka↔kabel pro toto kolo)
  - `round_id`, `cable_id`, `spool_id`, `project_id`, `organization_id`
  - `planned_length_m`, `actual_length_m` (nullable)
  - `status` `PENDING|ACTIVE|DONE|SKIPPED`
  - `sequence` (pořadí uvnitř kola), `started_at`, `completed_at`

RPC:
- `start_pull_round_tx(p_day_plan_id, p_items jsonb)` — atomicky vytvoří `pull_rounds` + `pull_round_items`, validuje že cívky patří plánu, kabely projektu, typ kabelu = typ cívky.
- `complete_pull_round_tx(p_round_id, p_actuals jsonb)` — uzavře kolo, updatuje `spools.current_length_m` o skutečně vytažené metry, u kabelů nastaví `status='PULLED'`, zapíše `pull_assignments` (pro audit / kompatibilitu s existujícím kódem).
- `cancel_pull_round_tx(p_round_id)`.

Historie: každé kolo je nesmazatelný záznam v `pull_rounds` → to je „fronta pro dohledání chyb“.

## 4. Server functions (`src/lib/pullManager.functions.ts`)

- `listPullManagerState({ projectId, dayPlanId })` — vrátí: endpointy, floor plans, cívky přiřazené plánu (+ zbývající délka + typ), existující kola, aktivní kolo.
- `proposePullRoundItems({ dayPlanId, cablePairs: [{fromEndpointId, toEndpointId}] })` — pro každý pár:
  1. najde/vezme existující `cable_route` mezi endpointy (na stejném floor plánu),
  2. spočítá délku pomocí `computeCableLength` (rezervy z endpoint_kinds),
  3. greedy nabídne cívku správného typu s dostatečnou zbývající délkou,
  4. vrátí návrh (bez zápisu do DB) — frontend povolí ruční přehození cívky.
- `startPullRound({ dayPlanId, items })` → volá `start_pull_round_tx`.
- `completePullRound({ roundId, actuals })` → volá `complete_pull_round_tx`.
- `cancelPullRound({ roundId })`.
- `listPullRounds({ dayPlanId })` — pro záložku Fronta.

## 5. UI komponenty

- `PullManagerMap` — reusuje `plan-canvas-surface`; kliknutí = toggle výběru endpointu, dvojklik / tlačítko „Spojit vybrané → kabel“ přidá pár do seznamu kola. Vizualizuje již existující routy pro potvrzené páry.
- `RoundBuilder` — seznam navržených kabelů kola: kód, typ, délka, přiřazená cívka (select mezi cívkami plánu), varování při nesouladu typu/délky. Tlačítko „Spustit kolo“ zapne runtime.
- `ActiveRoundPanel` — velké karty pro každou dvojici `cívka ↔ kabel`:
  - barevný badge cívky (serial), název kabelu, endpointy s ikonami, plán. metry,
  - status per item (`PENDING/ACTIVE/DONE`),
  - vstup „skutečné metry“, tlačítko „Dokončit tahání“ (zavře item),
  - hlavní tlačítko „Ukončit kolo“ — přepne stránku zpět na Mapu.
- `RoundQueueList` — chronologická historie kol se stavem, kdo spustil/dokončil, počet položek, celkové metry; expand ukáže itemy s odchylkou plán vs. skutečnost.

## 6. Business pravidla

- Kolo = přesně tolik itemů, kolik je cívek přiřazených plánu (validace při Start).
- Jedna cívka = jeden item v aktivním kole.
- Kabel musí mít shodný `cable_type_id` s cívkou; jinak blokace + hláška.
- Ukončení kola: nemůže existovat item ve stavu `ACTIVE` bez actuals.
- Zrušení kola: uvolní cívky, nezmění stav kabelů; zůstává v historii.
- Po dokončení kola: kabelům se nastaví `status='PULLED'`, čímž se propíší i do stávající logiky proměření / kompletace.

## 7. Fázování implementace

1. **Migrace** — `pull_rounds`, `pull_round_items`, RPC, GRANT, RLS, triggery.
2. **Server functions** — `pullManager.functions.ts` + doplnění types.
3. **Route + hlavička** — `pull-manager.tsx`, výběr plánu, tabs.
4. **RoundBuilder + proposePullRoundItems** (bez runtime) — user může vytvořit návrh.
5. **StartPullRound + ActiveRoundPanel** — runtime obrazovka.
6. **CompletePullRound + queue list** — uzavření a historie.
7. **Nav item + i18n řetězce** (Czech UI).

## 8. Otevřené předpoklady

- „Optimální trasa“ = existující `cable_route` mezi endpointy (dle vaší volby). Pokud route nebude existovat, návrh zobrazí varování „Chybí trasa — vytvořte ji v záložce Trasy“ a délku spočítá jako přímá vzdálenost × handling factor + rezervy (fallback, ale s badge „odhad“).
- Runtime nezavírá stránku při navigaci — stav se drží v DB (`pull_rounds.status='IN_PROGRESS'`), takže lze pokračovat i po refreshi.

Po odsouhlasení plánu začnu migrací a server functions.
