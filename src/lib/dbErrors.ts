// Shared translator for PostgreSQL / PostgREST errors into user-friendly Czech.
// Server functions should call `throwDbError(error)` instead of `throw new Error(error.message)`
// so users never see raw PG text like `duplicate key value violates unique constraint "..."`.

type PgLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined;

// Mapping constraint name → Czech message.
// Extend when new UNIQUE / FK constraints get added.
const UNIQUE_MESSAGES: Array<{ match: RegExp; message: string }> = [
  { match: /endpoints_project_id_code_key/i, message: "Endpoint s tímto kódem už v projektu existuje." },
  { match: /racks_project_id_code_key/i, message: "Rack s tímto kódem už v projektu existuje." },
  { match: /patch_panels_project_id_code_key/i, message: "Patch panel s tímto kódem už v projektu existuje." },
  { match: /patch_ports_panel_id_port_number_key/i, message: "Port s tímto číslem už na panelu existuje." },
  { match: /cables_project_id_code_key/i, message: "Kabel s tímto kódem už v projektu existuje." },
  { match: /cable_bundles_project_id_code_key/i, message: "Kmen s tímto kódem už v projektu existuje." },
  { match: /cable_types_project_id_code_key/i, message: "Typ kabelu s tímto kódem už v projektu existuje." },
  { match: /projects_organization_id_code_key/i, message: "Projekt s tímto kódem už v organizaci existuje." },
  { match: /endpoint_kinds_project_id_code_key/i, message: "Typ endpointu s tímto kódem už v projektu existuje." },
  { match: /endpoint_cable_groups_cable_id_key/i, message: "Kabel je již přiřazen k endpointu." },
  { match: /endpoint_cable_groups_endpoint_id_cable_id_key/i, message: "Kabel je již přiřazen k tomuto endpointu." },
  { match: /floor_plan_calibrations_floor_plan_id_key/i, message: "Kalibrace pro tento plán už existuje." },
  { match: /cable_route_points_route_id_sequence_key/i, message: "Bod trasy s tímto pořadím už existuje." },
];

export function dbErrorMessage(error: PgLikeError, fallback = "Databázová operace selhala."): string {
  if (!error) return fallback;
  const msg = error.message ?? "";
  const details = error.details ?? "";
  const code = error.code ?? "";

  // 23505 = unique violation
  if (code === "23505" || /duplicate key value/i.test(msg)) {
    for (const rule of UNIQUE_MESSAGES) {
      if (rule.match.test(msg) || rule.match.test(details)) return rule.message;
    }
    return "Záznam s touto hodnotou už existuje.";
  }
  // 23503 = foreign key violation
  if (code === "23503" || /violates foreign key/i.test(msg)) {
    return "Odkazovaný záznam neexistuje nebo byl smazán.";
  }
  // 23502 = not null
  if (code === "23502") return "Chybí povinné pole.";
  // 23514 = check constraint
  if (code === "23514") return "Hodnota nesplňuje kontrolní podmínku.";
  // 42501 = insufficient privilege
  if (code === "42501") return "Chybí oprávnění pro tuto operaci.";
  // PostgREST permission denied wrapper
  if (/permission denied/i.test(msg)) return "Chybí oprávnění pro tuto operaci.";

  return msg || fallback;
}

/** Throw a translated Error; use inside server-function handlers after a supabase call. */
export function throwDbError(error: PgLikeError, fallback?: string): never {
  throw new Error(dbErrorMessage(error, fallback));
}
