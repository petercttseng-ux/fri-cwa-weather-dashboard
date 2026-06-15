-- ================================================================
-- FRI 氣象儀表板 — Supabase 資料表初始化 SQL
-- 請於 Supabase Dashboard > SQL Editor 執行
--
-- ⚠ 首次執行：直接執行全部
-- ⚠ 若之前已執行過且遇到錯誤：
--   先執行 Step 0（刪除舊表），再執行 Step 1~4
-- ================================================================

-- ── Step 0: 清除舊表（若之前建立有誤請先執行此段）───────────────
DROP TABLE IF EXISTS rainfall_observations CASCADE;
DROP TABLE IF EXISTS weather_observations  CASCADE;

-- ── Step 1: 建立雨量觀測資料表 ──────────────────────────────────
CREATE TABLE rainfall_observations (
  id                BIGSERIAL         PRIMARY KEY,
  station_id        TEXT              NOT NULL,
  station_name      TEXT,
  county_name       TEXT,
  town_name         TEXT,
  latitude          DOUBLE PRECISION,
  longitude         DOUBLE PRECISION,
  altitude          DOUBLE PRECISION,
  obs_time          TIMESTAMPTZ       NOT NULL,
  now_precipitation DOUBLE PRECISION,
  past_10min        DOUBLE PRECISION,
  past_1hr          DOUBLE PRECISION,
  past_3hr          DOUBLE PRECISION,
  past_6hr          DOUBLE PRECISION,
  past_12hr         DOUBLE PRECISION,
  past_24hr         DOUBLE PRECISION,
  past_2days        DOUBLE PRECISION,
  past_3days        DOUBLE PRECISION,
  created_at        TIMESTAMPTZ       DEFAULT NOW(),
  CONSTRAINT rainfall_observations_station_id_obs_time_key
    UNIQUE (station_id, obs_time)
);

-- ── Step 2: 建立氣象觀測資料表 ──────────────────────────────────
CREATE TABLE weather_observations (
  id                BIGSERIAL         PRIMARY KEY,
  station_id        TEXT              NOT NULL,
  station_name      TEXT,
  county_name       TEXT,
  town_name         TEXT,
  latitude          DOUBLE PRECISION,
  longitude         DOUBLE PRECISION,
  altitude          DOUBLE PRECISION,
  obs_time          TIMESTAMPTZ       NOT NULL,
  weather           TEXT,
  precipitation     DOUBLE PRECISION,
  wind_direction    DOUBLE PRECISION,
  wind_speed        DOUBLE PRECISION,
  air_temperature   DOUBLE PRECISION,
  relative_humidity DOUBLE PRECISION,
  air_pressure      DOUBLE PRECISION,
  uv_index          DOUBLE PRECISION,
  peak_gust_speed   DOUBLE PRECISION,
  created_at        TIMESTAMPTZ       DEFAULT NOW(),
  CONSTRAINT weather_observations_station_id_obs_time_key
    UNIQUE (station_id, obs_time)
);

-- ── Step 3: 效能索引 ─────────────────────────────────────────────
CREATE INDEX idx_rainfall_obs_time ON rainfall_observations(obs_time DESC);
CREATE INDEX idx_rainfall_county   ON rainfall_observations(county_name);
CREATE INDEX idx_rainfall_town     ON rainfall_observations(town_name);
CREATE INDEX idx_weather_obs_time  ON weather_observations(obs_time DESC);
CREATE INDEX idx_weather_county    ON weather_observations(county_name);

-- ── Step 4: Row Level Security（允許匿名讀寫）────────────────────
ALTER TABLE rainfall_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_observations  ENABLE ROW LEVEL SECURITY;

CREATE POLICY anon_all ON rainfall_observations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY anon_all ON weather_observations  FOR ALL USING (true) WITH CHECK (true);
