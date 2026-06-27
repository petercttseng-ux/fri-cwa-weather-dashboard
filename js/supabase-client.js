/* ── Supabase Client 封裝 ── */
let _sb = null;

function getSupabase() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) return null;
  if (!_sb) _sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  return _sb;
}

function resetSupabase() { _sb = null; }

/* ---- 寫入雨量資料 ---- */
async function upsertRainfallRecords(rows) {
  const sb = getSupabase(); if (!sb) return { error: 'Supabase 未設定' };
  /* 分批寫入，每批 200 筆，避免 payload 過大 */
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from('rainfall_observations')
      .upsert(rows.slice(i, i + 200), {
        onConflict: 'station_id,obs_time',
        ignoreDuplicates: true,
      });
    if (error) return { error };
  }
  return { error: null };
}

/* ---- 寫入氣象資料 ---- */
async function upsertWeatherRecords(rows) {
  const sb = getSupabase(); if (!sb) return { error: 'Supabase 未設定' };
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from('weather_observations')
      .upsert(rows.slice(i, i + 200), {
        onConflict: 'station_id,obs_time',
        ignoreDuplicates: true,
      });
    if (error) return { error };
  }
  return { error: null };
}

/* ---- 查詢資料庫狀態 ---- */
async function fetchDbStats() {
  const sb = getSupabase();
  if (!sb) return null;

  const [r1, r2, r3, r4] = await Promise.all([
    sb.from('rainfall_observations').select('id', { count: 'exact', head: true }),
    sb.from('weather_observations').select('id', { count: 'exact', head: true }),
    sb.from('rainfall_observations').select('obs_time').order('obs_time', { ascending: true }).limit(1).single(),
    sb.from('rainfall_observations').select('obs_time').order('obs_time', { ascending: false }).limit(1).single(),
  ]);
  const [w1, w2] = await Promise.all([
    sb.from('weather_observations').select('obs_time').order('obs_time', { ascending: true }).limit(1).single(),
    sb.from('weather_observations').select('obs_time').order('obs_time', { ascending: false }).limit(1).single(),
  ]);

  return {
    rainfallCount: r1.count ?? 0,
    weatherCount:  r2.count ?? 0,
    rainfallStart: r3.data?.obs_time ?? null,
    rainfallEnd:   r4.data?.obs_time ?? null,
    weatherStart:  w1.data?.obs_time ?? null,
    weatherEnd:    w2.data?.obs_time ?? null,
  };
}

/* ---- 歷史區段查詢 ---- */
async function queryHistoryRange(table, start, end, onProgress) {
  const sb = getSupabase(); if (!sb) return { data: [], error: 'Supabase 未設定' };
  /* Supabase PostgREST 預設每頁上限 1000 筆，需分頁迴圈取回全部資料 */
  const PAGE = 1000;
  const MAX_ROWS = 100000; // 安全上限，避免瀏覽器記憶體耗盡
  let all = [], from = 0;
  while (all.length < MAX_ROWS) {
    const { data, error } = await sb.from(table)
      .select('*')
      .gte('obs_time', start)
      .lte('obs_time', end)
      .order('obs_time', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return { data: all, error };
    if (data && data.length > 0) all = all.concat(data);
    if (onProgress) onProgress(all.length);
    if (!data || data.length < PAGE) break; // 已到最後一頁
    from += PAGE;
  }
  return { data: all, error: null };
}

/* ---- 計算 DB 累積降雨（按縣市/鄉鎮聚合） ---- */
async function calcDbRainfallAgg(hoursAgo) {
  const sb = getSupabase(); if (!sb) return null;
  const since = new Date(Date.now() - hoursAgo * 3600_000).toISOString();
  const { data, error } = await sb.from('rainfall_observations')
    .select('station_id,station_name,county_name,town_name,past_1hr')
    .gte('obs_time', since);
  if (error) return null;
  return data;
}

/* ---- 自訂區段計算累積降雨 ---- */
async function calcDbRainfallByRange(start, end) {
  const sb = getSupabase(); if (!sb) return null;
  /* 與 queryHistoryRange 相同：分頁迴圈，每次取 1000 筆直到取完 */
  const PAGE = 1000;
  const MAX_ROWS = 500000; // 安全上限
  let all = [], from = 0;
  while (all.length < MAX_ROWS) {
    const { data, error } = await sb.from('rainfall_observations')
      .select('station_id,station_name,county_name,town_name,obs_time,past_1hr')
      .gte('obs_time', start)
      .lte('obs_time', end)
      .order('obs_time', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return null;
    if (data && data.length > 0) all = all.concat(data);
    if (!data || data.length < PAGE) break; // 已到最後一頁
    from += PAGE;
  }
  return all;
}

/* ---- 測試連線 ---- */
async function testSupabaseConn() {
  const sb = getSupabase(); if (!sb) return false;
  const { error } = await sb.from('rainfall_observations').select('id').limit(1);
  return !error;
}
