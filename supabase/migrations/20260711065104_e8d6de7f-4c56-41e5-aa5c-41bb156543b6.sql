
-- Extend endpoint_kind enum with new physical location types
ALTER TYPE public.endpoint_kind ADD VALUE IF NOT EXISTS 'SOCKET';
ALTER TYPE public.endpoint_kind ADD VALUE IF NOT EXISTS 'TRUNK_STRIP';
ALTER TYPE public.endpoint_kind ADD VALUE IF NOT EXISTS 'CEILING';
ALTER TYPE public.endpoint_kind ADD VALUE IF NOT EXISTS 'KIOSK';
ALTER TYPE public.endpoint_kind ADD VALUE IF NOT EXISTS 'OUTDOOR_KIOSK';
ALTER TYPE public.endpoint_kind ADD VALUE IF NOT EXISTS 'OUTDOOR_CABLE';
ALTER TYPE public.endpoint_kind ADD VALUE IF NOT EXISTS 'KITCHEN';
ALTER TYPE public.endpoint_kind ADD VALUE IF NOT EXISTS 'MONITOR';

-- Barva pro kmen (volitelná, pro odlišení na plánu)
ALTER TABLE public.cable_bundles ADD COLUMN IF NOT EXISTS color text;
