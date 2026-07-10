## Cíl

Dokončit Checkpoint C (délkový engine na trasách) + rozšířit editor plánu tak, aby endpoint fungoval jako **operační jednotka** — pod jeden endpoint na plánu (např. jedna zásuvka / stolek) lze seskupit více kabelů z registru, které pak v Pull módu (Checkpoint E) potáhneme společně po stejné trase Rack → Endpoint.

## Datový model (migrace)

**Nová tabulka `public.endpoint_cable_groups`** — spojka endpoint × kabel:
- `endpoint_id` FK → `endpoints`, `cable_id` FK → `cables` (unique per pár)
- `project_id`, `sequence` (int, řazení tažení uvnitř skupiny), `notes`
- RLS: čtení a zápis členy projektu; tenant validace triggerem (endpoint.project = cable.project = row.project)

**Rozšíření `cable_routes`**:
- přidat `rack_endpoint_id uuid null` (rack point = endpoint typu PATCH/RACK, definuje start trasy)
- držíme stávající `from_endpoint_id`/`to_endpoint_id`, ale UI je bude pojmenovávat **Rack point** a **End point**
- volitelně `default_route boolean` — trasa se automaticky použije pro všechny kabely v endpoint-skupině, které nemají explicitní `cables.route_id`

**Rozšíření `endpoints`** (drobné):
- `endpoint_kind` doplnit hodnotu `RACK` (pro rack pointy patch panelu na plánu)

Migrace zahrnuje GRANT + RLS policies + tenant trigger `validate_endpoint_cable_group_tenant`.

## Server funkce

Nové v `src/lib/endpointGroups.functions.ts`:
- `listEndpointCables({ endpointId })` — kabely pod endpointem + jejich stav (route_id, patch_port)
- `addCablesToEndpoint({ endpointId, cableIds })` — hromadné přiřazení
- `removeCableFromEndpoint({ endpointId, cableId })`
- `reorderEndpointCables({ endpointId, orderedCableIds })`
- `assignRouteToEndpointCables({ endpointId, routeId })` — nastaví `cables.route_id` všem kabelům skupiny (pro Pull mode)

Doplnit v `src/lib/cableRoutes.functions.ts`:
- při `updateRoute` umožnit nastavit `rackEndpointId`
- nový `computeRouteLengthForCable({ cableId })` — používá stávající `computeCableLength` z `@/lib/length` (route points + kalibrace + rezervy z projektu/kabelu), Checkpoint C engine

## Editor plánu (`plans.$planId.tsx`)

1. **Přejmenování módů:** „Endpointy" ponechat, „Trasy" upravit tak, že se zakládají volbou **Rack point** (dropdown endpointů typu RACK/PATCH) + **End point** (libovolný endpoint) → automaticky vznikne trasa.
2. **Klik na endpoint** v plánu (mimo mode=route) otevře **panel Endpoint** vpravo místo generického dropdownu:
   - hlavička: kód, typ, kolik má kabelů
   - sekce **Kabely v této jednotce** — seznam přiřazených kabelů (kód, typ, patch port, stav) + tlačítka „Odebrat" / „Změnit pořadí"
   - dialog **Přidat kabely** — multi-select z nezařazených kabelů projektu (filtr přes ne-přiřazené v této skupině; hledání dle `code`)
   - tlačítko **Použít trasu pro celou skupinu** — pokud endpoint patří jako `to_endpoint_id` do existující trasy, přiřadí `route_id` všem kabelům
3. **Vizualizace:** endpointy s ≥1 kabelem dostanou plný badge s počtem, prázdné zůstávají obrysové. Rack pointy vykreslit jinak (čtverec) než běžné endpointy (kruh).
4. **Trasy panel:** místo dvou volných dropdownů „Od/Do" ukazovat `Rack point` (jen RACK/PATCH endpointy) + `End point`. Délka trasy je nyní **Checkpoint C engine** — z bodů polylinie × mpu + rezervy z projektu.

## Napojení na registr kabelů

- V detailu kabelu (`cables.$cableId.tsx`) přidat pole **Endpoint (jednotka)** — select z endpointů projektu. Zápis → přes `addCablesToEndpoint`.
- V seznamu kabelů sloupec **Jednotka** (kód endpointu) + filtr „nezařazené".

## Demo seed

`seedCeskeBudejoviceDemo` rozšířit tak, aby:
- vytvořil aspoň 2 rack pointy (PATCH1, PATCH2) na plánu,
- 3–4 endpointy typu WORKSTATION,
- pod každým 1–3 kabely z demo registru,
- jednu vzorovou trasu Rack → Endpoint s polyliní a přiřazenými kabely.

## Ověření

- `bunx tsgo --noEmit`
- Playwright: přihlášení do demo projektu → otevřít editor plánu, klik na endpoint → panel se otevře → přidat 2 kabely → vytvořit trasu z rack pointu → „Použít trasu pro skupinu" → zkontrolovat, že kabely v registru mají shodné `route_id` a délka trasy je > 0 m.

## Technické poznámky

- Endpoint-skupina je čistě N:1 (kabel má max jeden endpoint jako operační jednotku). Pokud kabel logicky patří pod jiný fyzický endpoint než `cables.to_endpoint_id`, to je OK — `to_endpoint_id` zůstává fyzická destinace, `endpoint_cable_groups` je logická operační skupina pro tažení.
- Rezervy a kalibrace už existují → engine v `@/lib/length` stačí zavolat s route body a `project.default_*_reserve_m` fallbacky (Checkpoint C).
- Neimplementovat Pull mode UI (to je E) — jen zajistit, že datově je vše připravené: `cables.route_id` nastavené a `endpoint_cable_groups.sequence` definované.
