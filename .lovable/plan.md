# Checkpoint B — Dokumenty, plány, kalibrace, endpointy, kabelový registr

Cíl: postavit spolehlivý **kabelový registr** a **model tras a délek** nad projektem z Checkpointu A. Žádný scanner, žádný optimizer, žádné dispenser sloty, žádný import `Hodiny_kabeláž_ČB2.xlsx`.

## 1. Datový model (jedna migrace)

Všechny tabulky pod `public`, s `organization_id` + `project_id` pro tenant integritu, `created_at`/`updated_at` triggerem, RLS scoped přes `has_project_role` / `is_project_member`, GRANTy pro `authenticated` a `service_role`. Mutace, které mohou porušit tenant integritu, jdou přes `*_tx` RPC. Prosté CRUD (název, popis, souřadnice) může jít přímo přes RLS INSERT/UPDATE.

- `project_documents` — nahrané PDF/PNG podklady (půdorysy, schémata). Sloupce: `project_id`, `kind` (enum `FLOOR_PLAN` | `SCHEMATIC` | `OTHER`), `title`, `storage_path`, `mime_type`, `page_count`, `uploaded_by`.
- `floor_plans` — logická vrstva „půdorys patra / zóny". Sloupce: `project_id`, `document_id` (nullable — plán může být kreslený bez PDF), `name`, `level` (int, patro), `display_order`.
- `floor_plan_calibrations` — dvoubodová kalibrace na plán. Sloupce: `floor_plan_id` (unique), `point_a_norm_x`, `point_a_norm_y`, `point_b_norm_x`, `point_b_norm_y` (všechny `numeric` v 0–1 s CHECK), `real_distance_m` (`numeric > 0`), `calibrated_by`, `calibrated_at`. Autoritativní zdroj pro převod normalizovaných souřadnic → metry. **PNG DPI se neukládá jako length input.**
- `cable_types` — číselník kabelů použitelných na projektu. Sloupce: `project_id`, `code` (např. `Cat6A UTP`), `description`, `default_reserve_m` (rezerva na koncích, default 3.0), `color_hint` (nullable, jen UI). Unique `(project_id, code)`.
- `endpoints` — každý fyzický koncový bod (zásuvka, keystone, patch pozice, AP, kamera…). Sloupce: `project_id`, `floor_plan_id`, `code` (např. `201`, `CSO01`), `label`, `endpoint_kind` (enum `WORKSTATION` | `AP` | `CAMERA` | `PATCH` | `OTHER`), `norm_x`, `norm_y` (0–1, CHECK), `notes`. Unique `(project_id, code)`.
- `cable_routes` — pojmenovaná trasa mezi dvěma endpointy (nebo endpoint ↔ rack). Sloupce: `project_id`, `from_endpoint_id`, `to_endpoint_id`, `floor_plan_id`, `manual_length_m` (nullable — když je zadaná ručně, má přednost před polylinou).
- `cable_route_points` — polyline body trasy v pořadí. Sloupce: `route_id`, `sequence` (int), `norm_x`, `norm_y`, `floor_plan_id` (pro budoucí multi-plánové trasy; teď musí == `route.floor_plan_id`). Unique `(route_id, sequence)`.
- `cables` — jeden fyzický kabel. Sloupce: `project_id`, `code` (např. `201`), `cable_type_id`, `route_id` (nullable, může být bez trasy), `from_endpoint_id`, `to_endpoint_id`, `status` (enum `PLANNED` | `PULLED` | `TERMINATED` | `TESTED` | `CANCELLED`, default `PLANNED`), `computed_length_m` (nullable, generováno enginem), `override_length_m` (nullable, ruční přebití), `notes`. Unique `(project_id, code)`. **Žádný `patch_port_id` v této fázi** — patch panely přijdou v 1C.

Enum typy: `document_kind`, `endpoint_kind`, `cable_status`.

## 2. Length engine

Pure funkce v `src/lib/length.ts`, volaná z:
- server fn `recomputeCableLength({ cableId })` (přepočítá jeden kabel na základě `route` + kalibrace + `default_reserve_m`),
- server fn `recomputeProjectLengths({ projectId })` (batch).

Pravidla:
1. `override_length_m` má vždy přednost — engine ho nepřepisuje.
2. `manual_length_m` na trase má přednost před polylinou.
3. Jinak: součet euklidovských vzdáleností mezi `cable_route_points` v normalizovaných souřadnicích, převedený přes kalibraci (`real_distance_m / norm_distance(A,B)`) na metry, plus `cable_type.default_reserve_m`.
4. Bez kalibrace → `computed_length_m = null` a UI ukáže „chybí kalibrace".

