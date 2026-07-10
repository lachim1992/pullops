import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/projects/$projectId/cables")({
  head: () => ({
    meta: [{ title: "Kabely · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <Outlet />,
});
