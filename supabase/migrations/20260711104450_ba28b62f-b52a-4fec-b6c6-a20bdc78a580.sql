ALTER TABLE public.floor_plans
  ADD COLUMN IF NOT EXISTS published_to_pull boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS floor_plans_published_to_pull_idx
  ON public.floor_plans (project_id, published_to_pull);