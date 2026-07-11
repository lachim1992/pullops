ALTER TABLE public.cable_bundles
  ADD COLUMN IF NOT EXISTS segments jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.cable_bundles.segments IS
  'Per-segment metadata for the polyline. Length = points-1. Each item: {type: DIRECT|TRAY|WALL|CEILING, extra_pct: number}';