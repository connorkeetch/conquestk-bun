-- Fix CRC32 integer overflow issue
-- CRC32 produces unsigned 32-bit integers (0 to 4,294,967,295)
-- PostgreSQL INTEGER type is signed (-2,147,483,648 to 2,147,483,647)
-- Change to BIGINT to accommodate full CRC32 range

ALTER TABLE match_checksums
ALTER COLUMN crc32 TYPE BIGINT;

-- No need to update existing data - BIGINT can hold all INTEGER values
