// Shared helpers for the Edge Functions (Deno).
import { createClient } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-return-to',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Service-role client: bypasses row level security. Server only. */
export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

/** The signed-in user calling the function (from the Authorization header). */
export async function caller(req: Request) {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

const BASE_URL = Deno.env.get('APP_URL') ?? 'https://juliusklahai.github.io/Auxa-academy/';
/** Where to send people back to: the page they came from (live or /preview/), but only inside our own site. */
export const APP_URL = (req?: Request) => {
  const r = req?.headers.get('x-return-to') ?? '';
  return r.startsWith(BASE_URL) && !r.includes('?') ? r : BASE_URL;
};
