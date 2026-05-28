/*
  # VMS (Vendor Management System) Schema

  ## Overview
  Creates tables for a worker order management system supporting two user roles:
  Internal (Organizers/Employees) and External (Suppliers/Agencies).

  ## New Tables

  ### profiles
  - Extends auth.users with role information
  - `id` - references auth.users
  - `role` - 'internal' or 'external'
  - `company_name` - for external suppliers
  - `full_name` - display name

  ### orders
  - Worker orders created by internal users
  - `id` - UUID primary key
  - `created_by` - references profiles.id
  - `plant` - factory location (Koło, Sokołów, etc.)
  - `department` - department within plant
  - `workers_needed` - number of workers required
  - `start_date` - when workers are needed from
  - `days_count` - how many days
  - `status` - 'active', 'fulfilled', 'cancelled'
  - `created_at` - timestamp

  ### offers
  - Supplier responses to orders
  - `id` - UUID primary key
  - `order_id` - references orders.id
  - `supplier_id` - references profiles.id
  - `confirmed_workers` - number supplier can provide
  - `availability_date` - when workers available
  - `availability_time` - time slot
  - `rate_per_hour` - PLN per RBH
  - `status` - 'pending', 'sent', 'accepted', 'rejected'
  - `created_at` - timestamp

  ## Security
  - RLS enabled on all tables
  - Internal users can manage orders and view all offers for their orders
  - External users can view orders and manage their own offers
*/

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'internal' CHECK (role IN ('internal', 'external')),
  full_name text NOT NULL DEFAULT '',
  company_name text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Internal users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'internal'
    )
  );

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plant text NOT NULL,
  department text NOT NULL,
  workers_needed integer NOT NULL DEFAULT 1 CHECK (workers_needed > 0),
  start_date date NOT NULL,
  days_count integer NOT NULL DEFAULT 1 CHECK (days_count > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fulfilled', 'cancelled')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can insert orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'internal'
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "Internal users can view all orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'internal'
    )
  );

CREATE POLICY "External users can view active orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'external'
    )
    AND status = 'active'
  );

CREATE POLICY "Internal users can update their orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'internal'
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'internal'
    )
  );

-- Offers table
CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  confirmed_workers integer NOT NULL DEFAULT 1 CHECK (confirmed_workers > 0),
  availability_date date NOT NULL,
  availability_time text NOT NULL DEFAULT '',
  rate_per_hour numeric(10,2) NOT NULL CHECK (rate_per_hour > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "External users can insert own offers"
  ON offers FOR INSERT
  TO authenticated
  WITH CHECK (
    supplier_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'external'
    )
  );

CREATE POLICY "External users can view own offers"
  ON offers FOR SELECT
  TO authenticated
  USING (
    supplier_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'external'
    )
  );

CREATE POLICY "External users can update own offers"
  ON offers FOR UPDATE
  TO authenticated
  USING (
    supplier_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'external'
    )
  )
  WITH CHECK (
    supplier_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'external'
    )
  );

CREATE POLICY "Internal users can view all offers"
  ON offers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'internal'
    )
  );

CREATE POLICY "Internal users can update offer status"
  ON offers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'internal'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'internal'
    )
  );

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role, company_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'internal'),
    COALESCE(NEW.raw_user_meta_data->>'company_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
