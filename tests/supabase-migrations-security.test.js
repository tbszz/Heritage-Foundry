import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsDir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
const migrationSql = readdirSync(migrationsDir)
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort()
  .map((fileName) => readFileSync(new URL(`../supabase/migrations/${fileName}`, import.meta.url), 'utf8'))
  .join('\n');

describe('Supabase migration security', () => {
  it('enables row level security for creation likes', () => {
    expect(migrationSql).toMatch(
      /alter\s+table\s+public\.creation_likes\s+enable\s+row\s+level\s+security\s*;/i
    );
  });

  it('revokes direct browser-role access to creation likes', () => {
    expect(migrationSql).toMatch(
      /revoke\s+all(?:\s+privileges)?\s+on\s+table\s+public\.creation_likes\s+from\s+anon\s*,\s*authenticated\s*;/i
    );
  });
});
