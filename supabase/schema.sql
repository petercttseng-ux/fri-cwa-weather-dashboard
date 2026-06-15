-- ================================================================
-- FRI 氣象儀表板 — Supabase 資料表初始化 SQL
-- 請於 Supabase Dashboard > SQL Editor 執行
-- ================================================================

-- 雨量觀測資料表
CREATE TABLE IF NOT EXISTS rainfall_observations (
  id               BIGSERIAL PRIMARY KEY,
  station_id       TEXT NOT NULL,
  station_name     TEXT,
  county_name      TEXT,
  town_name        TEXT,
  latitude         FLOAT,
  longitude        FLOAT,
  altitude         FLOAT,
  obs_time         TIMESTAMPTZ NOT NULL,
  now_precipitation FLOAT,
  past_10min       FLOAT,
  past_1hr         FLOAT,
  past_3hr         FLOAT,
  past_6hr         FLOAT,
  past_12hr        FLOAT,
  past_24hr        FLOAT,
  past_2days       FLOAT,
  past_3days       FLOAT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(station_id, obs_time)
);

-- 氣象觀測資料表
CREATE TABLE IF NOT EXISTS weather_observations (
  id               BIGSERIAL PRIMARY KEY,
  station_id       TEXT NOT NULL,
  station_name     TEXT,
  county_name      TEXT,
  town_name        TEXT,
  latitude         FLOAT,
  longitude        FLOAT,
  altitude         FLOAT,
  obs_time         TIMESTAMPTZ NOT NULL,
  weather          TEXT,
  precipitation    FLOAT,
  wind_direction   FLOAT,
  wind_speed       FLOAT,
  air_temperature  FLOAT,
  relative_humidity FLOAT,
  air_pressure     FLOAT,
  uv_index         FLOAT,
  peak_gust_speed  FLOAT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(station_id, obs_time)
);

-- 效能索引
CREATE INDEX IF NOT EXISTS idx_rainfall_obs_time  ON rainfall_observations(obs_time DESC);
CREATE INDEX IF NOT EXISTS idx_rainfall_county     ON rainfall_observations(county_name);
CREATE INDEX IF NOT EXISTS idx_rainfall_town       ON rainfall_observations(town_name);
CREATE INDEX IF NOT EXISTS idx_weather_obs_time    ON weather_observations(obs_time DESC);
CREATE INDEX IF NOT EXISTS idx_weather_county      ON weather_observations(county_name);

-- Row Level Security（允許匿名讀寫，供前端及 GitHub Actions 使用）
ALTER TABLE rainfall_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_observations  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all" ON rainfall_observations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON weather_observations  FOR ALL USING (true) WITH CHECK (true);
