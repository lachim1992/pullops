import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/projects/$projectId/plans")({
  head: () => ({
    meta: [{ title: "Plány · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <Outlet />,
});
