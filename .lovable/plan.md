# Metráž & Spulky v editoru plánu + přepracovaný krok 1 v manažeru tahání

## Cíl

1. **Editor plánu** – nová záložka **Metráž & Spulky** hned za Kalibrací. Přehled všech kabelů plánu, jejich délek (z tras + kalibrace + rezerv), ručně definovaných svazků a přiřazených fyzických spulek.
2. **Manažer tahání (krok 1)** – ukazatel „vybráno X / max N kabelů" (N = počet spulek na plánu), fronta zobrazuje pouze právě zadané kolo, sekce Spulky ukazuje mapování kabel → spulka a umožňuje ad-hoc **spárování spulek** (roller group v rámci kola).

## Editor plánu – záložka „Metráž & Spulky"

Vloží se mezi „Kalibrace" a stávající obsah. Tabulka + tři panely:

### A. Tabulka kabelů plánu

Sloupce:
- Kód kabelu
- Typ kabelu
- Odkud → Kam (endpointy)
- **Délka trasy** (z `cable_routes` + `cable_route_points` * `metersPerNormUnit` + rezervy `endpoint_kinds`) – přes `computeCableLength` (stejná logika jako v `pullManager.functions.ts::computePairLength`)
- **Rezerva** (součet obou konců)
- **Celkem** (délka + rezerva)
- **Svazek** (badge s barvou skupiny nebo „–")
- **Spulka** (přiřazená fyzická spulka nebo „–")
- Status kabelu

Řádek s chybějící trasou → varovná ikona „Chybí trasa" + tlačítko „Otevřít Trasy".

### B. Panel „Svazky (souběžné trasy)"

- Multi-select kabelů v tabulce → tlačítko **„Označit jako svazek"**.
- Ukládá se do existující tabulky `cable_bundles` + `cable_bundle_members` (pokud existuje) nebo do nové jednoduché tabulky `plan_cable_bundles(plan_id, cable_id, bundle_key, color)`.
- U svazku se ukazuje: barva, počet kabelů, **délka svazku = max délka mezi členy** (protože jedou souběžně) + součet materiálu.
- Tlačítko „Zrušit svazek".

### C. Panel „Přiřazení spulek k plánu"

Reuse `listSpoolsForPlanning` + `assignSpoolToPlan`. Realtime přepočet:
- **Potřebná délka celkem** (součet kabelů, u svazků jen max)
- **Dostupná délka na přiřazených spulkách** (`current_length_m`)
- Barevný indikátor deficit / dostatek + doporučení „přiřaď ještě X m typu Y".

Podle typu kabelu: agregát po `cable_type_id` (potřeba vs. dostupná délka).

## Manažer tahání – krok 1

Přestavba `src/routes/_authenticated/projects.$projectId.pull-manager.tsx`:

### Ukazatel limitu
Nahoře v kroku 1: **„Vybráno 3 / max 6 kabelů"** (6 = `pull_day_plan_spools` count). Tvrdý limit – tlačítko „Přidat do zátahu" disabled při dosažení.

### Výběr kabelů z mapy (endpointy)
Uživatel klikne endpoint → popup s jeho kabely → checkbox „Přidat". Vybrané kabely se nesbírají do celkové fronty, ale do **rozpracovaného zátahu** (lokální state, dokud neklikne „Zadat k tahání").

### Fronta – jen aktuální zátah
Karta „Fronta" už neukazuje celou historii kol, ale pouze **aktuálně zadané kolo** (`activeRound`) s možností **ukončit tahání** (dokončit / cancel). Historie zůstává v samostatné podzáložce „Historie kol".

### Spulky – automatické přiřazení + ad-hoc párování
Po vybrání kabelů:
- Systém automaticky přiřadí spulku podle `cable_type_id` + `current_length_m` (greedy, už existuje ve `proposePullRoundItems`).
- Karty spulek lze **spárovat** drag-and-drop nebo checkboxy do „roller group" (např. „Roller A: spulka #12 + #14"). Skupiny jsou jen na frontendu – uloží se do `pull_rounds.notes` jako JSON metadata pro dohledatelnost.
- Validace při spárování: varování „Různá zbývající délka (250 m vs. 400 m)" (jen visual warning).

## Technické detaily

**Nové/upravené soubory:**
- `src/lib/planMeterage.functions.ts` (nový) – `getPlanMeterage({ planId })` vrací kabely plánu s vypočtenou délkou, svazky a agregáty.
- `src/lib/planBundles.functions.ts` (nový) – CRUD svazků na úrovni plánu.
- `src/routes/_authenticated/projects.$projectId.plans.$planId.tsx` – vložit nový `TabsTrigger` „Metráž & Spulky" a odpovídající `TabsContent`.
- `src/routes/_authenticated/projects.$projectId.pull-manager.tsx` – přepsat krok 1: limit ukazatel, oddělit „aktuální zátah" od „historie", přidat karty spulek s párováním.

**Migrace:**
```sql
CREATE TABLE public.plan_cable_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  day_plan_id uuid NOT NULL REFERENCES pull_day_plans(id) ON DELETE CASCADE,
  cable_id uuid NOT NULL REFERENCES cables(id) ON DELETE CASCADE,
  bundle_key text NOT NULL,
  color text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(day_plan_id, cable_id)
);
-- GRANT + RLS (project members read/write) + tenant validation trigger
```

**Kde brát seznam kabelů plánu:**
- Preferovaně `pull_day_plan_cables` (explicitní přiřazení). Když je prázdné → fallback: všechny kabely na `floor_plan_id` plánu (stejný fallback jako v `completionPlans.functions.ts`).

## Otázky pro finální jistotu

1. **Roller groups notes JSON** – souhlasíš, ať se skupiny ukládají jen jako metadata do `pull_rounds.notes` (bez nové tabulky)?
2. **Fronta = jen aktuální kolo** – opravdu chceš přesunout historii kol do samostatné podzáložky, nebo ji nechat pod aktuálním kolem?
3. **Kabely bez trasy** v tabulce Metráž – jen varovat, nebo automaticky spočítat přímkovým fallbackem (jak to dělá manažer teď)?
