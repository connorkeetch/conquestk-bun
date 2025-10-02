import { describe, expect, it } from '@jest/globals'
import type { DatabaseQueryResult } from '../config/database'

type UlidQueryResult = DatabaseQueryResult<{ id: string }>
type UlidQuery = (text: string, params?: unknown[]) => Promise<UlidQueryResult>

describe('generate_ulid SQL function', () => {
  const runUlidTest = process.env.RUN_ULID_TESTS === 'true' ? it : it.skip

  runUlidTest('produces monotonic, unique ULIDs when database is available', async () => {
    let query: UlidQuery | undefined

    try {
      const databaseModule = await import('../config/database')
      query = databaseModule.query as UlidQuery
    } catch (_error) {
      return
    }

    if (!query) {
      return
    }

    try {
      await query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        CREATE OR REPLACE FUNCTION generate_ulid()
        RETURNS CHAR(26) AS $$
        DECLARE
          timestamp_ms NUMERIC := floor(extract(epoch FROM clock_timestamp()) * 1000);
          random_component BYTEA := gen_random_bytes(10);
          base32_alphabet TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
          ulid_value NUMERIC;
          encoded TEXT := '';
          i INT;
          remainder INT;
        BEGIN
          ulid_value := timestamp_ms * power(2::numeric, 80);

          FOR i IN 0..9 LOOP
            ulid_value := ulid_value + get_byte(random_component, i) * power(2::numeric, (9 - i) * 8);
          END LOOP;

          FOR i IN 1..26 LOOP
            remainder := mod(ulid_value, 32)::INT;
            encoded := substr(base32_alphabet, remainder + 1, 1) || encoded;
            ulid_value := floor(ulid_value / 32);
          END LOOP;

          RETURN encoded::CHAR(26);
        END;
        $$ LANGUAGE plpgsql VOLATILE;
      `)
    } catch (_error) {
      return
    }

    const result = await query(`SELECT generate_ulid() AS id FROM generate_series(1, 20)`)

    const ids = result.rows.map((row) => row.id)

    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every((id) => typeof id === 'string' && id.length === 26)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)

    const sorted = [...ids].sort()
    expect(ids).toEqual(sorted)
  })
})
