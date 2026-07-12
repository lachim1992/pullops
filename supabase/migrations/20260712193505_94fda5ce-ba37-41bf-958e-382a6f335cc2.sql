-- Organization chat: firemní chat na úrovni organizace
CREATE TABLE public.organization_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_chat_org_created ON public.organization_chat_messages(organization_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_chat_messages TO authenticated;
GRANT ALL ON public.organization_chat_messages TO service_role;

ALTER TABLE public.organization_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read org chat"
  ON public.organization_chat_messages FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "org members can post to org chat"
  ON public.organization_chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id) AND user_id = auth.uid());

CREATE POLICY "authors can update own org chat messages"
  ON public.organization_chat_messages FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "authors or org admins can delete org chat messages"
  ON public.organization_chat_messages FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_org_role(auth.uid(), organization_id, 'admin'));

CREATE TRIGGER trg_org_chat_updated_at
  BEFORE UPDATE ON public.organization_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_chat_messages;