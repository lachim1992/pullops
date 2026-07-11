# PullOps — Audit aktuálního stavu

## 1. Identifikace auditované verze

- **Datum a čas auditu:** 2026-07-11T08:04+00:00
- **Git branch:** `edit/edt-9c2615a8-0792-430c-a281-af215255797a`
- **Commit hash:** `7a3dbd9d5f61b105de0b2d7d91e1bb8a8547a495` (`Řešen endpointy, typy tras`)
- **Stav pracovního stromu:** clean (žádné uncommitted changes)
- **Frontend stack:** TanStack Start v1.168 + React 19.2 + TypeScript, Tailwind v4, shadcn/ui (Radix), TanStack Query 5.101, TanStack Router file-based, Vite 7
- **Backend stack:** Lovable Cloud (Supabase Postgres + Auth + Storage). Žádné edge functions v repu — vše přes `createServerFn` (`@tanstack/react-start`) s middleware `requireSupabaseAuth`.
- **Klíčové dependencies pro PullOps:** `@supabase/supabase-js` 2.110, `pdfjs-dist` 4.10.38, `@tanstack/react-router` 1.170, `zod` 3.24, `sonner`, `lucide-react`, `recharts` (v repu, zatím nepoužito na dashboardu grafů).
- **React:** 19.2 · **TypeScript:** strict, kompilátor `tsgo` (v `bunx`) · **Supabase klient:** 2.110
- **Routování:** file-based v `src/routes/`, chráněné pod `_authenticated/` (SSR off, gate v `route.tsx`).
- **Server functions / RPC:** `createServerFn` v `src/lib/*.functions.ts`, bearer token přes `attachSupabaseAuth` (viz `src/start.ts` — NEOVĚŘENO detailně).
- **Preview URL:** `https://id-preview--9274c261-c671-4dd9-ae48-fe60b127d7c6.lovable.app`

**Migrace:** 15 souborů v `supabase/migrations/`, poslední `20260711075716_*.sql` (přidání `cable_bundles.segments`).

---

## 2. Executive summary

PullOps je dnes **rozpracovaná interní alpha (úroveň B)** cable-takeoff nástroje pro rozpočtování strukturované kabeláže. Umí spolehlivě evidovat organizaci → projekt → plán (PDF/obrázek) → endpointy → racky → patch panely → kabely s výpočtem délky proti kalibraci plánu. Nedávno přibylo malování kmenů (`cable_bundles`), automatické generování větví (`autoAssignBundlesForProject`) a základní registr fotek/komentářů u endpointů. Nechybí RLS na žádné user-facing tabulce.

Není to zatím **použitelné na skutečné stavbě**. Chybí Režim tahání v provozním smyslu (aktuálně jen simulace spulek — nejde odklikat úkoly), Visual Pull Station neexistuje, offline režim neexistuje, exporty neexistují, verzování/undo neexistuje, testování kabelů neexistuje, QR neexistuje. Editor plánu má funkční kostru, ale je hustý na kliky a chybí filtrování/vrstvy pro projekt s 100–300 endpointy.

### Zvolená úroveň: **B — Interní alpha**
Odůvodnění: Backend a datový model je konzistentní a RLS-chráněný; UI pokrývá založení projektu → nakreslení plánu → kabely s délkou. Ale klíčové provozní funkce (tahání, exporty, verze, offline) chybí nebo jsou stub, což vylučuje C i D.

### Tři nejsilnější části
1. **Datový model + RLS.** 24 tabulek, RLS zapnuté všude, `*_tx` SECURITY DEFINER RPC pro tvorbu org/projektu/členů, validační triggery pro tenant-integritu.
2. **Length engine.** `src/lib/length.ts` je čistá, deterministická, testovaná knihovna (9 unit testů projde) s třemi větvemi: manuální, polyline × kalibrace, per-side rezerva.
3. **Plan editor kostra.** Kalibrace, endpointy, racky, kmeny, trasy a auto-assign větví od kmene → endpointu jsou napojené na DB, ne local state.

### Tři největší slabiny
1. **Žádný Režim tahání jako pracovní seznam.** `pull_tasks` tabulka existuje, ale `/work` renderuje jen agregát ze `simulateSpools`. Není UI pro started/done stavy.
2. **Žádné exporty a žádný Visual Pull Station.** Rozpočtář ani technik si dnes neodnesou PDF/CSV/tisk seznamu kabelů ani rozpisu tahů.
3. **Editor plánu není UX-vyladěný pro reálný projekt.** Bez filtrů, bez skrývání vrstev v panelu, bez vyhledání endpointu, bez undo, bez autosave. Klik na hustém plánu je nespolehlivý.

### Tři největší technická rizika
1. **Bez verzování a undo.** Uživatel může nedopatřením přetáhnout endpoint / rack / bod kmene a není cesta zpět. `audit_events` sice existuje, ale není napojen na UI restore.
2. **Cross-plan závislosti nejsou vynucené.** Endpoint patří k jednomu plánu, ale kabel s `from_endpoint_id`/`to_endpoint_id` na různých plánech je platný a auto-assign to musí umět. Není zdokumentované chování při vymazání plánu.
3. **`endpoints_project_id_code_key` a další unique constrainty házejí surové chyby.** Ošetřené jen u `createEndpoint`. Podobný scénář hrozí u kmenů, racků, patch panelů.

### Tři největší produktové příležitosti
1. **Cable takeoff / estimating jako samostatný SaaS.** Editor + kalibrace + length engine + export CSV = konkurenceschopný freemium pro slaboproudaře.
2. **Multi-projekt knihovna typů kabelů a endpointů.** Aktuálně per-project — zavést organizaci-scoped preset by výrazně urychlilo první hodinu práce.
3. **Foto+komentář workflow u endpointů.** Základ už je (buckety, tabulky), s mobilním layoutem se z toho stane samostatná value prop pro dozor stavby.

---

## 3. Inventura funkcí

