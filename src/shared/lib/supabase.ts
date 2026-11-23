import { supabase } from '@/lib/supabase';

export const isSupabaseConfigured = true;
export const getSupabase = () => supabase;
export { supabase };
