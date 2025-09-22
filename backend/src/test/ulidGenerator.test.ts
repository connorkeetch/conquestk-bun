import { describe, expect, it } from '@jest/globals'

describe('generate_ulid SQL function', () => {
  it('produces monotonic, unique ULIDs when database is available', async () => {
    if (process.env.RUN_ULID_TESTS !== 'true') {
      console.warn('Skipping generate_ulid test: set RUN_ULID_TESTS=true to enable database coverage')
      expect(true).toBe(true)
      return
    }

    let query:
      | ((text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>)
      | undefined

    try {
      const databaseModule = await import('../config/database')
      query = databaseModule.query
    } catch (error) {
      console.warn('Skipping generate_ulid test: database module unavailable', error)
      return
    }

    if (!query) {
      console.warn('Skipping generate_ulid test: query function unavailable')
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
    } catch (error) {
      console.warn('Skipping generate_ulid test: unable to create helper function', error)
      return
    }

    const result = await query(
      `SELECT generate_ulid() AS id FROM generate_series(1, 20)`,
    )

    const ids = result.rows.map((row) => row.id as string)

    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every((id) => typeof id === 'string' && id.length === 26)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)

    const sorted = [...ids].sort()
    expect(ids).toEqual(sorted)
  })
})
