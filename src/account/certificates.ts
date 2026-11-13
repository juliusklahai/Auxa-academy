// Verifiable certificates: issued by the database (see migration 0004), checked by anyone with the code.
import { ACCOUNTS_ENABLED } from './config';
import { getAccount, supabase } from './store';

export interface IssuedCert { code: string; seal: string; issued_at: string; earned_on: string }
export interface CertRecord extends IssuedCert { name: string; level: number; level_name: string; topics: string; replaced_by: string | null; revoked: boolean }

export const canIssue = () => ACCOUNTS_ENABLED && !!getAccount().user;

export async function issueCertificate(level: number, name: string, levelName: string, topics: string): Promise<IssuedCert> {
  const sb = await supabase();
  const { data, error } = await sb.rpc('issue_certificate', { p_level: level, p_name: name, p_level_name: levelName, p_topics: topics });
  if (error) throw new Error(/issue_certificate|schema cache/i.test(error.message) && /does not exist|could not find|schema cache/i.test(error.message) ? 'Verified certificates are being set up. Please try again later.' : error.message);
  const row = (data as IssuedCert[] | null)?.[0];
  if (!row) throw new Error('Could not issue the certificate.');
  return row;
}

export async function verifyCertificate(code: string): Promise<CertRecord | null> {
  if (!ACCOUNTS_ENABLED) return null;
  const sb = await supabase();
  const { data, error } = await sb.rpc('verify_certificate', { p_code: code });
  if (error) throw new Error(error.message);
  return (data as CertRecord[] | null)?.[0] ?? null;
}
