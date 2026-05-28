/*
  # Add shift selection to orders and offers

  ## Changes
  - `orders`: add `required_shifts` text[] — which shifts the manager requires (e.g. ['06:00 - 14:00'] or both)
  - `offers`: add `selected_shifts` text[] — which shifts the supplier commits to cover

  ## Notes
  - Both columns default to empty array so existing rows are unaffected
  - No RLS changes needed; existing policies already cover these tables
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'required_shifts'
  ) THEN
    ALTER TABLE orders ADD COLUMN required_shifts text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offers' AND column_name = 'selected_shifts'
  ) THEN
    ALTER TABLE offers ADD COLUMN selected_shifts text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;
