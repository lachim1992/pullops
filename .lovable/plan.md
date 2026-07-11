Rozdělím na 3 části. Beru odpovědi z předchozích otázek jako závazné.

## 1) Půlené endpoint markery v Pull Mode (mapa)

- Endpoint kolečko rozdělím svisle: **levá polovina = barva typu endpointu** (jako dnes), **pravá polovina = zelená/červená** podle stavu tažení.
- Zelená, pokud jsou všechny kabely připojené k endpointu ve stavu `PULLED`. Červená, pokud aspoň jeden zbývá.
- Endpoint bez kabelů → pravá půlka šedá (neutrální).
- Implementace: v `PullMap` (v `projects.$projectId.work.tsx`) místo `<circle>` vykreslit dvě `<path>` půlkruhy s příslušnými barvami + tenký obrys.

## 2) Interaktivní editor v Pull Mode (read-only)

- Zoom kolečkem (na kurzor) + pan drag pozadí. Same UX jako plán-editor (viewBox transform).
- Klik na kabel / endpoint → detail v pravém panelu (už existuje, zachovat).
- Hover na řádek kabelu v seznamu (Fronta/detail) → zvýraznit trasu na mapě (silnější stroke + glow).
- Žádné úpravy geometrie — pouze prohlížení a odškrtávání.
- Reset zoomu tlačítkem „1:1".

## 3) Plánovač tažení (Plán editor, tab „5 · Zadat plán")

Rozšířím stávající tab. Vlevo mapa (read-only), vpravo panel plánovače:

- **Bloky (dny/směny)** — správce přidá blok (`+ nový den`), pojmenuje ho (např. „Den 1 – patro 1"), nastaví datum (volitelné).
- **Kapacita per blok**: v bloku nastaví `N spulek × M metrů` (výchozí z projektu 305 m). To udává max metry, které v bloku plán unese.
- **Přiřazení kabelů do bloků**: v panelu seznam nepřiřazených kabelů (filtr podle typu/patra), tlačítkem přesun do zvoleného bloku. Alternativně klik na kabel na mapě → menu „Přiřadit do bloku…".
- **Souhrn bloku**: součet metrů vs. kapacita, barevný indikátor (zelená < 90 %, oranžová 90–100 %, červená > 100 %).
- **Publikace**: existující přepínač `published_to_pull` na plánu zůstává. Publikace = zpřístupní bloky v Pull Mode.

**DB — nové tabulky:**

```text
pull_day_plans
  id, project_id, floor_plan_id, name, sort_order, planned_date?, created_by, created/updated_at
  kapacita: spool_count int, spool_length_m numeric

pull_day_plan_cables  (M:N kabel ↔ blok, pořadí)
  id, project_id, day_plan_id, cable_id UNIQUE, sort_order
```

- RLS: čtení = člen projektu; zápis = admin/PM (přes `has_project_role`).
- GRANTy pro `authenticated` + `service_role`.
- Validační trigger tenant-integrity (project_id konzistence).
- `pull_tasks` (už existuje z předchozího CP) nechávám na později — tato iterace neřeší přiřazení lidem, jen bloky a kapacitu.

**Pull Mode napojení:**

- V Pull Mode záložka **Spulky** už neagreguje globálně, ale ukazuje **bloky v pořadí** správce; každý blok = jedna sekce s N cívkami × M metry a přiřazenými kabely.
- Ostatní záložky (Mapa/Fronta) zůstávají projektové (všechny publikované kabely).

## Pořadí implementace (jeden commit každé)

1. Půlené markery + zoom/pan/hover v Pull Mode (jen frontend, žádná DB).
2. DB migrace: `pull_day_plans`, `pull_day_plan_cables` + RLS + GRANT + triggery.
3. Server fn: `listDayPlans`, `upsertDayPlan`, `deleteDayPlan`, `assignCableToDayPlan`, `removeCableFromDayPlan`, `reorderDayPlans`.
4. UI plánovače v tab „5 · Zadat plán".
5. Pull Mode záložka Spulky → renderovat podle bloků místo FFD agregace (fallback na FFD, když projekt nemá žádný blok).

Potvrď, prosím, a pustím se do kroku 1.