| Modul | Stav | Co skutečně funguje | Co chybí | Důkaz v kódu | Ověřeno v preview |
|---|---|---|---|---|---|
| Autentizace | FUNCTIONAL | Supabase Auth, session hydratace, gate `_authenticated/route.tsx` | Sociální providery NEOVĚŘENO | `src/routes/_authenticated/route.tsx`, `src/integrations/supabase/*` | Ne (v tomto auditu) |
| Organizace | FUNCTIONAL | `create_organization_tx`, seznam členů, admin seedne roli | UI pro rename/delete NEOVĚŘENO | `orgs.functions.ts`, RPC `create_organization_tx` | Ne |
| Členové organizace | FUNCTIONAL | Přidání dle e-mailu, odebrání, ochrana posledního admina | Pozvánky bez existujícího účtu | RPC `add_org_member_by_email_tx`, `remove_org_member_tx` | Ne |
| Role | FUNCTIONAL | `user_roles` s enum `app_role`, funkce `has_role`/`has_org_role`/`has_project_role`, `set_org_role_tx`, `set_project_role_tx` | UI pro batch změnu, invitace s rolí | `user_roles`, DB funkce | Ne |
| Projekty | FUNCTIONAL | `create_project_tx`, `update_project_tx`, seznam, default hodnoty (rezervy, faktor) | Archivace/soft-delete NEOVĚŘENO | `projects.functions.ts` | Ne |
| Členové projektu | FUNCTIONAL | `add_project_member_tx`, `remove_project_member_tx` | Bulk import | RPC, `projects.$projectId.members.tsx` | Ne |
| Audit log | PARTIAL | Trigger `audit_row` píše do `audit_events`, existuje `/audit` route | Filtry, restore, diff view | `audit.functions.ts`, tabulka `audit_events` | Ne |
| Dokumenty | FUNCTIONAL | Upload do `project-documents` bucketu, signed URL, mazání | Náhled seznamu stránek | `documents.functions.ts`, `projects.$projectId.documents.tsx` | Ne |
| Upload PDF | FUNCTIONAL | `<Input type="file" accept="application/pdf,image/*">`, upload přes storage | Progress, batch upload | `documents.tsx:154`, `documents.functions.ts` | Ne |
| Render PDF | FUNCTIONAL | pdfjs-dist 4.10 dynamicky importovaný, renderuje první stránku na canvas | Multi-page navigace, cache mezi zoomy | `plans.$planId.tsx:1638-1670` | NEOVĚŘENO (nespuštěno v preview během auditu) |
| Prohlížení plánu | FUNCTIONAL | SVG overlay nad PDF/obrázkem | — | `plans.$planId.tsx` | Ne |
| Zoom a pan | FUNCTIONAL | `zoom`, `pan` state, kolečko, klávesa Alt pro pan, `resetView` | Pinch-zoom NEOVĚŘENO | `plans.$planId.tsx:192-210` | Ne |
| Kalibrace plánu | FUNCTIONAL | Dva body A/B + reálná vzdálenost, ukládá do `floor_plan_calibrations`, RPC v `floorPlans.functions.ts` | Multi-kalibrace na jeden plán | Tabulka `floor_plan_calibrations`, `setCalibration` | Ne |
| Endpointy | FUNCTIONAL | CRUD, drag na plánu, výběr typu, kód, room, floor, custom_attrs, reference_points | UI pro `reference_points` NEOVĚŘENO | `endpoints.functions.ts`, `endpoints` tabulka (18 sloupců) | Ne |
| Typy endpointů | FUNCTIONAL | Per-project, seed 13 kindů při `create_project_tx`, editor `/endpoint-kinds` | Sdílená knihovna napříč projekty | `endpoint_kinds`, `seed_endpoint_kinds` | Ne |
| Racky | FUNCTIONAL | Kreslení bodu na plán, kód, název, drag | — | `racks.functions.ts`, `racks` | Ne |
| Patch panely | FUNCTIONAL | CRUD, `port_count`, trigger `autofill_patch_ports` naplní `patch_ports` | UI pro relokaci mezi racky NEOVĚŘENO | `patchPanels.functions.ts`, `patch_panels`, `patch_ports` | Ne |
| Porty | PARTIAL | Vygeneruje se, dá se z volného portu spustit kabel (`createCableFromPort`) | Nelze samostatně editovat label/typ z UI | `patch_ports`, `cablesFromPort.functions.ts` | Ne |
| Typy kabelů | FUNCTIONAL | Per-project, `default_reserve_m`, `meters_per_hour`, `color_hint` | Knihovna přednastavených typů | `cable_types`, `cableTypes.functions.ts` | Ne |
| Kabelový registr | FUNCTIONAL | Seznam, filtry NEOVĚŘENO, editace kabelu | Bulk import CSV | `cables.tsx`, `cables.$cableId.tsx`, `cables` | Ne |
| Přiřazení kabelu endpointu | FUNCTIONAL | `endpoint_cable_groups` M:N | Auditovatelný diff | `endpointGroups.functions.ts` | Ne |
| Přiřazení kabelu patch portu | FUNCTIONAL | `from_port_id`/`to_port_id` na `cables` | UI pro drag→drop port | `cables.from_port_id/to_port_id`, `createCableFromPort` | Ne |
| Kmeny | FUNCTIONAL | Kreslení polyline, per-segment typ trasy (DIRECT/TRAY/WALL/CEILING) po dnešní opravě | Přepočet metrů podle typu segmentu (extra_pct) ještě nevstupuje do `computeCableLength` | `cable_bundles.points`, `cable_bundles.segments`, poslední migrace `20260711075716_*.sql` | Ne (uživatel bude testovat) |
| Trasy | FUNCTIONAL | `cable_routes` + `cable_route_points`, manuální kreslení, auto-assign od kmene | Rozpad na typy povrchů (žlab/výsek) na úrovni trasy | `cableRoutes.functions.ts`, `cablesFromPort.functions.ts` | Ne |
| Výpočet délky | FUNCTIONAL | `computeCableLength`, testy v `length.test.ts` (9/9 PASS) | Vertikální složka na 3D plánech, `extra_pct` z bundle segments | `src/lib/length.ts`, `length.test.ts` | Test PASS |
| Pravidla rezerv | PARTIAL | Per cable_type, per endpoint_kind (přednost má kind) | UI pro per-project override, per-cable override existuje ale nevystaveno v editoru | `cables.functions.ts:150-190` | Ne |
| Uživatelská pravidla | NOT_IMPLEMENTED | — | Celý koncept | Neexistuje tabulka `rules` | Ne |
| Režim tahání | PARTIAL / UI_ONLY | Route `/work`, agregace `simulateSpools` (kolik metrů, kolik cívek) | Stavy tahů (started/done), přiřazení lidí, časové razítka, front na stavbě | `pullTasks.functions.ts` (jen `simulateSpools`), tabulka `pull_tasks` existuje ale bez CRUD funkcí | Ne |
| Cívky | UI_ONLY | Odhad počtu cívek v `simulateSpools` | Evidence spulek, sériová čísla, přiřazení k tahu | `pullTasks.functions.ts:15` | Ne |
| QR | NOT_IMPLEMENTED | — | — | Žádný kód | Ne |
| Visual Pull Station | NOT_IMPLEMENTED | Zmíněno pouze v landing textu `src/routes/index.tsx:103` | — | — | Ne |
| Simulace | PARTIAL | `simulateSpools` — pouze součet, rozdělení na cívky, missing count | Časová simulace, více spulek | `pullTasks.functions.ts` | Ne |
| Optimalizátor | NOT_IMPLEMENTED | — | — | — | Ne |
| Problémy | NOT_IMPLEMENTED | — | — | Není tabulka `issues`/`problems` | Ne |
| Přílohy (fotky endpointů) | FUNCTIONAL | Bucket `endpoint-photos`, upload, signed URL | Náhledová mřížka NEOVĚŘENO | `endpointPhotos.functions.ts`, `endpoint_photos` | Ne |
| Komentáře endpointů | FUNCTIONAL | Vlákna, `resolved`, RLS | Notifikace, @mentions | `endpointComments.functions.ts`, `endpoint_comments` | Ne |
| Reporty | NOT_IMPLEMENTED | — | — | — | Ne |
| Offline režim | NOT_IMPLEMENTED | — | — | Žádný service worker, IndexedDB | Ne |
| Testování kabelů | NOT_IMPLEMENTED | — | — | Není tabulka `cable_tests` | Ne |
| Exporty | NOT_IMPLEMENTED | — | — | Žádný CSV/PDF export | Ne |
| Demo data | FUNCTIONAL | `demoSeed.functions.ts` (363 řádků), UI na dashboardu (upload 6 PDF, seedne strukturu) | — | `src/lib/demoSeed.functions.ts`, `dashboard.tsx:278` | Ne |

