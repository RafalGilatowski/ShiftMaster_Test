/*
  # Enable Supabase Realtime for offers and related tables

  1. Changes
    - Adds `offers`, `orders`, and `offer_departments` tables to the `supabase_realtime`
      publication so that Postgres Change Data Capture events are broadcast to connected
      clients. Without this, `.on('postgres_changes', ...)` subscriptions receive no events.

  2. Notes
    - Uses `ALTER PUBLICATION ... ADD TABLE` with IF EXISTS guards via a DO block.
    - Safe to run multiple times — adding an already-present table is a no-op in PG 14+.
*/

DO $$
BEGIN
  -- Create the publication if it doesn't exist (hosted Supabase always has it, but guard anyway)
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE offers;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE offer_departments;
