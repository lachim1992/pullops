
-- =========== EXTEND TASKS FOR KANBAN ===========
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS defect_id uuid,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid;

-- Extend chat with attachments (photo ids)
ALTER TABLE public.project_chat_messages
  ADD COLUMN IF NOT EXISTS attachment_photo_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS defect_id uuid;

-- =========== DEFECTS ===========
CREATE TABLE IF NOT EXISTS public.defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text,
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'DEFECT' CHECK (severity IN ('INFO','DEFECT','CRITICAL')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','WAITING','RESOLVED','REJECTED')),
  entity_type text CHECK (entity_type IN ('endpoint','cable','patch_panel','photo','other')),
  entity_id uuid,
  assigned_to uuid,
  reported_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.defects TO authenticated;
GRANT ALL ON public.defects TO service_role;
ALTER TABLE public.defects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "defects_select" ON public.defects FOR SELECT TO authenticated USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "defects_insert" ON public.defects FOR INSERT TO authenticated WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "defects_update" ON public.defects FOR UPDATE TO authenticated USING (public.is_project_member(auth.uid(), project_id)) WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "defects_delete" ON public.defects FOR DELETE TO authenticated USING (public.is_project_member(auth.uid(), project_id));
CREATE INDEX IF NOT EXISTS idx_defects_project ON public.defects(project_id);
CREATE INDEX IF NOT EXISTS idx_defects_status ON public.defects(project_id, status);
CREATE INDEX IF NOT EXISTS idx_defects_entity ON public.defects(entity_type, entity_id);

CREATE TRIGGER trg_defects_updated BEFORE UPDATE ON public.defects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========== DEFECT PHOTOS ===========
CREATE TABLE IF NOT EXISTS public.defect_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  defect_id uuid NOT NULL REFERENCES public.defects(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  storage_path text NOT NULL,
  caption text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.defect_photos TO authenticated;
GRANT ALL ON public.defect_photos TO service_role;
ALTER TABLE public.defect_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "defect_photos_all" ON public.defect_photos FOR ALL TO authenticated USING (public.is_project_member(auth.uid(), project_id)) WITH CHECK (public.is_project_member(auth.uid(), project_id));

-- =========== DEFECT COMMENTS ===========
CREATE TABLE IF NOT EXISTS public.defect_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  defect_id uuid NOT NULL REFERENCES public.defects(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.defect_comments TO authenticated;
GRANT ALL ON public.defect_comments TO service_role;
ALTER TABLE public.defect_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "defect_comments_all" ON public.defect_comments FOR ALL TO authenticated USING (public.is_project_member(auth.uid(), project_id)) WITH CHECK (public.is_project_member(auth.uid(), project_id));

-- =========== NOTIFICATIONS ===========
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid,
  organization_id uuid,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link_path text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own_select" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications_own_update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications_own_delete" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications_insert_project_member" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (project_id IS NULL OR public.is_project_member(auth.uid(), project_id));
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- =========== REALTIME PUBLICATION ===========
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.project_chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.project_tasks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.defects;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.defect_comments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.project_lobby_photos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ensure REVIEW status is allowed on project_tasks (currently unchecked text)
-- Add soft constraint via CHECK
DO $$ BEGIN
  ALTER TABLE public.project_tasks ADD CONSTRAINT project_tasks_status_check
    CHECK (status IN ('TODO','IN_PROGRESS','REVIEW','DONE','CANCELLED'));
EXCEPTION WHEN duplicate_object THEN NULL; WHEN check_violation THEN NULL; END $$;