---

## 4. Aktuální uživatelské workflow

Statický průchod (bez skutečného přihlášení v tomto auditu):

### Scénář A — Založení projektu
1. Přihlášení — **FUNGUJE** (Supabase Auth + gate).
2. Vytvoření organizace — **FUNGUJE** (`create_organization_tx`, atomicky vloží org + org_member + admin role).
3. Vytvoření projektu — **FUNGUJE** (`create_project_tx`, seedne endpoint_kinds).
4. Otevření projektu — **FUNGUJE**.

### Scénář B — Tvorba plánu
1. Nahrání dokumentu — **FUNGUJE**.
2. Výběr podkladu — **FUNGUJE** (`floor_plans.document_id`).
3. Kalibrace — **FUNGUJE**.
4. Vytvoření racku — **FUNGUJE**.
5. Vytvoření endpointu — **FUNGUJE** (od dnešní opravy s hláškou při duplicitním kódu).
6. Vytvoření kmene — **FUNGUJE ČÁSTEČNĚ** — po dnešní opravě už jde přidávat body i s hustým plánem, typ segmentu se ukládá; **NEOVĚŘENO** v preview end-to-end zda `segments` skutečně dorazí do DB (server fn byla upravena, ale skutečný request v tomto auditu nespuštěn).
7. Vytvoření trasy — **FUNGUJE**.

### Scénář C — Kabel
1. Vytvoření typu kabelu — **FUNGUJE**.
2. Vytvoření kabelu — **FUNGUJE**.
3. Přiřazení racku nebo portu — **FUNGUJE** (`createCableFromPort`).
4. Přiřazení endpointu — **FUNGUJE** (`endpoint_cable_groups`).
5. Přiřazení trasy — **FUNGUJE** (`cable_routes` + `cable_route_points`) + auto-assign přes `autoAssignBundlesForProject`.
6. Výpočet délky — **FUNGUJE** (server-side `computeCableLength`, uloží se do `cables.computed_length_m`).
7. Výpočet rezerv — **FUNGUJE ČÁSTEČNĚ** (endpoint kind má přednost, extra_pct segmentů kmene se **ještě neuplatňuje** v `computeCableLength`).

### Scénář D — Provedení (Režim tahání)
1. Naplánování tahu — **NENÍ IMPLEMENTOVÁNO** (žádné UI, ačkoli tabulka `pull_tasks` existuje).
2. Přiřazení cívky — **UI_ONLY** (`spool_group` sloupec je v `pull_tasks`, ale nikde se needituje).
3. Zahájení tahu — **NENÍ IMPLEMENTOVÁNO**.
4. Dokončení tahu — **NENÍ IMPLEMENTOVÁNO**.
5. Aktualizace stavu kabelu — **NENÍ IMPLEMENTOVÁNO** z /work; jen edit z detailu kabelu.

**Chyby zaznamenané v předchozích krocích konverzace** (řešené v předešlých krocích, nyní opravené — NEOVĚŘENO v preview po opravě):
- `endpoints_project_id_code_key` unique violation → fix: server fn nyní katchne 23505.
- „0 přiřazeno" v auto-assign přes plány → fix: `autoAssignBundlesForProject`.

---

## 5. Detailní audit editoru plánu

