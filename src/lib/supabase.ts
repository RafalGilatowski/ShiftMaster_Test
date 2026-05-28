import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'internal' | 'external';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  company_name: string;
  created_at: string;
}

// Plant-level order header
export interface Order {
  id: string;
  created_by: string;
  plant: string;
  department: string;
  workers_needed: number;
  start_date: string;
  days_count: number;
  status: 'active' | 'fulfilled' | 'cancelled';
  created_at: string;
  required_shifts: string[];
  offer_deadline: string | null;
  profiles?: Profile;
}

// Department-level row within an order
export interface OrderDepartment {
  id: string;
  order_id: string;
  department: string;
  workers_needed: number;
  days_count: number;
  start_date: string;
  required_shifts: string[];
  created_at: string;
}

// Supplier offer header (one per order per supplier)
export interface Offer {
  id: string;
  order_id: string;
  supplier_id: string;
  confirmed_workers: number;
  availability_date: string;
  availability_time: string;
  rate_per_hour: number;
  status: 'pending' | 'sent' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
  selected_shifts: string[];
  profiles?: Profile;
}

// Per-department bid line attached to an offer
export interface OfferDepartment {
  id: string;
  offer_id: string;
  order_department_id: string;
  confirmed_workers: number;
  rate_per_hour: number;
  selected_shifts: string[];
  created_at: string;
}

// Audit trail: one row per historical version of a per-department bid
export interface OfferHistoryLog {
  id: string;
  offer_id: string;
  order_department_id: string;
  version: number;
  confirmed_workers: number;
  rate_per_hour: number;
  selected_shifts: string[];
  recorded_at: string;
}
