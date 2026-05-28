/*
  # Add offer_deadline to orders

  ## Summary
  Adds a timestamp column `offer_deadline` to the `orders` table.
  Managers set this when creating an order. After this moment:
  - suppliers cannot submit new offers
  - the order remains on the dashboard for up to 5 days awaiting a final decision
  - once a decision is made (accept/cancel), the order moves to history

  ## Changes
  - `orders.offer_deadline` (timestamptz, nullable) — deadline for offer submissions
    Nullable so existing rows are unaffected.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'offer_deadline'
  ) THEN
    ALTER TABLE orders ADD COLUMN offer_deadline timestamptz;
  END IF;
END $$;
