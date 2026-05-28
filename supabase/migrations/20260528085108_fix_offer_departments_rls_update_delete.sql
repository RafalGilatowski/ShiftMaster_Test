/*
  # Fix RLS on offer_departments: add missing UPDATE and DELETE policies

  ## Problem
  The `offer_departments` table had only SELECT and INSERT policies.
  When a supplier edited an offer, the code executed:
    1. DELETE FROM offer_departments WHERE offer_id = $1  → silently blocked by RLS (no DELETE policy)
    2. INSERT INTO offer_departments ...                  → succeeded, creating duplicates or failing

  As a result the update appeared to work in the UI but the database was never modified.

  ## Changes
  - Add DELETE policy: suppliers can delete their own offer_departments
  - Add UPDATE policy: suppliers can update their own offer_departments
*/

-- DELETE: supplier can delete dept rows belonging to their own offer
CREATE POLICY "Suppliers can delete their offer departments"
  ON offer_departments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = offer_departments.offer_id
        AND offers.supplier_id = auth.uid()
    )
  );

-- UPDATE: supplier can update dept rows belonging to their own offer
CREATE POLICY "Suppliers can update their offer departments"
  ON offer_departments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = offer_departments.offer_id
        AND offers.supplier_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM offers
      WHERE offers.id = offer_departments.offer_id
        AND offers.supplier_id = auth.uid()
    )
  );
