ALTER TABLE public.cables
  ADD COLUMN IF NOT EXISTS queued_for_pull boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS cables_queued_for_pull_idx
  ON public.cables (project_id, queued_for_pull)
  WHERE queued_for_pull = true;