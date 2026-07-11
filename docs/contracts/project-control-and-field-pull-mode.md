# Product Contract — Project Control Mode + Field Pull Mode

Status: **PRODUCT CONTRACT (not yet implemented)**
Owner: PullOps
Last update: 2026-07-11

> Tento dokument je závazný produktový kontrakt. Definuje dvě role-based
> pracovní prostředí nad stejným projektem a stejnými daty. Implementace
> probíhá až v budoucích checkpointech (FIELD-01 až FIELD-05). Nezačínat
> mimo aktuálně schválený checkpoint.

---

## 1. Dva režimy projektu

### A. PROJECT CONTROL MODE
Pro: `ORG_ADMIN`, `PROJECT_MANAGER`, `PLANNER`, `SITE_LEAD` (s rozšířeným oprávněním).

Obsah:
- dokumenty
- editor plánů
- kalibrace
- endpointy
- typy endpointů
- racky
- patch panely
- kabelový registr
- kmeny a trasy
- pravidla výpočtu délek
- cívky
- tahací skupiny
- Visual Pull Station editor
- denní plány
- členy a oprávnění
- změny a audit
- exporty

### B. FIELD PULL MODE
Pro: `PULLER`, `RACK_TECHNICIAN`, běžný člen realizačního týmu.

Výchozí route po otevření projektu **není** plan editor:
- pokud existuje publikovaný denní plán → otevři dnešní aktivní Pull Mode
- jinak zobraz „Vedoucí zatím nepublikoval plán práce"

Běžný pracovník **nesmí** vidět ani upravovat:
- nastavení projektu
- editor tras
- pravidla délek
- dokumentové revize
- plánovací simulace
- správu členů
- neveřejné návrhy plánů

---

## 2. Projektové role a capabilities

### Org role
- `ORG_ADMIN`

### Project roles
- `PROJECT_MANAGER`
- `PLANNER`
- `SITE_LEAD`
- `PULLER`
- `RACK_TECHNICIAN`
- `VIEWER`

### Role → odpovědnost
- **PROJECT_MANAGER** — spravuje členy projektu, přiřazuje project roles, upravuje celý plán, publikuje denní plán, spouští a ukončuje plán.
- **PLANNER** — upravuje plány, endpointy, racky, kabely a trasy; připravuje denní plán; nemění členství projektu, pokud nemá zvláštní capability.
- **SITE_LEAD** — vidí plánovací data, může spustit publikovaný plán, měnit pořadí aktivních úloh, reagovat na problémy stavby, provádět supervisor override.
- **PULLER** — vidí pouze publikované a aktivní pracovní informace, provádí pull tasks, zadává stav, metráž, fotografie a problémy; nemění základní plán projektu.
- **RACK_TECHNICIAN** — vidí pull tasks a rack, označuje dressing, rack termination a patch port status.
- **VIEWER** — pouze čtení publikovaných informací.

### Capabilities (preferovány nad if-role v UI)
- `project.manage_members`
- `project.manage_plan`
- `project.publish_pull_plan`
- `project.modify_active_pull_plan`
- `project.manage_spools`
- `pull.view`
- `pull.execute`
- `pull.override`
- `rack.execute`
- `project.view_audit`

Server a RLS musí oprávnění vynucovat. Nestačí skrýt položky navigace.

---

## 3. Role-based default routing

Po otevření `/projects/{projectId}`:
- `project.manage_plan` → Project Overview / Control Mode
- pouze `pull.view` nebo `pull.execute` → `/projects/{projectId}/pull/today`
- `rack.execute` → dnešní Pull Mode nebo Rack Mode podle aktivní úlohy
- pouze viewer → read-only published overview

Route guard musí zabránit přímému otevření plánovací URL nepovoleným uživatelem.

---

## 4. Denní plány — `pull_day_plans`

Sloupce:
- `id`
- `project_id`
- `plan_date`
- `shift_name` nullable
- `title`
- `status`
- `pull_station_layout_id` nullable
- `version`
- `published_at` nullable
- `published_by` nullable
- `started_at` nullable
- `started_by` nullable
- `completed_at` nullable
- `completed_by` nullable
- `notes`
- `created_at`
- `created_by`

Status: `DRAFT`, `READY`, `PUBLISHED`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, `SUPERSEDED`, `CANCELLED`.

Unikátní: `(project_id, plan_date, version)`.

Pouze jeden `IN_PROGRESS` denní plán na projekt, pokud projekt explicitně nepovoluje paralelní pracovní směny.

**Publish**:
1. vytvoří neměnnou publikovanou verzi plánovaných úloh
2. zpřístupní ji přiřazeným účastníkům
3. zapíše audit event
4. odešle realtime update

