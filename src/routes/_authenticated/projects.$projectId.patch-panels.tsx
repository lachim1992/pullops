import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/projects/$projectId/patch-panels")({
  head: () => ({
    meta: [{ title: "Patch panely · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <Outlet />,
});