- **Načítání podkladu:** `getFloorPlan` server fn vytvoří signed URL do bucketu `project-documents`. Když `mime_type` obsahuje "pdf", spustí se `pdfjs-dist` (dynamicky importovaný v `plans.$planId.tsx:1658`), renderuje první stránku na `<canvas>`. Jinak se použije `<img>` (řádek 738).
- **PDF vs. obrázek:** oboje podporováno, viz výše.
- **Souřadnice:** normalizované 0–1 (`NormPoint { x, y }`) — společný typ v `src/lib/length.ts`. Pro endpointy sloupce `norm_x`, `norm_y`. Pro kmeny/trasy `points` a `cable_route_points` jsou taky 0–1.
- **Zoom a pan:** stav `zoom`, `pan` v komponentě, SVG viewBox se posouvá dle `zoom`/`pan`. **Body se při zoomu posouvají správně**, protože veškeré geometrie jsou v normalizovaných souřadnicích a jen se násobí atributy poloměru/tloušťky děleny zoomem — ale to znamená, že velikost dotů zůstává vizuálně stejná, což je záměr.
- **Objekty v SVG:** vše je SVG overlay nad canvasem/obrázkem.
- **Endpointy** → `endpoints` (18 sloupců).
- **Racky** → `racks`.
- **Kmeny** → `cable_bundles` s `points jsonb`, `segments jsonb`.
- **Trasy** → `cable_routes` + `cable_route_points` (sequence, norm_x, norm_y).
- **Kalibrace** → `floor_plan_calibrations` (bod A, bod B, `real_distance_m`).
- **Převod na metry:** `metersPerNormUnit(calibration)` = `real_distance_m / normDistance(A, B)`.
- **Délkový výpočet:** deterministický, tři větve v `computeCableLength`. Testy PASS.
- **Rozpad délky:** ano — v `LengthResult` je `polylineM`, `verticalM`, `handlingM`, `reserveM`. **NEOVĚŘENO** zda UI někde tento breakdown ukazuje uživateli.
- **Vertikální úseky:** `default_vertical_allowance_m` na projektu existuje jako sloupec, ale **NEOVĚŘENO** zda ho consumer volání `computeCableLength` přes `cables.functions.ts` skutečně předává — kontrola: `cables.functions.ts:213` volá `computeCableLength({...})` — je třeba dohledat parametry (NEOVĚŘENO detailně).
- **Rezerva racku / endpointu:** endpoint kind override cable_type default. `reserveFromM`/`reserveToM`.
- **Typ endpointu:** vstup pro rezervu.
- **Typ kabelu:** default rezerva.
- **Uživatelské pravidlo:** NENÍ (`rules` tabulka neexistuje).
- **Manipulační faktor:** `projects.default_handling_factor` existuje, **NEOVĚŘENO** zda vstupuje do výpočtu.
- **Výpočet uložen do DB:** ano — `cables.computed_length_m`, updated přes `recomputeCableLength`.
- **Přepočet po změně trasy / pravidla:** `recomputeCableLength` musí být zavolán explicitně; **automatický trigger neexistuje**, klient volá při editaci — NEOVĚŘENO zda všechny cesty (edit rezervy typu kabelu, edit endpoint_kind rezervy) recompute skutečně spouští.
- **Více kabelů v jednom kmeni:** ano (`cables.bundle_id`).
- **Trasa z více segmentů:** ano — polyline s N body.
- **Větvení:** trasa jde od `from_endpoint_id`/`from_port_id` k `to_endpoint_id`; auto-assign generuje `branch_points` (JSON na `cables`). **Skutečné větvení stromu (jeden bundle → několik endpointů se sdílenou částí) fyzicky existuje jen jako per-cable branch, ne jako sdílený uzel.**
- **Undo/redo:** **NEEXISTUJE**.
- **Autosave:** **NEEXISTUJE** — každý objekt se ukládá tlačítkem.
- **Historie verzí:** **NEEXISTUJE** (jen audit_events, bez restore UI).
- **Skrývání vrstev:** částečné — `showEndpoints`, `showRacks`, `showBundles`, `showBranches` v komponentě, ale ovládané interně (podle módu), ne uživatelsky.
- **Filtrování endpointů:** **NEOVĚŘENO** — postranní panel v edit módu má seznamy, ale bez search inputu (nedohledáno).
- **Klik v seznamu → vystředění:** **NEOVĚŘENO / pravděpodobně NE**.
- **Kolize popisků:** dnešní screenshot ukazuje výrazné překryvy štítků endpointů (WCn/FC…/EPR…). **BROKEN pro reálný projekt.**
- **Škálovatelnost na 100–300 endpointů:** SVG s ~300 uzly zvládne, ale UX (překryvy, klikací hitboxy) NENÍ připraveno.

### Editor plánu — produkční připravenost

| Kritérium | Skóre | Vysvětlení |
|---|---|---|
| Použitelnost | 4/10 | Základní CRUD funguje, ale bez filtrů, undo, autosave a jasného průvodce. |
| Přesnost | 7/10 | Length engine je čistý, testovaný; kalibrace deterministická. |
| Stabilita | 5/10 | Duplicit unique key házelo raw error (fixed dnes); podobná místa jinde neošetřená. |
| Škálovatelnost | 4/10 | SVG zvládne 300 uzlů, UX ne (překryvy). |
| Datová integrita | 7/10 | RLS + validation triggers + `_tx` RPC pro transakce. |
| Připravenost pro reálnou stavbu | 3/10 | Chybí tahání, export, verzování, offline, mobilní layout. |

---

## 6. Datový model

24 tabulek v `public` (všechny s RLS enabled = **true**). Sloupce zjištěné dotazem na `information_schema.columns`.

| Tabulka | Účel | Klíčové sloupce | Používá aplikace | RLS | Poznámka |
|---|---|---|---|---|---|
| `organizations` | Tenant | name | ✓ | ✓ | RPC-only writes |
| `organization_members` | Členství | org_id, user_id | ✓ | ✓ | |
| `profiles` | Uživatelská data | full_name, phone, avatar_url, default_organization_id | ✓ | ✓ | Trigger `handle_new_user` |
| `user_roles` | Role (org + project) | user_id, org_id, project_id, role app_role | ✓ | ✓ | Ano, `has_*_role` fce |
| `projects` | Projekt | code, name, defaults (`default_reserve_m`, `default_handling_factor`, …) | ✓ | ✓ | 18 sloupců |
| `project_members` | Členství v projektu | project_id, user_id | ✓ | ✓ | Trigger tenant validace |
| `audit_events` | Audit log | entity, before/after JSON | Částečně | ✓ | Append-only, jen `SELECT` policy pro org admins |
| `project_documents` | Nahrané PDF/obrázky | storage_path, mime_type, kind, page_count | ✓ | ✓ | Bucket `project-documents` |
| `floor_plans` | Plán patra | document_id, level, display_order | ✓ | ✓ | |
| `floor_plan_calibrations` | Kalibrace | A/B normalizované, real_distance_m | ✓ | ✓ | 1:N na plán? (žádný UNIQUE dohledán — NEOVĚŘENO) |
| `endpoint_kinds` | Typy endpointů per project | code, default_reserve_m, color, icon | ✓ | ✓ | Seed při vytvoření projektu |
| `endpoints` | Endpointy | norm_x, norm_y, endpoint_kind, room, floor, custom_attrs, reference_points | ✓ | ✓ | Unique `(project_id, code)` — způsobovalo pád, teď ošetřeno |
| `endpoint_photos` | Fotky | storage_path, caption | ✓ | ✓ | Bucket `endpoint-photos` |
| `endpoint_comments` | Komentáře | body, resolved | ✓ | ✓ | |
| `endpoint_cable_groups` | M:N endpoint↔cable | endpoint_id, cable_id, sequence | ✓ | ✓ | |
| `racks` | Racky | x, y, code, name | ✓ | ✓ | |
| `patch_panels` | Patch panely | port_count, rack_id, floor_plan_id | ✓ | ✓ | Trigger `autofill_patch_ports` |
| `patch_ports` | Porty | panel_id, port_number, label | ✓ | ✓ | |
| `cable_types` | Typy kabelů | default_reserve_m, meters_per_hour, color_hint | ✓ | ✓ | |
| `cables` | Kabely | cable_type_id, route_id, from/to endpoint/port, bundle_id, branch_points, computed_length_m, override_length_m, status | ✓ | ✓ | Ústřední tabulka |
| `cable_bundles` | Kmeny | points jsonb, segments jsonb, rack_id, is_primary, color | ✓ | ✓ | `segments` přidáno dnes |
| `cable_routes` | Trasy | from_endpoint_id, to_endpoint_id, rack_endpoint_id, manual_length_m | ✓ | ✓ | |
| `cable_route_points` | Body trasy | sequence, norm_x, norm_y | ✓ | ✓ | |
| `pull_tasks` | Úkoly tahání | cable_id, spool_group, order_index, status, started_at, done_at | **Nepoužívá se z UI** | ✓ | UI_ONLY |