Úprava publikovaného plánu nesmí potichu přepsat historii — vytvoří novou revizi nebo explicitní change event.

---

## 5. Účastníci denního plánu — `pull_day_plan_members`

Sloupce:
- `id`
- `pull_day_plan_id`
- `user_id`
- `duty_role`
- `assigned_at`
- `assigned_by`

Duty role: `SITE_LEAD`, `PULLER`, `RACK_TECHNICIAN`, `OBSERVER`.

Člen projektu nemusí automaticky vidět každý denní plán — vidí plány, ke kterým je přiřazen, nebo všechny, pokud má manage/publish capability.

---

## 6. Tahací úlohy — `pull_tasks`

Sloupce:
- `id`
- `pull_day_plan_id`
- `cable_id`
- `pull_batch_id` nullable
- `endpoint_id`
- `spool_id` nullable
- `dispenser_slot_id` nullable
- `assigned_user_id` nullable
- `sequence_number`
- `status`
- `planned_route_id` nullable
- `planned_length_m`
- `planned_min_m` nullable
- `planned_max_m` nullable
- `planned_patch_panel`
- `planned_patch_port`
- `route_snapshot_json`
- `endpoint_snapshot_json`
- `instructions`
- `started_at` nullable
- `completed_at` nullable
- `actual_consumption_m` nullable
- `actual_route_changed boolean default false`
- `blocked_reason` nullable
- `created_at`

Status: `PLANNED`, `READY`, `ACTIVE`, `PAUSED`, `BLOCKED`, `SKIPPED`, `PULLED`, `CANCELLED`, `REQUIRES_REVIEW`.

Publikovaná úloha uchovává snapshot endpoint informací, plánované trasy, patch panelu/portu a plánované délky. Změny hlavního projektu nesmí historicky změnit význam již dokončené úlohy.

---

## 7. Změny aktivního plánu — `pull_plan_change_events`

Sloupce:
- `id`
- `pull_day_plan_id`
- `pull_task_id` nullable
- `change_type`
- `before_json`
- `after_json`
- `reason`
- `created_by`
- `created_at`
- `supervisor_override boolean`

Change types: `REORDER`, `SKIP`, `POSTPONE`, `BLOCK`, `UNBLOCK`, `CHANGE_SPOOL`, `CHANGE_SLOT`, `CHANGE_ROUTE`, `CHANGE_ENDPOINT`, `REASSIGN_USER`, `ADD_TASK`, `REMOVE_TASK`, `OTHER`.

Aktivní plán lze měnit, ale změna musí mít autora a důvod, ostatní ji dostanou realtime, historie se nesmí ztratit.

---

## 8. Endpoint Field Card

V Pull Mode je každý endpoint rozkliknutelný. Zobrazí:
- kód a název endpointu
- typ endpointu
- oblast a místnost
- označení v plánu
- fotografie očekávané pozice
- montážní výšku
- poznámky
- všechny přiřazené kabely

U každého kabelu: `human_id`, cable type, plánovaná délka a rozsah, rack, patch panel, patch port, plánovaná trasa, spool, dispenser slot, status, případné issue.

Akce: zobrazit v plánu, zahájit tah, potvrdit dosažení endpointu, zadat odečet, přidat fotografii, nahlásit problém, navrhnout změnu trasy.

---

## 9. Pull Mode Hub

Route: `/projects/{projectId}/pull/today`.

Sekce:
- **A. Denní souhrn** — název plánu, vedoucí, směna, počet úloh, dokončeno, blokováno, aktivní pracovníci.
- **B. Visual Pull Station** — fyzické jednotky, sloty, aktuální spool, aktuální kabel, další kabel, stav a varování.
- **C. Aktivní tahací skupina** — kabely, společná trasa, pořadí odboček, postup.
- **D. Endpointy** — aktivní, následující, blokované, dokončené.
- **E. Problémy** — nové, blokující, čekající na rozhodnutí.

---

## 10. Detail slotu

Po kliknutí na slot velká provozní karta:

```
TÁHNI: {cable.human_id} — {cable.name}
Cívka: {spool.spool_code}
Slot:  {dispenser_slot.slot_code}
Endpoint: {endpoint.name}
Patch: PP {panel_number} / port {port_number}
Trasa: {route summary}
Odhad: {estimated_min_m}–{estimated_max_m}
Na oba konce napiš: {cable.human_id}
```

Akce: Připraveno, Zahájit tah, Pauza, Endpoint dosažen, Dokončit tah, Zadat metráž, Změna trasy, Nahlásit problém.

---

