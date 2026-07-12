
-- Notification preferences per user
CREATE TABLE public.user_notification_prefs (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  inapp_task_assigned BOOLEAN NOT NULL DEFAULT true,
  inapp_defect_assigned BOOLEAN NOT NULL DEFAULT true,
  inapp_defect_status BOOLEAN NOT NULL DEFAULT true,
  inapp_chat_mention BOOLEAN NOT NULL DEFAULT true,
  inapp_project_member BOOLEAN NOT NULL DEFAULT true,
  email_task_assigned BOOLEAN NOT NULL DEFAULT false,
  email_defect_assigned BOOLEAN NOT NULL DEFAULT false,
  email_defect_status BOOLEAN NOT NULL DEFAULT false,
  email_chat_mention BOOLEAN NOT NULL DEFAULT false,
  email_project_member BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_prefs TO authenticated;
GRANT ALL ON public.user_notification_prefs TO service_role;

ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own notification prefs"
  ON public.user_notification_prefs
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_user_notification_prefs_updated
  BEFORE UPDATE ON public.user_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Leave organization (self-service) with last-admin protection
CREATE OR REPLACE FUNCTION public.leave_organization_tx(p_organization_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = v_user AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'not a member of the organization';
  END IF;

  -- Prevent removing the last admin
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user AND organization_id = p_organization_id
      AND project_id IS NULL AND role = 'admin'
  ) AND (
    SELECT count(*) FROM public.user_roles
    WHERE organization_id = p_organization_id AND project_id IS NULL AND role = 'admin'
  ) <= 1 THEN
    RAISE EXCEPTION 'cannot leave: you are the last admin. Assign another admin first.';
  END IF;

  DELETE FROM public.user_roles
    WHERE user_id = v_user AND organization_id = p_organization_id;
  DELETE FROM public.project_members pm
    USING public.projects p
    WHERE pm.project_id = p.id
      AND p.organization_id = p_organization_id
      AND pm.user_id = v_user;
  DELETE FROM public.organization_members
    WHERE organization_id = p_organization_id AND user_id = v_user;

  -- Clear default org if it points to the org being left
  UPDATE public.profiles
    SET default_organization_id = NULL
    WHERE id = v_user AND default_organization_id = p_organization_id;
END;
$$;