Unit testy pro engine (vitest): kalibrace, jednoduchý úsek, lomená polyline, chybějící kalibrace, override.

## 3. Server functions (`src/lib/`)

`documents.functions.ts`: `uploadDocument`, `listProjectDocuments`, `deleteDocument`.
`floorPlans.functions.ts`: `createFloorPlan`, `updateFloorPlan`, `listFloorPlans`, `setCalibration`, `getCalibration`.
`endpoints.functions.ts`: `createEndpoint`, `updateEndpoint`, `deleteEndpoint`, `listEndpoints`, `bulkImportEndpoints` (CSV: code,label,kind,x,y).
`cableTypes.functions.ts`: `createCableType`, `listCableTypes`, `updateCableType`.
`routes.functions.ts`: `createRoute`, `updateRoutePoints`, `deleteRoute`, `listRoutes`.
`cables.functions.ts`: `createCable`, `updateCable`, `bulkImportCables`, `listCables`, `setCableStatus`, `recomputeCableLength`, `recomputeProjectLengths`.

Vše `requireSupabaseAuth` + kontrola `has_project_role` uvnitř. Storage pro dokumenty: bucket `project-documents` (private), path `${projectId}/${uuid}.${ext}`.

## 4. UI (route soubory)

Vše pod `/_authenticated/projects/$projectId/`:
- `documents.tsx` — upload, seznam, náhled.
- `plans.tsx` — seznam půdorysů, add/edit, otevření editoru.
- `plans.$planId.tsx` — canvas s podkladovým obrázkem, dvoubodová kalibrace, přepínání vrstev (endpoints / routes), přidávání endpointů klikem, kreslení polyline tras. Kanvasová interakce v react + `<svg>` overlay nad `<img>`; žádná těžká knihovna.
- `endpoints.tsx` — tabulka + bulk CSV import + filtr.
- `cable-types.tsx` — číselník.
- `cables.tsx` — hlavní registr, tabulka s inline editací, filtry (status, typ, plán, endpoint), export CSV, tlačítko „Přepočítat délky".
- `cables.$cableId.tsx` — detail kabelu, historie stavů, přepočet, override délky.

Layout route `projects.$projectId.tsx` dostane sidebar s odkazy: Dashboard, Documents, Plans, Endpoints, Cable types, Cables, Members, Settings.

Wireframe canvasu (ASCII):
```text
+-- Plan editor -----------------------------+
| [mode: calibrate | endpoints | routes]     |
| +----------------------------------------+ |
| |            floorplan image             | |
| |    A●--(2.5 m)--●B  (calibration)      | |
| |    ○201    ○204                        | |
| |    └──polyline──┘                      | |
| +----------------------------------------+ |
| props panel: selected endpoint / route     |
+--------------------------------------------+
```

## 5. RLS

Všechny nové tabulky:
- SELECT: `is_project_member(project_id, auth.uid())`.
- INSERT/UPDATE/DELETE na `endpoints`, `cable_routes`, `cable_route_points`, `cables`, `cable_types`, `floor_plans`, `floor_plan_calibrations`, `project_documents`: `has_project_role(project_id, auth.uid(), 'editor')` nebo vyšší.
- `service_role`: ALL.
- Anon: žádné policy.

Cross-project INSERT je blokován triggerem `validate_project_tenant` na každé child tabulce (kontroluje, že FK cíl patří do stejného `project_id`).

## 6. Testy a DoD

- Vitest: length engine (5+ testů).
- `scripts/rls-smoke.ts` rozšířený: 2 uživatelé ve 2 projektech, ověření, že user A nevidí kabely/plány/endpoints projektu B, nemůže INSERT s cizím `project_id`.
- Playwright smoke: přihlášení → vytvoření dokumentu → vytvoření plánu → kalibrace → přidání 2 endpointů → vytvoření kabelu → přepočet délky → hodnota se objeví.
- Build ✓, žádný placeholder, žádná „Lovable App".

## 7. Explicitní ne-cíle Checkpointu B

- Žádný scanner / QR kódy.
- Žádné patch panely a porty (1C).
- Žádné cívky, pull assignments, dispenser sloty (1D+).
- Žádný import `Hodiny_kabeláž_ČB2.xlsx`.
- Žádný optimizer, žádný Live/Simulation mode.
- Žádná AI extrakce z PDF.

Po dokončení a průchodu DoD zastavím a počkám na schválení Checkpointu C (patch panely, porty, propojení kabelu s portem).