## 11. Atomické dokončení tahu — `complete_pull_task_tx(...)`

V jedné transakci:
1. ověřit oprávnění uživatele
2. uzamknout pull task
3. ověřit aktivní assignment kabelu a cívky
4. uložit actual consumption, pokud je známá
5. jinak uložit estimated consumption s jasným source typem
6. změnit pull task na `PULLED`
7. změnit cable status na `PULLED`
8. aktualizovat spool estimated remaining
9. vytvořit spool reading/consumption event
10. uložit případnou odchylku trasy
11. aktualizovat postup plánu
12. uzavřít aktivní assignment
13. aktivovat nebo nabídnout další plánovanou úlohu slotu
14. vytvořit audit event
15. odeslat realtime změnu

Nesmí automaticky označit kabel jako `terminated`, `dressed`, `tested` ani `accepted`.

---

## 12. Další úloha

Po dokončení tahu:
- pokud slot má další naplánovaný assignment → zobraz ho automaticky
- pokud je více kandidátů → doporučený + alternativy
- pokud cívka nemá dostatečnou rezervu → nabídni jinou cívku nebo výměnu slotu
- pokud žádná úloha není → slot `VOLNÝ` nebo `ČEKÁ NA VÝMĚNU`

Zobraz vždy: `human_id`, cable name, endpoint, patch panel/port, odhad délky, očekávaný zbytek cívky po tahu.

---

## 13. Navigace podle role

**Control Mode sidebar**: Přehled projektu, Dokumenty, Plány, Endpointy, Kabely, Rack, Trasy, Pravidla, Cívky, Denní plány, Visual Pull Station, Problémy, Členové, Audit, Nastavení.

**Field Mode bottom navigation**: Dnešní tah, Stanoviště, Endpointy, Problémy, Více.

Field Mode nesmí ukazovat technické administrativní položky.

---

## 14. Planned vs Actual

Nikdy nepřepisuj plánovaná data skutečnými daty bez historie. Odděluj:
- planned route vs actual route / route deviation
- planned length vs actual consumption
- planned spool vs actual spool
- planned order vs actual execution order

Report musí umět porovnat plán vs. skutečnost.

---

## 15. Offline a realtime

**Realtime**: změna aktivního plánu, změna pořadí, blokování úlohy, dokončení tahu, změna cívky nebo slotu.

**Offline (později)**: aktivní plán a úlohy lokálně, zahájení/dokončení připravené úlohy, fotografie a poznámky do queue, conflict handling při synchronizaci.

Dynamické změny plánu a supervisor override vyžadují online režim, pokud nebyly předem rezervované.

---

## 16. Akceptační scénář

1. Správce vytvoří projekt.
2. Pozve čtyři členy.
3. Jednoho nastaví jako `PLANNER`.
4. Jednoho jako `SITE_LEAD`.
5. Dva jako `PULLER`.
6. Planner vytvoří endpointy, racky, kabely, trasy a cívky.
7. Planner připraví denní plán pro 24. 7.
8. Správce plán publikuje.
9. `PULLER` po otevření projektu automaticky přejde do dnešního Pull Mode.
10. `PULLER` nevidí editor ani nastavení projektu.
11. Vidí Visual Pull Station, svůj aktivní kabel, endpoint, fotografii, délku, cívku, slot a patch panel/port.
12. Zahájí tah.
13. `SITE_LEAD` kvůli blokované trase změní pořadí dalšího kabelu.
14. Změna se realtime zobrazí oběma `PULLER` uživatelům.
15. `PULLER` dokončí kabel.
16. Atomická operace aktualizuje kabel, úlohu, cívku, assignment a postup plánu.
17. Slot automaticky nabídne následující kabel.
18. Rack technician později samostatně označí rack termination.
19. Dokončení tahu neoznačí kabel automaticky jako testovaný.
20. Report ukazuje plánované a skutečné pořadí, délku, cívku a změny.

---

## 17. Fázování

Tuto logiku **pouze zapiš jako produktový kontrakt**. Neimplementuj v CP-00 ani CP-01.

Doporučené budoucí pořadí:

- **FIELD-01** — project roles a role-based routing; day plan schema; publish workflow; read-only Pull Mode.
- **FIELD-02** — pull tasks; endpoint field card; základní state transitions.
- **FIELD-03** — spool assignments; Visual Pull Station live view; `complete_pull_task_tx`.
- **FIELD-04** — realtime changes; site lead overrides; planned vs actual.
- **FIELD-05** — offline queue; reconciliation; conflict resolution.

Po zapsání kontraktu pokračovat pouze v aktuálně schváleném checkpointu.
