-- ============================================================
-- Extensoes obrigatorias do banco ride
-- Executado automaticamente na primeira subida do container.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Confirma a versao instalada nos logs do container
DO $$
BEGIN
  RAISE NOTICE 'PostGIS instalado: %', PostGIS_Full_Version();
END $$;
