
## Analýza současného stavu

### Co je zjištěno na živých datech
- **Fotky v DB**: lobby 14, endpoint 0, defect 0, protocol 0, day plán 0 → nahrávání funguje jen v Lobby; ostatní toky sice mají tabulky + policy, ale UI je nespouští, nebo je v archivu odstíněno chybou.
- **Archiv Fotodokumentace padá tiše**: v `listAllProjectPhotos` je JOIN `pull_day_plans(code, plan_date)`, ale tabulka má sloupce `name` a `planned_date` → celý serverFn hodí chybu a v UI se zobrazí "0 / Zatím žádné fotky". Proto uživatel vidí prázdný archiv i pro lobby.
- **Sekce úkolů** používá `project_tasks` (TODO / IN_PROGRESS / REVIEW / DONE / CANCELLED). Přehled projektu je s tím propojený (nový osobní dashboard), ale samotné úkoly na jiných místech (dashboard organizace, notifikace) nejsou konzistentně propojeny.
- **Cross-linky mezi sekcemi jsou neúplné**: fotka endpointu skočí jen na `/endpoints` (ne na konkrétní endpoint), fotka závady na `/defects` (ne na kartu závady), fotka day plánu na `/work` (ne na plán), protokol na `/protocols` (ne na daný protokol).
- **Endpointové fotky** – existuje `endpointPhotos.functions`, ale UI upload je jen v detailu endpointu; v archivu tedy chybí, dokud technik nenafotí.
- **Day plán fotky / protocol fotky / defect fotky** – existuje serverFn a upload UI, ale mapa na cíl linku v archivu je chybná (viz výše).

### Kořen problému u fotoarchivu
Rozbitý embed JOIN → celý `Promise.all` skončí s chybou → UI ukáže „0 fotek".

## Plán úprav

### 1. Opravit fotoarchiv, aby vůbec zobrazoval data (blocker)
- V `src/lib/projectPhotos.functions.ts`:
  - `pull_day_plans(code, plan_date)` → `pull_day_plans(name, planned_date)`
  - `project_protocols(code, title)` — ověřit sloupce a případně opravit
  - `endpoints(code, label)` a `defects(code, title)` — ověřit
  - Zrobustnit: chyby jednotlivých zdrojů logovat, ale nezhroutit celý archiv (partial results místo `throw`).

### 2. Cross-linky (fotky → konkrétní entita)
- Endpoint fotka → `/projects/$projectId/endpoints?ep={endpointId}` (otevře drawer endpointu)
- Defect fotka → `/projects/$projectId/defects?d={defectId}`
- Protocol fotka → `/projects/$projectId/protocols?p={protocolId}`
- Day plán fotka → `/projects/$projectId/plans/{planId}` (editor plánu)
- Lobby fotka → `/projects/$projectId/lobby?tab=chat&msg={id}` (auto-scroll)
- Do každého cílového route přidat čtení query param a highlight/scroll.

### 3. Sjednocení počtů a dashboardu
- V `getProjectHome` doplnit `photosTotal` (součet všech pěti tabulek) a v Přehledu projektu ukázat u dlaždice Lobby druhý štítek „X fotek".
- V `getMyProjectDashboard` už máme dnešní aktivitu; přidat i odkaz „Otevřít fotoarchiv" a „Otevřít mé úkoly".

### 4. Úkoly – logické propojení
- V archivu úkolů (Lobby → Úkoly) přidat filtr „Přiřazené mně" a „Vytvořené mnou".
- V org dashboardu ukázat součet `myOpenTasks` a link na projekt s nejvíce mými úkoly.
- Karta závady → tlačítko „Vytvořit úkol z této závady" (už existuje `defect_id` na `project_tasks`, jen doplnit UI akci).

### 5. Dokumenty a plány
- V sekci Dokumenty přidat sekci „Endpointy" (přehled + odkaz) a „Kabely" (přehled + odkaz), aby to nebylo jen soubory.
- V Plánech ukázat, kolik day plánů z tohoto floor planu se generovalo a proklik zpět.

### 6. Sjednocení názvosloví a filtry
- V archivu fotek přejmenovat filtr „Tahání" → „Day plán" (odpovídá zdroji `day_plan`).
- Přidat filtr podle uploadera („Můj upload") a časové okno (dnes / týden / vše).

## Technické poznámky

- `pull_day_plans` reálné sloupce: `name`, `planned_date` (ne `code`/`plan_date`).
- `project_protocols` a `endpoints` – ověřím `SELECT column_name` před nasazením.
- Archiv fotoarchivu udělám resilientní: každý zdroj v samostatném `try`, chyby vrátit v `warnings[]` a UI je zobrazí decentní hláškou (nezhroutí grid).
- Storage buckety jsou už privátní (`public=false`), signed URL platí 1h – zachováme.

## Otázka pro upřesnění (než začnu implementovat)

Rozsah je široký. Navrhuji začít v tomto pořadí:
**A)** krok 1+2 – oprava archivu + cross-linky (nejvíc bolí hned)
**B)** krok 3+4 – dashboard + úkoly (logická provázanost)
**C)** krok 5+6 – dokumenty/plány + názvosloví (kosmetika)

Chceš, abych šel **A → B → C** postupně (menší commity, můžeš průběžně kontrolovat), nebo mám v tomto tahu udělat **A** celé a další kroky až podle výsledku?
