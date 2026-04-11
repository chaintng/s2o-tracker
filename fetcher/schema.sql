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

DROP FUNCTION IF EXISTS temp.s2o_price_buckets(TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION temp.s2o_price_buckets(
  p_interval TEXT
)
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
    (ARRAY_AGG(n.offer_volume ORDER BY n.created_at DESC))[1]::INTEGER AS volume
  FROM normalized AS n
  GROUP BY n.ticket_level, n.ticket_type, n.bucket_local
  ORDER BY bucket_at DESC;
$$;

GRANT EXECUTE ON FUNCTION temp.s2o_price_buckets(TEXT) TO anon;

CREATE TABLE IF NOT EXISTS temp.s2o_price_alert (
  id                  BIGSERIAL PRIMARY KEY,
  ticket_level        VARCHAR(50)  NOT NULL,
  ticket_type         VARCHAR(100) NOT NULL,
  lower_bound         INTEGER,
  upper_bound         INTEGER,
  push_endpoint       TEXT         NOT NULL,
  push_p256dh         TEXT         NOT NULL,
  push_auth           TEXT         NOT NULL,
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  triggered_at        TIMESTAMPTZ,
  last_triggered_price INTEGER,
  last_error          TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT s2o_price_alert_ticket_level_check CHECK (ticket_level IN ('regular', 'vip')),
  CONSTRAINT s2o_price_alert_ticket_type_check CHECK (ticket_type IN ('All 3 Days', 'Day 1', 'Day 2', 'Day 3')),
  CONSTRAINT s2o_price_alert_bound_check CHECK (
    (lower_bound IS NOT NULL OR upper_bound IS NOT NULL)
    AND (lower_bound IS NULL OR lower_bound > 0)
    AND (upper_bound IS NULL OR upper_bound > 0)
    AND (lower_bound IS NULL OR upper_bound IS NULL OR lower_bound < upper_bound)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_s2o_price_alert_unique_target
  ON temp.s2o_price_alert (push_endpoint, ticket_level, ticket_type);

CREATE INDEX IF NOT EXISTS idx_s2o_price_alert_active_ticket
  ON temp.s2o_price_alert (ticket_level, ticket_type, is_active);

ALTER TABLE temp.s2o_price_alert ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public rpc only alerts" ON temp.s2o_price_alert;
CREATE POLICY "public rpc only alerts" ON temp.s2o_price_alert
  FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

DROP FUNCTION IF EXISTS temp.touch_s2o_price_alert_updated_at();
CREATE OR REPLACE FUNCTION temp.touch_s2o_price_alert_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_s2o_price_alert_updated_at ON temp.s2o_price_alert;
CREATE TRIGGER trg_s2o_price_alert_updated_at
BEFORE UPDATE ON temp.s2o_price_alert
FOR EACH ROW
EXECUTE FUNCTION temp.touch_s2o_price_alert_updated_at();

DROP FUNCTION IF EXISTS temp.get_s2o_price_alert(VARCHAR, VARCHAR, TEXT);
CREATE OR REPLACE FUNCTION temp.get_s2o_price_alert(
  p_ticket_level VARCHAR,
  p_ticket_type VARCHAR,
  p_push_endpoint TEXT
)
RETURNS TABLE (
  id BIGINT,
  lower_bound INTEGER,
  upper_bound INTEGER,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, temp
AS $$
  SELECT
    a.id,
    a.lower_bound,
    a.upper_bound,
    a.is_active,
    a.created_at,
    a.updated_at
  FROM temp.s2o_price_alert AS a
  WHERE a.ticket_level = p_ticket_level
    AND a.ticket_type = p_ticket_type
    AND a.push_endpoint = p_push_endpoint
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS temp.upsert_s2o_price_alert(VARCHAR, VARCHAR, INTEGER, INTEGER, JSONB);
CREATE OR REPLACE FUNCTION temp.upsert_s2o_price_alert(
  p_ticket_level VARCHAR,
  p_ticket_type VARCHAR,
  p_lower_bound INTEGER,
  p_upper_bound INTEGER,
  p_push_subscription JSONB
)
RETURNS TABLE (
  id BIGINT,
  lower_bound INTEGER,
  upper_bound INTEGER,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, temp
AS $$
DECLARE
  v_push_endpoint TEXT;
  v_push_p256dh TEXT;
  v_push_auth TEXT;
BEGIN
  v_push_endpoint := p_push_subscription ->> 'endpoint';
  v_push_p256dh := p_push_subscription -> 'keys' ->> 'p256dh';
  v_push_auth := p_push_subscription -> 'keys' ->> 'auth';

  IF p_lower_bound IS NULL AND p_upper_bound IS NULL THEN
    RAISE EXCEPTION 'At least one bound is required';
  END IF;

  IF p_lower_bound IS NOT NULL AND p_upper_bound IS NOT NULL AND p_lower_bound >= p_upper_bound THEN
    RAISE EXCEPTION 'Lower bound must be less than upper bound';
  END IF;

  IF v_push_endpoint IS NULL OR v_push_p256dh IS NULL OR v_push_auth IS NULL THEN
    RAISE EXCEPTION 'Push subscription is incomplete';
  END IF;

  RETURN QUERY
  INSERT INTO temp.s2o_price_alert (
    ticket_level,
    ticket_type,
    lower_bound,
    upper_bound,
    push_endpoint,
    push_p256dh,
    push_auth,
    is_active,
    triggered_at,
    last_triggered_price,
    last_error
  )
  VALUES (
    p_ticket_level,
    p_ticket_type,
    p_lower_bound,
    p_upper_bound,
    v_push_endpoint,
    v_push_p256dh,
    v_push_auth,
    TRUE,
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (push_endpoint, ticket_level, ticket_type)
  DO UPDATE SET
    lower_bound = EXCLUDED.lower_bound,
    upper_bound = EXCLUDED.upper_bound,
    push_p256dh = EXCLUDED.push_p256dh,
    push_auth = EXCLUDED.push_auth,
    is_active = TRUE,
    triggered_at = NULL,
    last_triggered_price = NULL,
    last_error = NULL
  RETURNING
    temp.s2o_price_alert.id,
    temp.s2o_price_alert.lower_bound,
    temp.s2o_price_alert.upper_bound,
    temp.s2o_price_alert.is_active,
    temp.s2o_price_alert.created_at,
    temp.s2o_price_alert.updated_at;
END;
$$;

DROP FUNCTION IF EXISTS temp.match_s2o_price_alerts(VARCHAR, VARCHAR, INTEGER);
CREATE OR REPLACE FUNCTION temp.match_s2o_price_alerts(
  p_ticket_level VARCHAR,
  p_ticket_type VARCHAR,
  p_offer_price INTEGER
)
RETURNS TABLE (
  id BIGINT,
  ticket_level VARCHAR,
  ticket_type VARCHAR,
  lower_bound INTEGER,
  upper_bound INTEGER,
  push_endpoint TEXT,
  push_p256dh TEXT,
  push_auth TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, temp
AS $$
  SELECT
    a.id,
    a.ticket_level,
    a.ticket_type,
    a.lower_bound,
    a.upper_bound,
    a.push_endpoint,
    a.push_p256dh,
    a.push_auth
  FROM temp.s2o_price_alert AS a
  WHERE a.ticket_level = p_ticket_level
    AND a.ticket_type = p_ticket_type
    AND a.is_active = TRUE
    AND (
      (a.lower_bound IS NOT NULL AND p_offer_price <= a.lower_bound)
      OR (a.upper_bound IS NOT NULL AND p_offer_price >= a.upper_bound)
    );
$$;

GRANT EXECUTE ON FUNCTION temp.get_s2o_price_alert(VARCHAR, VARCHAR, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION temp.upsert_s2o_price_alert(VARCHAR, VARCHAR, INTEGER, INTEGER, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION temp.match_s2o_price_alerts(VARCHAR, VARCHAR, INTEGER) TO authenticated, service_role;
