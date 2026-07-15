import { auth, defineMcp } from "@lovable.dev/mcp-js";

import listMyProjectsTool from "./tools/list-my-projects";
import getProjectTool from "./tools/get-project";
import listProjectCablesTool from "./tools/list-project-cables";
import listProjectEndpointsTool from "./tools/list-project-endpoints";
import listProjectDefectsTool from "./tools/list-project-defects";
import listPullDayPlansTool from "./tools/list-pull-day-plans";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "pullops-mcp",
  title: "PullOps",
  version: "0.1.0",
  instructions:
    "Nástroje pro PullOps — plánování strukturované kabeláže. Umožňují číst projekty přihlášeného uživatele, jejich kabely, endpointy, plány tahání a závady. Přístup respektuje členství v projektech a RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listMyProjectsTool,
    getProjectTool,
    listProjectCablesTool,
    listProjectEndpointsTool,
    listProjectDefectsTool,
    listPullDayPlansTool,
  ],
});
