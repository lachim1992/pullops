import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/projects/$projectId/completion")({
  head: () => ({
    meta: [{ title: "Kompletace · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <Outlet />,
});