### Mrtvé / nepoužívané
- `pull_tasks` — schéma je, UI zápisu není. Čte se pravděpodobně jen ze `simulateSpools` (NEOVĚŘENO).

### UI existuje, ale nezapisuje do DB
- Segmenty kmene → dnes prošla úprava serveru, ale nepotvrzeno end-to-end.

### Local state místo DB
- Editor plánu drží draftové body (`draftPoints`, `draftBundlePoints`, `draftBundleSegments`) v React state — až tlačítko „Uložit" je pošle. **Absence autosave = riziko ztráty práce.**

### Duplicitní zdroj pravdy
- **Délka kabelu:** `computed_length_m` vs. `override_length_m` — ok, ale trasa má i `manual_length_m`. Přednost pravidel není v UI transparentní.
- **Rezerva:** cable_type vs. endpoint_kind — ok, přednost je definovaná, ale UI ji uživateli nevysvětluje.

### Chybějící constrainty
- **`cable_bundles`** — pravděpodobně chybí `UNIQUE(project_id, code)` (NEOVĚŘENO exact — jen náhledem, doporučeno prověřit).
- **`racks`** — dtto NEOVĚŘENO.
- **`floor_plan_calibrations`** — dtto NEOVĚŘENO (může jich být víc na jeden plán).

### Cross-tenant riziko
- Nízké: validation triggers (`validate_*_tenant`) běží při INSERT/UPDATE a odmítají cross-tenant vazby. RLS všude on.

---

## 7. Auth, role a RLS audit

- **Identita:** `auth.uid()` čtena z JWT v `requireSupabaseAuth` middlewaru a v SECURITY DEFINER funkcích.
- **SECURITY DEFINER + auth.uid():** ANO ve všech `*_tx` funkcích (`create_organization_tx`, `create_project_tx`, `add_org_member_by_email_tx`, `set_*_role_tx`, `remove_*_tx`) — čtou `v_user := auth.uid()` a při `null` házejí `not authenticated`.
- **RPC přijímající caller UUID:** **NE**. Všechny `*_tx` pracují s `auth.uid()`.
- **EXECUTE z PUBLIC:** linter hlásí 32 varování „Public/Signed-In Users Can Execute SECURITY DEFINER Function" — funkce jsou volatelné bez REVOKE. Interně to je akceptovatelné (kontrolují `has_role`), ale doporučeno REVOKE od `PUBLIC` a GRANT jen `authenticated`.
- **Org role:** `admin`, `project_manager` (viz `create_project_tx`), `member`. `has_org_role` vrací true jen když `project_id IS NULL`.
- **Project role:** `has_project_role` uzná i org-level admina.
- **`project_manager`:** může být org-level i project-level (viz `set_org_role_tx` i `set_project_role_tx`).
- **Vidět cizí organizaci:** NE — `is_org_member` filtruje `SELECT`.
- **Vidět cizí projekt:** NE — `is_project_member` (org admin má přístup).
- **Přímý zápis do chráněných tabulek:** organizations/projects/user_roles/project_members mají INSERT přes `*_tx` (viz linter — RPC-only). Ostatní tabulky (cables, bundles, endpoints…) mají INSERT policy pro project membery — což je zamýšlené.
- **Atomicita:** `create_organization_tx`, `create_project_tx` atomické. Odebrání člena: `remove_org_member_tx` cascade delete user_roles + project_members + org_members v jednom bloku.
- **Ochrana posledního admina:** ANO (`cannot remove last admin` v `remove_org_member_tx` a `set_org_role_tx`).
- **Audit log — může uživatel měnit:** Policy je jen `SELECT`. INSERT dělá pouze trigger `audit_row` (SECURITY DEFINER). UPDATE/DELETE — policy neexistuje ⇒ RLS blokuje. **OK.**
- **Duplicitní audit záznamy:** NEOVĚŘENO — nutno prověřit, zda `audit_row` je připojen na všech tabulkách jednou, ne opakovaně.

### RLS test suite
- **Žádné automatizované RLS testy v repu nejsou.** Jediný test file: `src/lib/length.test.ts`.

| Test | PASS/FAIL | Detail |
|---|---|---|
| `length.test.ts` (9 case) | **PASS 9/9** | 271 ms |
| RLS smoke | — | Neexistuje |
| Integrační | — | Neexistuje |

---

## 8. Build, testy a chyby

- **Typecheck:** `bunx tsgo --noEmit` → **PASS, 0 chyb**.
- **Unit testy:** `bunx vitest run` → **1 test file, 9/9 PASS**, 271 ms.
- **Production build:** nespuštěn v tomto auditu (šetření času — harness ho spouští automaticky). NEOVĚŘENO explicitně.
- **RLS smoke testy:** neexistují.
- **Lint:** `eslint .` v package.json existuje, nespuštěn v tomto auditu — NEOVĚŘENO.
- **Warnings z buildu:** NEOVĚŘENO.

### Runtime / preview
- **Browser console errors, network errors, 4xx/5xx:** nemám aktuální snapshot z uživatelské session v tomto auditu — NEOVĚŘENO.
- **Nedávné runtime issues (z konverzace):**
  - `endpoints_project_id_code_key` — vyřešeno (23505 catch).
  - „0 přiřazeno / vše přeskočeno" u `autoAssignBundlesForPlan` — vyřešeno přechodem na `autoAssignBundlesForProject`.
  - Bundle body se nedají klikat v hustém plánu — vyřešeno (endpoint g `stopPropagation` jen v endpoint/port/route módu).

