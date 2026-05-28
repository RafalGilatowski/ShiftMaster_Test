/*
  # Production VMS Schema - New Project

  Creates all tables, RLS policies, triggers for the production VMS application.

  ## Tables
  1. profiles - linked to auth.users, role-based (internal/external)
  2. orders - staffing requests by internal users
  3. offers - supplier responses

  ## Security
  - RLS on all tables
  - JWT-based role checks (no recursive queries)
  - Auto-create profile trigger on signup
*/

-- PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'external' CHECK (role IN ('internal', 'external')),
  full_name text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can view own profile') THEN
    CREATE POLICY "Users can view own profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Internal users can view all profiles') THEN
    CREATE POLICY "Internal users can view all profiles" ON profiles FOR SELECT TO authenticated
      USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'internal');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can update own profile') THEN
    CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated
      USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users can insert own profile') THEN
    CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plant text NOT NULL,
  department text NOT NULL,
  workers_needed integer NOT NULL CHECK (workers_needed > 0),
  start_date date NOT NULL,
  days_count integer NOT NULL CHECK (days_count > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fulfilled', 'cancelled')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='orders' AND policyname='Internal users can view all orders') THEN
    CREATE POLICY "Internal users can view all orders" ON orders FOR SELECT TO authenticated
      USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'internal');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='orders' AND policyname='External users can view active orders') THEN
    CREATE POLICY "External users can view active orders" ON orders FOR SELECT TO authenticated
      USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'external' AND status = 'active');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='orders' AND policyname='Internal users can insert orders') THEN
    CREATE POLICY "Internal users can insert orders" ON orders FOR INSERT TO authenticated
      WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'internal' AND auth.uid() = created_by);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='orders' AND policyname='Internal users can update own orders') THEN
    CREATE POLICY "Internal users can update own orders" ON orders FOR UPDATE TO authenticated
      USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'internal' AND auth.uid() = created_by)
      WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'internal' AND auth.uid() = created_by);
  END IF;
END $$;

-- OFFERS
CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  confirmed_workers integer NOT NULL CHECK (confirmed_workers > 0),
  availability_date date NOT NULL,
  availability_time text NOT NULL DEFAULT '',
  rate_per_hour numeric(10,2) NOT NULL CHECK (rate_per_hour > 0),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='offers' AND policyname='Suppliers can view own offers') THEN
    CREATE POLICY "Suppliers can view own offers" ON offers FOR SELECT TO authenticated
      USING (auth.uid() = supplier_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='offers' AND policyname='Internal users can view all offers') THEN
    CREATE POLICY "Internal users can view all offers" ON offers FOR SELECT TO authenticated
      USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'internal');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='offers' AND policyname='Suppliers can insert offers') THEN
    CREATE POLICY "Suppliers can insert offers" ON offers FOR INSERT TO authenticated
      WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'external' AND auth.uid() = supplier_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='offers' AND policyname='Suppliers can update own offers') THEN
    CREATE POLICY "Suppliers can update own offers" ON offers FOR UPDATE TO authenticated
      USING (auth.uid() = supplier_id) WITH CHECK (auth.uid() = supplier_id);
  END IF;
END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS offers_updated_at ON offers;
CREATE TRIGGER offers_updated_at
  BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, company_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'external'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'company_name', ''),
    COALESCE(NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_offers_order_id ON offers(order_id);
CREATE INDEX IF NOT EXISTS idx_offers_supplier_id ON offers(supplier_id);
