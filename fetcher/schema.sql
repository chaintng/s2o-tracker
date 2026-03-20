-- Run this in your Supabase SQL editor to create the table

CREATE TABLE IF NOT EXISTS temp.s2o_historical_price (
  id          BIGSERIAL PRIMARY KEY,
  ticket_level VARCHAR(50)  NOT NULL, -- 'regular' | 'vip'
  ticket_type  VARCHAR(100) NOT NULL, -- 'All 3 Days' | 'Day 1' | 'Day 2' | 'Day 3'
  offer_price  INTEGER      NOT NULL, -- lowest listing price in THB
  offer_volume INTEGER      NOT NULL, -- number of tickets available
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_s2o_created_at ON temp.s2o_historical_price (created_at DESC);

-- Index for filtering by ticket type
CREATE INDEX IF NOT EXISTS idx_s2o_ticket ON temp.s2o_historical_price (ticket_level, ticket_type);

-- Enable Row Level Security
ALTER TABLE temp.s2o_historical_price ENABLE ROW LEVEL SECURITY;

-- Allow anon (public) to read — required for the chart-view frontend
CREATE POLICY "public read" ON temp.s2o_historical_price
  FOR SELECT TO anon USING (true);

CREATE OR REPLACE FUNCTION temp.s2o_price_buckets(p_interval TEXT)
RETURNS TABLE (
  ticket_level VARCHAR(50),
  ticket_type VARCHAR(100),
  bucket_at TIMESTAMPTZ,
  open INTEGER,
  high INTEGER,
  low INTEGER,
  close INTEGER,
  volume INTEGER
)
LANGUAGE sql
STABLE
AS $$
  WITH normalized AS (
    SELECT
      s.ticket_level,
      s.ticket_type,
      CASE p_interval
        WHEN '10m' THEN date_bin(INTERVAL '10 minutes', s.created_at AT TIME ZONE 'Asia/Bangkok', TIMESTAMP '2000-01-01 00:00:00')
        WHEN '1H' THEN date_bin(INTERVAL '1 hour', s.created_at AT TIME ZONE 'Asia/Bangkok', TIMESTAMP '2000-01-01 00:00:00')
        WHEN '6H' THEN date_bin(INTERVAL '6 hours', s.created_at AT TIME ZONE 'Asia/Bangkok', TIMESTAMP '2000-01-01 00:00:00')
        WHEN '1D' THEN date_bin(INTERVAL '1 day', s.created_at AT TIME ZONE 'Asia/Bangkok', TIMESTAMP '2000-01-01 00:00:00')
        ELSE date_bin(INTERVAL '10 minutes', s.created_at AT TIME ZONE 'Asia/Bangkok', TIMESTAMP '2000-01-01 00:00:00')
      END AS bucket_local,
      s.offer_price,
      s.offer_volume,
      s.created_at
    FROM temp.s2o_historical_price AS s
  )
  SELECT
    n.ticket_level,
    n.ticket_type,
    n.bucket_local AT TIME ZONE 'Asia/Bangkok' AS bucket_at,
    (ARRAY_AGG(n.offer_price ORDER BY n.created_at ASC))[1] AS open,
    MAX(n.offer_price) AS high,
    MIN(n.offer_price) AS low,
    (ARRAY_AGG(n.offer_price ORDER BY n.created_at DESC))[1] AS close,
    ROUND(AVG(n.offer_volume))::INTEGER AS volume
  FROM normalized AS n
  GROUP BY n.ticket_level, n.ticket_type, n.bucket_local
  ORDER BY bucket_at ASC;
$$;

GRANT EXECUTE ON FUNCTION temp.s2o_price_buckets(TEXT) TO anon;
