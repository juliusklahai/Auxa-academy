// npx vite-node scripts/exerciseCatalog.ts  ->  supabase/migrations/0009_exercise_catalog.sql
import { writeFileSync } from 'fs';
import { catalogSql } from '../src/progress/exerciseCatalog';
writeFileSync(new URL('../supabase/migrations/0009_exercise_catalog.sql', import.meta.url), catalogSql());
console.log('written');
