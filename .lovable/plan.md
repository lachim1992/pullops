
Editor plánů je teď přeplácaný — jedna SVG plocha, všechny vrstvy najednou, přepínače módů nedělají to, co uživatel čeká. Přestavíme editor a napojený workflow.

## 1. Rozšířit typy koncových bodů (endpoint_kind)

Migrace do enumu / textového pole `endpoint_kind`:
- `RACK_PORT` (zásuvka v racku — jen pro cross-reference)
- `WORKSTATION` (PC/monitor)
- `SOCKET` (datová zásuvka na zdi)
- `TRUNK_STRIP` (lišta)
- `CEILING` (strop)
- `KIOSK` (kiosek uvnitř)
- `OUTDOOR_KIOSK` (venkovní kiosek)
- `OUTDOOR_CABLE` (venkovní kabel)
- `KITCHEN` (kuchyně)
- `AP` (Wi-Fi AP)
- `CAMERA`
- `MONITOR`
- `PATCH`
- `OTHER`

Každý druh má vlastní ikonu (SVG) a barvu. Racky zůstávají v tabulce `racks` (mají patch panely) — nejsou to endpointy, ale zdroje kabelů.

## 2. Editor plánu — 5 samostatných tabů, každý filtruje canvas

Přepínač módu je teď jen barva tlačítka. Změníme na "režim = úloha" — každý tab má vlastní bok s formulářem A vlastní vrstvu na plánu:

```text
[Endpointy] [Racky] [Kmeny] [Trasy] [Kalibrace]
```

Tab **Endpointy**: canvas zobrazuje POUZE endpointy + slabě podklad. Klik = umístit nový, drag = přesun, klik na existující = detail (kód, štítek, druh s výběrem ikon, kabely přiřazené).

Tab **Racky**: canvas zobrazuje POUZE racky + podklad. Klik = umístit rack, drag = přesun, klik na rack = přiřazení patch panelů (multi-select z volných panelů projektu). Panel přiřazený k racku = jeho kabely se automaticky napojí na tento rack v generátoru tras.

Tab **Kmeny**: canvas zobrazuje POUZE kmeny (polyline) + podklad + racky slabě (kontext). Klik = přidat bod do aktivního kmenu, Enter = ukončit, dvojklik na bod = drag, tlačítko "Hlavní kmen" toggluje `is_primary`. Barevné rozlišení kmenů.

Tab **Trasy**: read-only canvas — zobrazuje racky, endpointy, kmeny slabě, a nad tím trasy jednotlivých kabelů. Jedno velké tlačítko **"Vygenerovat trasy"**. Boční panel: seznam kabelů s délkou / stavem (bez kmene → "silný bod" varování). Klik na řádek = zvýraznit trasu.

Tab **Kalibrace**: 2 body + reálná vzdálenost, jako teď.

## 3. Generátor tras — logika "musí přes kmen"

Přepsat `autoAssignBundlesForPlan`:

1. Vyžadovat aspoň jeden kmen na plánu → jinak vrátit chybu.
2. Pro každý kabel (from_port → to_endpoint) na tomto plánu:
   - Rack pozice = pozice racku patch panelu portu.
   - Endpoint pozice = pozice endpointu.
   - Najít **nejbližší kmen** (preferuje `is_primary`, tie-break vzdáleností).
   - Trasa = `[rack, kotva rack→kmen, (bod na kmeni), kotva kmen→endpoint, endpoint]`.
   - Uložit `branch_points` a `bundle_id`.
3. Vypočítat délku pomocí `computeCableLength` (kalibrace + reserve typu).
4. Vrátit souhrn: přiřazeno / bez kmene / chybějící kalibrace / celková délka / počet "slabých" (velmi krátký přípoj) a "silných" (překročeny meze / mimo kmen) bodů.

## 4. Workflow průvodce v hlavičce projektu

Nad editorem plánu horizontální stepper:

```text
1. Podklad → 2. Kalibrace → 3. Endpointy → 4. Racky → 5. Kmeny → 6. Generovat trasy → 7. Zkontrolovat → 8. Odeslat do tahání
```

Každý krok má stav (splněno / v pořádku / chybí). Kliknutí přepne tab. Krok 8 zpřístupní tlačítko **"Odeslat do režimu tahání"** — vygeneruje záznamy do `pull_tasks` z aktuálních kabelů (seřazené podle typu, délky, kmenu).

## 5. Režim tahání — interaktivní editor pro tým

Přestavět `/projects/:id/work` na 3 pod-taby:

- **Přehled**: karty (celkem kabelů, celkem metrů, spulky, hodiny). Zůstává.
- **Simulace spulek**: zůstává.
- **Tahání (nové, hlavní tab)**:
  - Levá strana: seznam endpointů / racků k tahání. Klik = vybrat cíl.
  - Pravá strana: mini plán (SVG) — zobrazí se jen trasa vybraného cíle, ostatní ztlumeno.
  - Nad trasou nadpis: `RACK-01 → KIOSK-3 · 42.5 m · 3× UTP Cat6a`. Počet kabelů viditelný jako pilulka podél trasy.
  - Tlačítka: "Začít tahat" (status = in_progress), "Hotovo" (status = done, done_at = now).
  - Realtime aktualizace stavu pomocí `pull_tasks`.

## 6. Změny v datech

- Migrace: `endpoints.endpoint_kind` — rozšířit povolené hodnoty (v aplikačním kódu, sloupec je text). 
- `pull_tasks` už existuje z minula.
- Přidat `racks.assigned_panel_ids` výpočtem z `patch_panels.rack_id` (už existuje) — jen UI úprava.
- Přidat `cable_bundles.color` (text, default null) pro barevné odlišení.

## 7. Nové/upravené soubory

- `src/lib/endpointKinds.ts` — konstanta všech druhů + ikony (inline SVG).
- `src/components/plan-editor/CanvasEndpoints.tsx`, `CanvasRacks.tsx`, `CanvasBundles.tsx`, `CanvasRoutes.tsx`, `CanvasCalibration.tsx` — 5 samostatných canvasů s filtrovaným zobrazením.
- `src/components/plan-editor/WorkflowStepper.tsx`.
- `src/components/work-mode/PullingBoard.tsx` (nový hlavní tab).
- `src/lib/cableBundles.functions.ts` — přidat `color` do listBundles/updateBundle.
- Přepsat `autoAssignBundlesForPlan` v `src/lib/cablesFromPort.functions.ts`.
- Rozdělit současný `plans.$planId.tsx` (1952 řádků) do menších komponent.

## 8. Otázky před realizací

1. Máme zavést i variantu "kmen na kmen" (větvení kmenů), nebo jeden kmen = jedna lineární cesta?
2. Kdy generátor selže — má trasu vytvořit i bez kmene (padne varováním), nebo úplně odmítnout?
3. "Slabý bod" = definice? (návrh: kabel < 3 m nebo přímá vzdálenost > 90 m Cat6a).
4. Ikony endpointů — mám navrhnout vlastní minimalistické SVG, nebo použít Lucide sadu (RackServer, Cctv, Wifi, MonitorSpeaker, Utensils …)?

## Rozsah

Tohle je 2–3 velké iterace. Doporučuji začít bodem 2 (rozdělit editor do 5 tabů s filtrem canvasu) a bodem 3 (generátor přes kmen), pak workflow (4) a nakonec režim tahání (5). Migrace endpoint kindů je malá a jde první.
