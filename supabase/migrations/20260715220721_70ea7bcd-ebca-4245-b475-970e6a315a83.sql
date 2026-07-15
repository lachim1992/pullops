DROP POLICY IF EXISTS notifications_insert_project_member ON public.notifications;

CREATE POLICY notifications_insert_project_member
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      project_id IS NULL
      OR public.is_project_member(auth.uid(), project_id)
    )
    AND (
      project_id IS NULL
      OR public.is_project_member(user_id, project_id)
    )
  );