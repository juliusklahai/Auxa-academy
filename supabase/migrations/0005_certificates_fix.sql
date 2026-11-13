-- Fix for 0004: on Supabase, pgcrypto (gen_random_bytes, hmac) lives in the "extensions" schema.
-- Run once in the SQL editor if you ran 0004 before this fix.
alter function public.issue_certificate(int, text, text, text) set search_path = public, private, extensions;
notify pgrst, 'reload schema';