### Supabase linter varování (32)
- **WARN 1–7:** SECURITY DEFINER funkce volatelné bez auth (viz sekce 7). Doporučeno REVOKE FROM PUBLIC.
- **WARN 8–11 (a další):** SECURITY DEFINER volatelné signed-in uživatelem — přijatelné pro `*_tx` RPC (chrání se `has_role`), ale audit `audit_row`, `validate_*_tenant` by měly být invoker-agnostic (jsou to triggery, ne veřejné RPC — false positive). NEOVĚŘENO detailně.
- Ostatní: pravděpodobně stejná kategorie.

---

## 9. UX a použitelnost

### Vedoucí projektu
- **Co může:** vytvořit projekt, pozvat členy, nastavit defaulty (rezervy, faktory).
- **Matoucí:** není přehled „co je zamčeno" — např. proč lze v jednom kroku a v jiném ne.
- **Chybí:** dashboard s KPI (metrů kabelu / zbývá k položení / kolik hotové).

### Vedoucí montáže
- **Co může:** projít plán, vidět endpointy.
- **Matoucí:** editor bez filtrů a bez tisknutelného výstupu.
- **Chybí:** export CSV/PDF, /work stránka s reálným tahacím seznamem.

### Technik u racku
- **Co může:** procházet patch panely, vidět porty.
- **Matoucí:** pro techniku není mobilní layout.
- **Chybí:** QR pro rychlé skenování portu, „tento kabel jsem zatáhl".

### Pracovník tahající kabely
- **Co může:** téměř nic použitelného v terénu.
- **Chybí:** Režim tahání jako sekvenční seznam s tlačítky start/hotovo, offline, foto k tahu, měření skutečné délky.

### Rozpočtář
- **Co může:** projít kabely, vidět `computed_length_m`.
- **Matoucí:** UI nevysvětluje, jak délka vznikla (bez breakdown).
- **Chybí:** rychlý export souhrnu (metrů podle typu × cena).

### Externí zákazník
- Zatím nemá vlastní režim — sdílet výstup lze jen přes screenshoty. **NOT_IMPLEMENTED.**

### Editor plánu (z posledních screenshotů)
- **Překryvy endpointů:** VÝRAZNÉ — na screenshotu se štítky (WCn, FCn, EPRnn, KVSnn…) překrývají v celých pásech. Nečitelné.
- **Čitelnost názvů:** špatná ve zhuštěné oblasti.
- **Velikost hitboxů:** endpoint dot ~ `0.012 / zoom` v normalizovaných jednotkách — na výchozím zoomu jsou tečky drobné a v hustotě se překrývají.
- **Boční panel:** kontextově per-mode (Endpoints / Racky / Kmeny / Trasy / Kalibrace) — čisté, ale bez seznamu-search.
- **Pořadí kroků 1→2→3→4→Kalibrace:** logické (endpointy dřív než kmeny), ale Kalibrace by měla být „krok 0" a je až na konci — matoucí.
- **Stavy uložené/neuložené:** viditelné částečně (draft body mají odlišnou barvu).
- **Konflikty:** není např. varování „kabel má trasu na jiném plánu než endpoint".
- **Mobil:** SVG a canvas fungují, ale postranní panel se nevejde. Tablet OK v landscape, telefon NE.

---

## 10. Produktová hodnota aktuální verze

