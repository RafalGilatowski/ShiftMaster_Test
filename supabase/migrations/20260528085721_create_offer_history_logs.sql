/*
  # Create offer_history_logs table for supplier offer audit trail

  ## Purpose
  Every time a supplier submits or edits an offer, the previous version of each
  department bid is captured here. This enables managers to see the full history
  of rate changes and worker count changes per department.

  ## New Tables

  ### offer_history_logs
  One row per historical version of a per-department bid.

  | Column                | Type        | Description                                          |
  |-----------------------|-------------|------------------------------------------------------|
  | id                    | uuid PK     | Unique row id                                        |
  | offer_id              | uuid FK     | References offers(id)                                |
  | order_department_id   | uuid FK     | References order_departments(id)                     |
  | version               | int         | Version number (1 = initial submission, 2 = first edit, …) |
  | confirmed_workers     | int         | Workers count at this version                        |
  | rate_per_hour         | numeric     | RBH rate at this version                             |
  | selected_shifts       | text[]      | Shifts at this version                               |
  | recorded_at           | timestamptz | When this version was recorded                       |

  ## Security
  - RLS enabled
  - Internal users can read all history logs
  - Suppliers can read their own offer's logs
  - INSERT allowed for authenticated users (supplier inserts their own version rows)
  - No UPDATE / DELETE — audit trail is append-only
*/

CREATE TABLE IF NOT EXISTS offer_history_logs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id             uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  order_department_id  uuid NOT NULL REFERENCES order_departments(id) ON DELETE CASCADE,
  version              integer NOT NULL DEFAULT 1,
  confirmed_workers    integer NOT NULL,
  rate_per_hour        numeric NOT NULL,
  selected_shifts      text[] NOT NULL DEFAULT '{}',
  recorded_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_history_logs_offer_id ON offer_history_logs(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_history_logs_dept_id  ON offer_history_logs(order_department_id);

ALTER TABLE offer_history_logs ENABLE ROW LEVEL SECURITY;

-- Internal users can read all history
CREATE POLICY "Internal users can read all offer history"
  ON offer_history_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'internal'
    )
  );

-- Suppliers can read history for their own offers
CREATE POLICY "Suppliers can read own offer history"
  ON offer_history_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = offer_history_logs.offer_id
        AND offers.supplier_id = auth.uid()
    )
  );

-- Suppliers can insert history rows for their own offers
CREATE POLICY "Suppliers can insert own offer history"
  ON offer_history_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = offer_history_logs.offer_id
        AND offers.supplier_id = auth.uid()
    )
  );

-- Also add offer_history_logs to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE offer_history_logs;
