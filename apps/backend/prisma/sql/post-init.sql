-- ============================================================
-- Ajustes pos-migracao: indices geoespaciais, constraints e triggers.
-- Idempotente: pode rodar varias vezes sem erro.
-- Executar com: pnpm --filter @ride/backend prisma:postinit
-- ============================================================

-- ---------- Indice GIST para busca de motoristas por proximidade ----------
CREATE INDEX IF NOT EXISTS driver_locations_location_gist
  ON driver_locations USING GIST (location);

CREATE INDEX IF NOT EXISTS surge_zones_boundary_gist
  ON surge_zones USING GIST (boundary);

-- ---------- Busca textual (autocomplete de enderecos/cidades) ----------
CREATE INDEX IF NOT EXISTS users_name_trgm
  ON users USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS user_addresses_formatted_address_trgm
  ON user_addresses USING GIN (formatted_address gin_trgm_ops);

-- ---------- Trigger generico de updated_at ----------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','devices','drivers','driver_documents','vehicles','vehicle_categories',
    'fare_configs','coupons','rides','payments','payment_methods','wallets',
    'payouts','surge_zones','driver_locations'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ---------- Views de apoio ao painel admin ----------

-- Motoristas ativos (online e disponiveis) com posicao atual
CREATE OR REPLACE VIEW vw_active_drivers AS
SELECT
  d.id                AS driver_id,
  u.name,
  u.phone,
  d.status,
  d.is_online,
  dl.is_available,
  d.rating_avg,
  d.total_rides,
  ST_Y(dl.location::geometry) AS latitude,
  ST_X(dl.location::geometry) AS longitude,
  dl.last_seen_at
FROM drivers d
JOIN users u ON u.id = d.user_id
LEFT JOIN driver_locations dl ON dl.driver_id = d.id
WHERE d.status = 'APPROVED' AND d.is_online = TRUE;

-- Resumo financeiro diario
CREATE OR REPLACE VIEW vw_daily_financials AS
SELECT
  DATE(r.finished_at)                     AS day,
  COUNT(*)                                AS rides_completed,
  SUM(r.final_fare_cents)                 AS gross_cents,
  SUM(r.commission_cents)                 AS commission_cents,
  SUM(r.driver_earning_cents)             AS driver_earnings_cents,
  ROUND(AVG(r.final_fare_cents))::int     AS avg_fare_cents,
  ROUND(AVG(r.distance_meters))::int      AS avg_distance_meters
FROM rides r
WHERE r.status = 'COMPLETED' AND r.finished_at IS NOT NULL
GROUP BY DATE(r.finished_at);
