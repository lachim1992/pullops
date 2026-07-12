
CREATE OR REPLACE FUNCTION public.is_org_admin_for_project(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.projects p ON p.organization_id = ur.organization_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'admin'::public.app_role
      AND ur.project_id IS NULL
      AND p.id = _project_id
  )
$$;

CREATE TABLE public.project_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (length(body) > 0 AND length(body) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_chat_messages_project_created ON public.project_chat_messages(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_chat_messages TO authenticated;
GRANT ALL ON public.project_chat_messages TO service_role;
ALTER TABLE public.project_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_select_members" ON public.project_chat_messages FOR SELECT TO authenticated
USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "chat_insert_self_member" ON public.project_chat_messages FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_project_member(auth.uid(), project_id));
CREATE POLICY "chat_update_own" ON public.project_chat_messages FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "chat_delete_own_or_admin" ON public.project_chat_messages FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_org_admin_for_project(auth.uid(), project_id));
CREATE TRIGGER trg_chat_touch BEFORE UPDATE ON public.project_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_chat_messages;
ALTER TABLE public.project_chat_messages REPLICA IDENTITY FULL;

CREATE TABLE public.project_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  description TEXT,
  assigned_to UUID,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO','IN_PROGRESS','DONE','CANCELLED')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_tasks_project ON public.project_tasks(project_id, status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_tasks TO authenticated;
GRANT ALL ON public.project_tasks TO service_role;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_select_members" ON public.project_tasks FOR SELECT TO authenticated
USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "task_insert_members" ON public.project_tasks FOR INSERT TO authenticated
WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "task_update_members" ON public.project_tasks FOR UPDATE TO authenticated
USING (public.is_project_member(auth.uid(), project_id))
WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "task_delete_manager" ON public.project_tasks FOR DELETE TO authenticated
USING (public.is_org_admin_for_project(auth.uid(), project_id) OR created_by = auth.uid());
CREATE TRIGGER trg_tasks_touch BEFORE UPDATE ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.project_task_checkpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 300),
  done BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_checkpoints_task ON public.project_task_checkpoints(task_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_task_checkpoints TO authenticated;
GRANT ALL ON public.project_task_checkpoints TO service_role;
ALTER TABLE public.project_task_checkpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp_select_members" ON public.project_task_checkpoints FOR SELECT TO authenticated
USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "cp_write_members" ON public.project_task_checkpoints FOR ALL TO authenticated
USING (public.is_project_member(auth.uid(), project_id))
WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE TRIGGER trg_task_cp_touch BEFORE UPDATE ON public.project_task_checkpoints
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.project_lobby_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption TEXT,
  taken_at TIMESTAMPTZ,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lobby_photos_project ON public.project_lobby_photos(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_lobby_photos TO authenticated;
GRANT ALL ON public.project_lobby_photos TO service_role;
ALTER TABLE public.project_lobby_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lobbyphoto_select" ON public.project_lobby_photos FOR SELECT TO authenticated
USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "lobbyphoto_insert" ON public.project_lobby_photos FOR INSERT TO authenticated
WITH CHECK (public.is_project_member(auth.uid(), project_id) AND uploaded_by = auth.uid());
CREATE POLICY "lobbyphoto_update_owner" ON public.project_lobby_photos FOR UPDATE TO authenticated
USING (uploaded_by = auth.uid()) WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "lobbyphoto_delete_owner_admin" ON public.project_lobby_photos FOR DELETE TO authenticated
USING (uploaded_by = auth.uid() OR public.is_org_admin_for_project(auth.uid(), project_id));
CREATE TRIGGER trg_lobby_photos_touch BEFORE UPDATE ON public.project_lobby_photos
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.pull_tasks
  ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminated_by UUID,
  ADD COLUMN IF NOT EXISTS tested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tested_by UUID,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID,
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

CREATE OR REPLACE FUNCTION public.validate_pull_task_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('PLANNED','IN_PROGRESS','PULLED','TERMINATED','TESTED','DONE','CANCELLED') THEN
    RAISE EXCEPTION 'Invalid pull_task status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_pull_task_status ON public.pull_tasks;
CREATE TRIGGER trg_validate_pull_task_status
BEFORE INSERT OR UPDATE OF status ON public.pull_tasks
FOR EACH ROW EXECUTE FUNCTION public.validate_pull_task_status();
