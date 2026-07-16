
ALTER TABLE public.dispenser_units DROP CONSTRAINT dispenser_units_template_id_fkey;
ALTER TABLE public.dispenser_units ADD CONSTRAINT dispenser_units_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES public.dispenser_templates(id) ON DELETE CASCADE;
