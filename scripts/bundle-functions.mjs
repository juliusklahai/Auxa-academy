// Makes one self-contained file per Edge Function (shared helpers inlined) for pasting into the
// Supabase dashboard editor. Output: supabase/dashboard/<name>.ts
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
const root = 'supabase/functions';
const util = readFileSync(`${root}/_shared/util.ts`, 'utf8').split('\n').filter((l) => !l.startsWith('//')).join('\n');
const utilImports = util.split('\n').filter((l) => l.startsWith('import '));
const utilBody = util.split('\n').filter((l) => !l.startsWith('import ')).join('\n').replace(/^export /gm, '').trim();
mkdirSync('supabase/dashboard', { recursive: true });
for (const name of readdirSync(root).filter((d) => !d.startsWith('_') && !d.includes('.'))) {
  const src = readFileSync(`${root}/${name}/index.ts`, 'utf8').split('\n');
  const head = src.filter((l) => l.startsWith('//'));
  const imports = src.filter((l) => l.startsWith('import ') && !l.includes('_shared'));
  const body = src.filter((l) => !l.startsWith('//') && !l.startsWith('import ')).join('\n').trim();
  const allImports = [...new Set([...imports, ...utilImports])];
  const out = [`// ${name}: paste this whole file into Supabase → Edge Functions → ${name} (generated, do not edit here)`, ...head, ...allImports, '', '// ---- shared helpers ----', utilBody, '', '// ---- function ----', body, ''].join('\n');
  writeFileSync(`supabase/dashboard/${name}.ts`, out);
  console.log(name, out.length);
}
