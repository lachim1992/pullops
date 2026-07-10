# Checkpoint C+ — Racky, patch panely a plánovač tras

## Cíl

1. Rack je samostatná entita s pozicí na plánu.
2. Patch panel patří pod rack; jeho porty drží konkrétní kabely.
3. V editoru se kabel vytváří z **volného portu → cíle na plánu** — trasa vzniká automaticky.
4. Trasa jde přes **sdílený kmen (bundle)** + krátkou odbočku k endpointu. Nové kabely se auto-přiřadí k nejbližšímu kmenu.
5. Po kalibraci se spočítá odhadovaná metráž (kmen + větev + rezervy).

## Datový model (migrace)

- **`racks`** — nová tabulka: `project_id`, `floor_plan_id`, `code`, `name`, `x`, `y`, `notes`. RLS jako ostatní projektové entity, tenant-validace trigger.
- **`patch_panels`** — doplnit `rack_id uuid null references racks(id) on delete set null`. Ponechat `floor_plan_id` (pro panely mimo rack).
- **`cable_bundles`** — nová: `project_id`, `floor_plan_id`, `code`, `points jsonb` (polyline v normalizovaných souřadnicích), `rack_id nullable` (kmen typicky vychází z racku), `notes`.
- **`cables`** — doplnit `bundle_id nullable references cable_bundles`, `branch_points jsonb null` (krátká odbočka od bundle k `to_endpoint_id`).
- Odstranit využití `endpoints` typu `PATCH` pro racky (data zůstanou, ale editor je nevytváří). Rack pozice slouží jako zdrojová pozice pro kabely v jeho panelech.

Všechny nové tabulky: `GRANT` na `authenticated` + `service_role`, RLS scoped přes `is_project_member`, tenant trigger.

## Server functions

- `src/lib/racks.functions.ts` — CRUD (`listRacks`, `createRack`, `updateRack` (pozice), `deleteRack`).
- `src/lib/patchPanels.functions.ts` — rozšířit `listPatchPanels` o `rack_id`, přidat `assignPanelToRack`. `getPatchPanel` už vrací porty; přidat joined kabely na portu (`cable`).
- `src/lib/cableBundles.functions.ts` — `listBundles`, `createBundle(points, rackId?)`, `updateBundlePoints`, `deleteBundle`.
- `src/lib/cables.functions.ts` — nová `createCableFromPort({ portId, toEndpointId | newEndpoint: {x,y,label}, bundleId?, branchPoints? })`. Automaticky:
  1. vytvoří (nebo použije) `endpoint`,
  2. spáruje `cables.from_port_id = portId`, `to_endpoint_id`,
  3. najde nejbližší bundle (pokud `bundleId` nedán) → přiřadí,
  4. spočítá `branch_points` jako úsečku z bodu na kmeni k endpointu (uživatel může přeeditovat).
- `src/lib/length.ts` — přidat `computeCableLengthFromBundle({ bundleAnchorIndex, bundlePoints, branchPoints, calibration, reserveM })`. Rozšířit existující engine, ne nahradit.

## UI

### Záložka Patch panely
- Levý sloupec: seznam racků + tlačítko „Nový rack". Klik → strom panelů pod rackem + „Přidat panel".
- Panel řádek expanduje na tabulku portů: `#` · label · **přiřazený kabel (code, cíl endpoint)** · akce „vytvořit endpoint na plánu".
- Volné porty jsou zvýrazněné (badge „volný").

### Editor plánu (nový mód „Plánovač tras")
Přepínač módů: `Endpointy · Racky · Kmeny · Trasy · Kalibrace`.

- **Racky mód** — klik na plán = nový rack (dialog: kód, přiřadit panely). Existující racky se táhnou drag&drop.
- **Kmeny mód** — kliknutím se kreslí polyline (Enter/dvojklik = ukončit). Kmen dostane kód `BND-01` atd. Editace = klik na segment → přidat/smazat bod.
- **Trasy mód** — vlevo panel „Volné porty" seskupené po panelech/rackách. Vybereš port(y), pak klik na plán = nový endpoint + kabel(y) + auto-přiřazení k nejbližšímu kmeni + auto-větev.
- Panel detailu kabelu: bundle · anchor bod na kmeni (posuvník podél kmene) · body větve · vypočtená metráž s rozpisem (kmen X m + větev Y m + rezervy Z m).

Zoom/pan zůstane.

### Detail kabelu (`cables.$cableId.tsx`)
- Sekce „Trasa": kmen (link), délka kmene, délka větve, rezervy, celkem. Náhled mini-plánku s vyznačenou trasou.

## Migrace demo dat

`seedCeskeBudejoviceDemo` rozšířit:
- vytvoří 1–2 racky, k nim přiřadí existující patch panely,
- vytvoří 1 kmen `BND-01` napříč patrem,
- pro pár kabelů automaticky vytvoří endpointy + auto-přiřazení k `BND-01` s krátkou větví.

## Postupný rollout (jeden PR = jedna migrace)

1. **DB migrace** — `racks`, `cable_bundles`, `cables.bundle_id/branch_points`, `patch_panels.rack_id`. RLS + triggery + GRANTy.
2. **Server functions** — `racks`, `cableBundles`, `createCableFromPort`, length engine rozšíření.
3. **Patch panels UI** — strom rack → panel → porty s kabely.
4. **Editor** — nové módy Racky, Kmeny, Trasy; auto-přiřazení, výpočet.
5. **Cable detail** — sekce Trasa.
6. **Demo seed** — racky + kmen + auto-větve.
7. **Verifikace** — `bunx tsgo --noEmit`, Playwright smoke test celého toku (nový rack → panel → port → klik na plán → vidím trasu a metráž).

## Technické detaily

- `branch_points` = pole normalizovaných bodů začínající kolmicí (nebo nejbližším bodem) na kmen. Když je prázdné, engine spočítá kolmici automaticky.
- Auto-přiřazení k bundlu: pro nový endpoint najdeme kmen s nejmenší kolmou vzdáleností (přes všechny segmenty všech kmenů v plánu); ukládáme jen `bundle_id` — anchor se dopočítává, ale lze ho manuálně zafixovat editací `branch_points[0]`.
- `computed_length_m` v `cables` zůstává jako cache; přepočítá se v server fn po každé změně bundle/branch/route.
- PATCH endpointy z předchozí iterace: demo je přestane vytvářet, existující zůstanou (nezasahujeme do produkčních dat).

Po odsouhlasení začnu bodem 1 (migrace).
