
ALTER TABLE public.pull_assignments
  ADD COLUMN IF NOT EXISTS sequence_number integer,
  ADD COLUMN IF NOT EXISTS planned_after_assignment_id uuid REFERENCES public.pull_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS optimizer_score numeric(10,4),
  ADD COLUMN IF NOT EXISTS optimizer_reasons jsonb;

CREATE INDEX IF NOT EXISTS pull_assignments_day_plan_seq_idx
  ON public.pull_assignments(day_plan_id, sequence_number);
