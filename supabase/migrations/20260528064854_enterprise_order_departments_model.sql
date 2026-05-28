/*
  # Enterprise multi-department order model

  ## Summary
  Introduces two new tables to support plant-level orders with multiple department
  sub-entries, and per-department offer line items.

  ## New Tables

  ### order_departments
  Child rows of `orders`. Each row represents one department within a plant order.
  - `id` – primary key
  - `order_id` – FK to orders (the parent plant-level order)
  - `department` – department name
  - `workers_needed` – head count required
  - `days_count` – contract duration in days
  - `start_date` – start date for this department
  - `required_shifts` – which shifts are required (text[])

  ### offer_departments
  Per-department bid rows attached to an offer.
  - `id` – primary key
  - `offer_id` – FK to offers (the parent supplier offer header)
  - `order_department_id` – FK to order_departments
  - `confirmed_workers` – workers the supplier commits to this department
  - `rate_per_hour` – hourly rate in PLN for this department
  - `selected_shifts` – shifts the supplier will cover (text[])

  ## Modified Tables
  - `orders`: `department`, `workers_needed`, `days_count`, `required_shifts`
    are now optional / legacy; new orders use order_departments instead.
    No columns dropped to preserve backwards compatibility.

  ## Security
  - RLS enabled on both tables
  - internal users can read/write order_departments for orders they created
  - authenticated suppliers can read order_departments for active orders
  - suppliers can insert/read their own offer_departments
  - internal users can read all offer_departments
*/

-- ── order_departments ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_departments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  department        text NOT NULL DEFAULT '',
  workers_needed    integer NOT NULL DEFAULT 1,
  days_count        integer NOT NULL DEFAULT 1,
  start_date        date NOT NULL,
  required_shifts   text[] NOT NULL DEFAULT '{}',
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE order_departments ENABLE ROW LEVEL SECURITY;

-- Internal users can manage departments of orders they created
CREATE POLICY "Internal users can insert their order departments"
  ON order_departments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_departments.order_id
        AND orders.created_by = auth.uid()
    )
  );

CREATE POLICY "Internal users can select order departments"
  ON order_departments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_departments.order_id
        AND orders.created_by = auth.uid()
    )
  );

-- External suppliers can read departments of active orders
CREATE POLICY "Suppliers can read active order departments"
  ON order_departments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_departments.order_id
        AND orders.status = 'active'
    )
  );

-- ── offer_departments ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS offer_departments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id              uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  order_department_id   uuid NOT NULL REFERENCES order_departments(id) ON DELETE CASCADE,
  confirmed_workers     integer NOT NULL DEFAULT 1,
  rate_per_hour         numeric(10,2) NOT NULL DEFAULT 0,
  selected_shifts       text[] NOT NULL DEFAULT '{}',
  created_at            timestamptz DEFAULT now()
);

ALTER TABLE offer_departments ENABLE ROW LEVEL SECURITY;

-- Suppliers can insert their own offer departments
CREATE POLICY "Suppliers can insert their offer departments"
  ON offer_departments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = offer_departments.offer_id
        AND offers.supplier_id = auth.uid()
    )
  );

-- Suppliers can read their own offer departments
CREATE POLICY "Suppliers can read their offer departments"
  ON offer_departments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = offer_departments.offer_id
        AND offers.supplier_id = auth.uid()
    )
  );

-- Internal users can read all offer departments
CREATE POLICY "Internal users can read all offer departments"
  ON offer_departments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'internal'
    )
  );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_order_departments_order_id ON order_departments(order_id);
CREATE INDEX IF NOT EXISTS idx_offer_departments_offer_id ON offer_departments(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_departments_order_dept_id ON offer_departments(order_department_id);