- **Jaký problém řeší dnes:** rychlý cable takeoff z PDF plánu — nakreslit kabeláž, spočítat metry, mít RLS-chráněnou multi-projektovou databázi.
- **Kdo by ji mohl použít dnes:** malý slaboproudař, který dělá rozpočet strukturované kabeláže pro pobočky (McDonald's / Lidl / kanceláře) a nechce Excel + AutoCAD.
- **Za co by zákazník zaplatil už dnes:** ušetřený čas rozpočtáři (odhad metrů kabelu za hodiny, ne dny). ~ **cable takeoff SaaS** typu Stack CT / Bluebeam addon.
- **Nyní jen zajímavé demo:** Režim tahání, cívky, Visual Pull Station, auditovaný chat u endpointů.
- **Nejsilnější vstupní produkt:** kombinace **plan editor + length engine + kmeny s typem trasy**. To je jádro hodnoty.
- **Editor jako samostatný takeoff nástroj:** ANO, s doplněním exportu a filtrů. To je nejrychlejší cesta k prodejnému MVP.
- **Blízkost pilotu na stavbě:** daleko. Pilot potřebuje aspoň Režim tahání + offline + tisknutelný výstup.
- **Co by způsobilo ztrátu důvěry:** nezachovaný stav po pádu prohlížeče (bez autosave), špatný výpočet metrů kvůli neaplikovaným segmentům, překryvy nečitelných štítků, absence exportu.

---

## 11. Gap analýza

| Vrstva | Dokončeno % | Co funguje | Co chybí | Kritická závislost |
|---|---|---|---|---|
| A. PDF → datový plán | **80 %** | PDF/obrázek render, kalibrace, vrstva endpointů/racků/panelů | Multi-page PDF, filtry v editoru, undo | pdfjs-dist |
| B. plán → kalkulace kabeláže | **65 %** | Length engine + rezervy + kmeny se segmenty | Aplikace `extra_pct` do výpočtu, vertikální složka, uživatelská pravidla | length.ts, cables.functions.ts |
| C. kalkulace → tahací plán | **20 %** | `simulateSpools` (odhad cívek + hodin) | UI seznamu tahů, přiřazení lidí, foto/QR, offline | pullTasks CRUD |
| D. tahací plán → Visual Pull Station | **0 %** | — | Vše | — |
| E. Visual Pull Station → provedení | **0 %** | — | Vše | — |
| F. provedení → as-built | **10 %** | Fotky a komentáře u endpointů | Změna trasy proti odhadu, digitální podpis, PDF as-built | — |

---

## 12. Technický dluh

### P0 — bezpečnost / data
1. **REVOKE FROM PUBLIC na SECURITY DEFINER funkcích.** Linter WARN 1–7. Fix: `REVOKE EXECUTE FROM PUBLIC; GRANT EXECUTE TO authenticated`. Složitost: **XS**.
2. **Bez autosave v editoru = riziko ztráty práce.** Uživatel může přijít o desítky bodů kmene. Složitost: **M**.

### P1 — blokuje pilot
3. **Chybí ošetření unique conflicts** u `cable_bundles`, `racks`, `patch_panels`. Symptom stejný jako u endpoints_project_id_code_key. **S**.
4. **`extra_pct` z bundle segments se nezapočítává do délky.** Segmentace je čistě vizuální/data-only. **S**.
5. **`default_vertical_allowance_m` a `default_handling_factor` z projects → NEOVĚŘENO** zda vstupují do `computeCableLength` pipeline. **S** (audit + fix).
6. **Chybí Režim tahání jako CRUD nad `pull_tasks`.** Blokuje jakýkoli pilot. **L**.
7. **Chybí export CSV/PDF souhrnu kabelů a tahů.** Blokuje rozpočtáře. **S–M**.
8. **Editor plánu — filtry, search, layer toggle, klik-v-seznamu → středění.** UX pro 100+ endpointů. **M**.

### P2 — zhoršuje UX / údržbu
9. **Undo/redo v editoru.** **L**.
10. **Multi-page PDF a scroll mezi stránkami.** **M**.
11. **Overlap-aware label placement** na hustém plánu (nebo skryté štítky s tooltipem při hoveru). **M**.
12. **Duplicitní zdroj pravdy pro délku** (manual_length_m u trasy vs. computed u kabelu) — UI vysvětlení / preference. **XS** dokumentace, **M** implementace preference.
13. **Bez RLS smoke testů.** Regresi lze zavléct nepozorovaně. **M**.

### P3 — odložitelné
14. Sociální OAuth (Google), SSO. **S**.
15. Recharts na dashboardu (v deps, nepoužito). **XS**.
16. Sdílená knihovna typů kabelů / endpointů napříč projekty. **M**.

---

## 13. Doporučený další směr

### Strategie 1 — Editor a kalkulace jako první produkt
- **Výhoda:** nejrychlejší cesta k prodejnému MVP (cable takeoff SaaS). Konkuruje Excelu.
- **Nevýhoda:** neřeší provozní stavbu; nižší lock-in.
- **Kroky:** filtr endpointů + search + skrývání vrstev; aplikace segments do výpočtu; vertical/handling do výpočtu; export CSV kabelů + PDF souhrn; onboarding.
- **Rizika:** trh cable takeoff je konkurenční; bez integrace s CAD se drží jen slaboproudařů.
- **Potenciál:** freemium/SaaS, 30–200 EUR/mo za uživatele.
- **Checkpointy:** ~5.
- **Ukázka zákazníkovi:** projekt s reálným PDF, exportované metry v CSV.

### Strategie 2 — Co nejrychleji dokončit Pull Mode
- **Výhoda:** unikátní hodnota (odlišuje se od pouhého takeoff).
- **Nevýhoda:** vyžaduje mobilní UI + offline + skener → 3–4× víc práce.
- **Kroky:** CRUD `pull_tasks`, mobilní layout, offline sync (IndexedDB), foto+QR.
- **Rizika:** dlouhý čas do prvního zákazníka; offline sync komplikovaný.
- **Potenciál:** vyšší (enterprise), ale pomalý cash flow.
- **Checkpointy:** ~8.
- **Ukázka:** technik na stavbě odklikne 30 tahů z telefonu, obrázky se pak zobrazí manažerovi.

### Strategie 3 — Kompletní vertikální pilot pro jeden reálný projekt
- **Výhoda:** validace end-to-end, referenční klient.
- **Nevýhoda:** minimum funkcí per vrstva → křehké; velký rozsah.
- **Kroky:** minimum viable ve všech vrstvách A–F + hand-holding pilot.
- **Rizika:** rozšíření scope, blokátory v každé vrstvě zároveň.
- **Potenciál:** střední, závisí na jednom klientovi.
- **Checkpointy:** ~10.
- **Ukázka:** kompletní projekt McDonald's od PDF po as-built PDF.

### Doporučení: **Strategie 1**
Editor + length engine jsou nejsilnější části dnes; jsou blízko produkčnímu MVP. Strategie 1 minimalizuje risk a otevírá cestu k pilotu (Strategie 2) později. Ostatní vrstvy (Pull Mode, VPS) přistavíme po prvních zákaznících.

---

## 14. Návrh dalších checkpointů (max 5)

### CP-01 — Length engine je „opravdu správně"
- **Cíl:** délka spočítaná v UI je stejná jako v backendu a zahrnuje všechny faktory.
- **Scope:** aplikace `default_vertical_allowance_m`, `default_handling_factor` do `computeCableLength`; aplikace bundle `segments.extra_pct` per kabel dle jeho podílu v kmeni; jednotkové testy pro každý faktor; UI breakdown v detailu kabelu.
- **Mimo scope:** uživatelská pravidla, per-projekt override.
- **Acceptance:** unit testy 15+, ruční kontrola na 5 příkladech, breakdown viditelný v UI detailu kabelu.
- **Závislosti:** stávající length.ts, cables.functions.ts.
- **Rizika:** definice „podílu segmentu" na daném kabelu — dnes nejasná.

### CP-02 — Editor pro reálný projekt (100–300 endpointů)
- **Cíl:** editor je použitelný na hustém plánu.
- **Scope:** search + filter endpointů v postranním panelu; klik v seznamu vystředí a zvýrazní; skrývání vrstev z UI (checkboxy); overlap-aware label placement (nebo toggle „bez štítků, hover=tooltip"); autosave draftů kmenů/tras do localStorage; potvrzení uložení.
- **Mimo scope:** undo/redo (samostatný CP).
- **Acceptance:** projekt s 200 endpointy použitelný bez zaseknutí; ruční průchod filtrů; autosave přežije reload.
- **Závislosti:** existující plan editor.
- **Rizika:** velký refaktor SVG vrstev.

### CP-03 — Export a report
- **Cíl:** rozpočtář si odnese CSV a PDF souhrn.
- **Scope:** server fn exportCablesCsv, exportProjectSummaryPdf (pdf via `pdf-lib` server-side); UI tlačítko v projektu; audit záznam o exportu.
- **Mimo scope:** as-built PDF, faktura.
- **Acceptance:** CSV otevře Excel; PDF má hlavičku projektu, počty metrů podle typu kabelu, počty endpointů.
- **Závislosti:** cables + cable_types.
- **Rizika:** pdf-lib je Node-only? — pre-check před implementací.

### CP-04 — Robust unique/error handling a validace
- **Cíl:** žádné raw DB errory v UI.
- **Scope:** ošetření 23505 u bundle/rack/patch_panel/route; validace tenant konzistence u kabelu (endpoint & route ve stejném/přípustném plánu); UI hláška pro každou situaci; helper `assertUnique`.
- **Mimo scope:** RLS smoke testy (v CP-05).
- **Acceptance:** 8 nejběžnějších duplicitních scénářů zobrazí česky srozumitelnou hlášku, ne stack trace.

### CP-05 — Testovací a bezpečnostní báze
- **Cíl:** regresi zachytí CI.
- **Scope:** RLS smoke testy (přes service_role vs. anon/authenticated); revoke SECURITY DEFINER od PUBLIC; integrační test pro nejdůležitější `*_tx` RPC; e2e Playwright happy path „nový projekt → plán → kabel s délkou → export".
- **Mimo scope:** load testing.
- **Acceptance:** `bunx vitest run` obsahuje minimálně 25 testů; Playwright smoke prochází.

---

## 15. Otázky pro produktové rozhodnutí

1. Kolik různých typů „povrchu tahu" (žlab, výsek, podhled, drážka, volně) rozlišujete reálně u zákazníka a mají to být per-segment nebo per-trasa?
2. Jaké procento navíc se v praxi počítá pro každý typ (aktuálně máme 0/0/10/15 %)?
3. Je pro rozpočet dostatečný jeden faktor „handling" na celý projekt, nebo se liší podle patra, budovy, dodavatele?
4. Kolik různých racků reálně máte na jednom projektu a chcete povolit „hlavní rack + satelity" ve stejném plánu?
5. Chcete povolit sdílení kmene mezi několika kabely s **stromem** (branch) nebo stačí seznam samostatných tras?
6. Kdo dělá kalibraci — projektant v kanceláři, nebo technik na místě? Ovlivní to mobilní layout.
7. Odhad délky vs. skutečnost — chcete rozdíl trackovat automaticky (technik zadá měřenou délku) a mít report odchylek?
8. Jsou tahy vždy sekvenční (kabel po kabelu), nebo souběžné (tým tahá tři kabely v jedné trase najednou) a jak to vykazovat v `pull_tasks`?
9. Je požadován offline sběr dat (bez signálu na stavbě) nebo stačí online s pomalým 4G?
10. Kdo je konečný externí uživatel — investor / stavební dozor / generální dodavatel? Bude potřeba read-only režim s omezenou vrstvou dat?
11. Cenový model: per uživatel, per projekt, per metr kabelu, flat SaaS? To určí architekturu billingu.
12. Bude PullOps napojen na účetní systém (fakturace metry × cena), nebo se výstup exportuje ručně?
13. Jaké výstupy vyžaduje zákazník k předání díla (as-built PDF, DWG, CSV, XML)?
14. Cílový trh: pouze CZ/SK slaboproudaři, nebo EU-wide? Ovlivní jazyky a měřicí jednotky.
15. Podepisujete NDA/GDPR/ISO s klienty tak, že by data musela zůstat v EU? (Supabase → region check.)

---

## 16. Evidence map

| Tvrzení | Stav | Důkaz |
|---|---|---|
| „Používá se TanStack Start + React 19" | CONFIRMED | `package.json` |
| „Všechny public tabulky mají RLS" | CONFIRMED | `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'` → všechny `true` |
| „Existuje 24 tabulek" | CONFIRMED | `information_schema.tables` |
| „Kalibrace se ukládá do DB" | CONFIRMED | tabulka `floor_plan_calibrations`, `floorPlans.functions.ts:setCalibration` |
| „PDF se renderuje přes pdfjs-dist" | CONFIRMED | `plans.$planId.tsx:1658-1670` |
| „Length engine má unit testy" | CONFIRMED | `src/lib/length.test.ts`, 9/9 PASS |
| „Trasa podporuje větvení (strom)" | NOT_CONFIRMED | žádný sdílený uzel — jen `branch_points` per cable |
| „Kmen má segmenty s typem trasy" | CONFIRMED | `cable_bundles.segments jsonb`, migrace `20260711075716_*.sql` |
| „Segmenty ovlivňují výpočet délky" | NOT_CONFIRMED | `computeCableLength` extra_pct nezpracovává |
| „Vertikální složka vstupuje do výpočtu" | NOT_VERIFIED | `default_vertical_allowance_m` sloupec existuje, cesta do `computeCableLength` nedohledána |
| „Manipulační faktor vstupuje do výpočtu" | NOT_VERIFIED | `default_handling_factor` sloupec existuje, cesta nedohledána |
| „Existuje Režim tahání s CRUD" | BROKEN/NOT_IMPLEMENTED | `/work` renderuje jen `simulateSpools`, `pull_tasks` CRUD chybí |
| „Existuje Visual Pull Station" | NOT_IMPLEMENTED | jen zmínka v `src/routes/index.tsx:103` |
| „Existuje offline režim" | NOT_IMPLEMENTED | žádný service worker / IndexedDB |
| „Existuje export CSV/PDF" | NOT_IMPLEMENTED | žádná fce |
| „Existuje QR" | NOT_IMPLEMENTED | žádný kód |
| „Existuje undo/redo" | NOT_IMPLEMENTED | žádný pattern |
| „Existuje autosave" | NOT_IMPLEMENTED | žádný `setInterval`/`useDebouncedSave` v editoru |
| „RPC používají auth.uid()" | CONFIRMED | všechny `*_tx` funkce v `db-functions` |
| „Poslední admin je chráněn" | CONFIRMED | `remove_org_member_tx`, `set_org_role_tx` |
| „Audit log je append-only" | CONFIRMED | jen `SELECT` policy, INSERT přes SECURITY DEFINER trigger |
| „RLS smoke testy existují" | NOT_CONFIRMED | žádný test soubor kromě `length.test.ts` |
| „Typecheck prochází" | CONFIRMED | `bunx tsgo --noEmit` → 0 chyb |
| „Unique constraint na endpoint kódu způsobuje raw error" | FIXED (v této session) | `endpoints.functions.ts:createEndpoint` catch 23505 |
| „`endpoints_project_id_code_key` unique existuje" | CONFIRMED | error hláška z předchozí session |
| „Endpoint dots polykaly kliky v jiných módech" | FIXED (v této session) | `plans.$planId.tsx:1000-1008` — stopPropagation jen v endpoint/port/route |

---

## 17. Machine-readable summary

Viz `docs/audits/pullops-current-state-audit.json`.

---

**Konec reportu. Nic nebylo implementováno; jen analýza. Čekám na další pokyn.**
