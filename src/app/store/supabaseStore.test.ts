import { readFileSync, readdirSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseStore } from './supabaseStore';

/** Column names of each table, read from the database migrations. */
function schemaColumns(): Map<string, Set<string>> {
  const dir = new URL('../../../supabase/migrations/', import.meta.url);
  const sql = readdirSync(dir).sort().map(f => readFileSync(new URL(f, dir), 'utf8')).join('\n');
  const tables = new Map<string, Set<string>>();
  for (const m of sql.matchAll(/create table public\.(\w+) \(([\s\S]*?)\n\);/g)) {
    const cols = new Set<string>();
    for (const line of m[2]!.split('\n')) {
      const c = line.trim().match(/^([a-z_]+)\s+(uuid|text|integer|numeric|boolean|date|timestamptz|jsonb)/);
      if (c) cols.add(c[1]!);
    }
    tables.set(m[1]!, cols);
  }
  for (const m of sql.matchAll(/alter table public\.(\w+)\s+((?:add column [a-z_]+[^;]*?)+);/g)) {
    for (const c of m[2]!.matchAll(/add column ([a-z_]+)/g)) tables.get(m[1]!)?.add(c[1]!);
  }
  return tables;
}

/** A stand-in for Supabase that records which tables and columns are asked for. */
function fakeSupabase() {
  const calls: { table: string; order?: string }[] = [];
  const result = { data: [], error: null };
  const sb = {
    from(table: string) {
      const call: { table: string; order?: string } = { table };
      calls.push(call);
      const q = {
        select: () => q,
        order: (col: string) => { call.order = col; return q; },
        range: () => Promise.resolve(result),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return q;
    },
  };
  return { sb: sb as unknown as SupabaseClient, calls };
}

describe('SupabaseStore.load', () => {
  it('only reads tables and sorts by columns that exist in the database', async () => {
    const schema = schemaColumns();
    const { sb, calls } = fakeSupabase();
    await new SupabaseStore(sb).load();
    expect(calls.length).toBeGreaterThan(5);
    for (const c of calls) {
      expect(schema.has(c.table), `table ${c.table}`).toBe(true);
      if (c.order) expect(schema.get(c.table)!.has(c.order), `${c.table}.${c.order}`).toBe(true);
    }
  });
});
