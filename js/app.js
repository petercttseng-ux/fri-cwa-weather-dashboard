/* ================================================================
   FRI 氣象儀表板 — 主應用程式
   ================================================================ */

/* ---------- 全域狀態 ---------- */
const State = {
  weatherData:  [],
  rainfallData: [],
  weatherFiltered:  [],
  rainfallFiltered: [],
  weatherSort:  { col: 'AirTemperature', dir: 'desc' },
  rainfallSort: { col: 'past_24hr',      dir: 'desc' },
  weatherPage:  1,
  rainfallPage: 1,
  PAGE_SIZE: 50,
  autoTimer: null,
  uploadType: 'rainfall',
  uploadRows: [],
};

/* ---------- 工具函式 ---------- */
const fmtNum  = v => (v === null || v === undefined || v === '' || +v === -99 || isNaN(+v)) ? '—' : (+v).toFixed(1);
const fmtTime = s => s ? new Date(s).toLocaleString('zh-TW', { hour12: false }) : '—';
const clamp   = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function showToast(msg, type = 'info') {
  const el = document.getElementById('toastBody');
  if (!el) return;
  el.textContent = msg;
  const toast = new bootstrap.Toast(document.getElementById('appToast'), { delay: 3500 });
  toast.show();
}

/* ---------- 時鐘 ---------- */
function startClock() {
  function tick() {
    const el = document.getElementById('clock');
    if (el) el.textContent = new Date().toLocaleString('zh-TW', { hour12: false });
  }
  tick(); setInterval(tick, 1000);
}

/* ---------- 分頁導航 ---------- */
document.querySelectorAll('.nav-link-custom').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.nav-link-custom').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
    const tab = a.dataset.tab;
    document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    if (tab === 'history') refreshDbStatus();
    if (tab === 'rainfall') autoCalcRainfallIfApi();
  });
});

/* ================================================================
   CWA API 資料取得
   ================================================================ */
async function fetchCWAData() {
  updateBadge('更新中…', true);
  try {
    const key = CONFIG.CWA_API_KEY;
    const [wRes, rRes] = await Promise.all([
      fetch(`${CONFIG.CWA_WEATHER_API}?Authorization=${key}&format=JSON&limit=1000`),
      fetch(`${CONFIG.CWA_RAINFALL_API}?Authorization=${key}&format=JSON&limit=1000`),
    ]);
    if (!wRes.ok || !rRes.ok) throw new Error('API 回應錯誤');

    const [wJson, rJson] = await Promise.all([wRes.json(), rRes.json()]);
    parseWeatherData(wJson);
    parseRainfallData(rJson);

    /* 背景存入 Supabase */
    saveToSupabase();

    updateBadge(`最後更新：${new Date().toLocaleString('zh-TW', { hour12: false })}`, false);
  } catch (err) {
    console.error(err);
    updateBadge('更新失敗 — ' + err.message, false);
    showToast('CWA API 取得失敗：' + err.message, 'danger');
    /* 清除「載入中」狀態，避免 spinner 永久卡住 */
    if (!State.weatherData.length)  renderWeatherTable();
    if (!State.rainfallData.length) renderRainfallTable();
  }
}

function updateBadge(msg, spinning) {
  const el = document.getElementById('lastUpdateBadge');
  if (!el) return;
  el.innerHTML = `<i class="bi ${spinning ? 'bi-arrow-clockwise rotating' : 'bi-check-circle'}"></i> ${msg}`;
}

/* ---- 解析氣象資料 ---- */
function parseWeatherData(json) {
  if (!json?.records?.Station) { renderWeatherTable(); return; }
  State.weatherData = json.records.Station.map(s => {
    const geo = s.GeoInfo ?? {};
    const we  = s.WeatherElement ?? {};
    return {
      StationId:        s.StationId,
      StationName:      s.StationName,
      CountyName:       geo.CountyName ?? '',
      TownName:         geo.TownName ?? '',
      obs_time:         s.ObsTime?.DateTime ?? '',
      latitude:         +geo.Coordinates?.find(c => c.CoordinateName === 'WGS84')?.StationLatitude || 0,
      longitude:        +geo.Coordinates?.find(c => c.CoordinateName === 'WGS84')?.StationLongitude || 0,
      altitude:         +geo.StationAltitude || 0,
      Weather:          we.Weather ?? '',
      Precipitation:    parseFloat(we.Now?.Precipitation ?? we.Precipitation ?? -99),
      WindDirection:    parseFloat(we.WindDirection ?? -99),
      WindSpeed:        parseFloat(we.WindSpeed ?? -99),
      AirTemperature:   parseFloat(we.AirTemperature ?? -99),
      RelativeHumidity: parseFloat(we.RelativeHumidity ?? -99),
      AirPressure:      parseFloat(we.AirPressure ?? -99),
      UVIndex:          parseFloat(we.UVIndex ?? -99),
      PeakGustSpeed:    parseFloat(we.GustInfo?.PeakGustSpeed ?? we.PeakGustSpeed ?? -99),
    };
  });
  renderWeatherTable();
  updateStatCards();
}

/* ---- 解析雨量資料 ---- */
function parseRainfallData(json) {
  if (!json?.records?.Station) { renderRainfallTable(); return; }
  State.rainfallData = json.records.Station.map(s => {
    const geo = s.GeoInfo ?? {};
    const re  = s.RainfallElement ?? {};
    return {
      StationId:         s.StationId,
      StationName:       s.StationName,
      CountyName:        geo.CountyName ?? '',
      TownName:          geo.TownName ?? '',
      obs_time:          s.ObsTime?.DateTime ?? '',
      latitude:          +geo.Coordinates?.find(c => c.CoordinateName === 'WGS84')?.StationLatitude || 0,
      longitude:         +geo.Coordinates?.find(c => c.CoordinateName === 'WGS84')?.StationLongitude || 0,
      altitude:          +geo.StationAltitude || 0,
      now_precipitation: parseFloat(re.Now?.Precipitation ?? -99),
      past_10min:        parseFloat(re.Past10Min?.Precipitation ?? -99),
      past_1hr:          parseFloat(re.Past1hr?.Precipitation ?? -99),
      past_3hr:          parseFloat(re.Past3hr?.Precipitation ?? -99),
      past_6hr:          parseFloat(re.Past6Hr?.Precipitation ?? -99),
      past_12hr:         parseFloat(re.Past12hr?.Precipitation ?? -99),
      past_24hr:         parseFloat(re.Past24hr?.Precipitation ?? -99),
      past_2days:        parseFloat(re.Past2days?.Precipitation ?? -99),
      past_3days:        parseFloat(re.Past3days?.Precipitation ?? -99),
    };
  });
  renderRainfallTable();
  /* 若降雨統計頁使用即時API模式，自動更新排行 */
  autoCalcRainfallIfApi();
}

/* ================================================================
   Supabase 儲存
   ================================================================ */
async function saveToSupabase() {
  if (!CONFIG.SUPABASE_URL) return;

  const toNum = v => (isNaN(v) || v === -99) ? null : v;

  const rRows = State.rainfallData.map(r => ({
    station_id: r.StationId, station_name: r.StationName,
    county_name: r.CountyName, town_name: r.TownName,
    latitude: r.latitude, longitude: r.longitude, altitude: r.altitude,
    obs_time: r.obs_time,
    now_precipitation: toNum(r.now_precipitation),
    past_10min: toNum(r.past_10min), past_1hr: toNum(r.past_1hr),
    past_3hr: toNum(r.past_3hr), past_6hr: toNum(r.past_6hr),
    past_12hr: toNum(r.past_12hr), past_24hr: toNum(r.past_24hr),
    past_2days: toNum(r.past_2days), past_3days: toNum(r.past_3days),
  }));

  const wRows = State.weatherData.map(w => ({
    station_id: w.StationId, station_name: w.StationName,
    county_name: w.CountyName, town_name: w.TownName,
    latitude: w.latitude, longitude: w.longitude, altitude: w.altitude,
    obs_time: w.obs_time, weather: w.Weather,
    precipitation: toNum(w.Precipitation),
    wind_direction: toNum(w.WindDirection), wind_speed: toNum(w.WindSpeed),
    air_temperature: toNum(w.AirTemperature), relative_humidity: toNum(w.RelativeHumidity),
    air_pressure: toNum(w.AirPressure), uv_index: toNum(w.UVIndex),
    peak_gust_speed: toNum(w.PeakGustSpeed),
  }));

  const [r, w] = await Promise.all([
    upsertRainfallRecords(rRows),
    upsertWeatherRecords(wRows),
  ]);
  if (r.error) console.warn('雨量儲存錯誤:', r.error);
  if (w.error) console.warn('氣象儲存錯誤:', w.error);
}

/* ================================================================
   統計卡片
   ================================================================ */
function updateStatCards() {
  const valid = d => d !== -99 && !isNaN(d);

  const temps  = State.weatherData.filter(d => valid(d.AirTemperature));
  const winds  = State.weatherData.filter(d => valid(d.WindSpeed));
  const rain1h = State.rainfallData.filter(d => valid(d.past_1hr));
  const humid  = State.weatherData.filter(d => valid(d.RelativeHumidity));

  if (temps.length) {
    const top = temps.reduce((a, b) => b.AirTemperature > a.AirTemperature ? b : a);
    set('maxTemp', fmtNum(top.AirTemperature) + '°C');
    set('maxTempSta', `${top.StationName}（${top.CountyName}）`);
  }
  if (winds.length) {
    const top = winds.reduce((a, b) => b.WindSpeed > a.WindSpeed ? b : a);
    set('maxWind', fmtNum(top.WindSpeed) + ' m/s');
    set('maxWindSta', `${top.StationName}（${top.CountyName}）`);
  }
  if (rain1h.length) {
    const top = rain1h.reduce((a, b) => b.past_1hr > a.past_1hr ? b : a);
    set('maxRain1h', fmtNum(top.past_1hr) + ' mm');
    set('maxRain1hSta', `${top.StationName}（${top.CountyName}）`);
  }
  if (humid.length) {
    const top = humid.reduce((a, b) => b.RelativeHumidity > a.RelativeHumidity ? b : a);
    set('maxHumid', fmtNum(top.RelativeHumidity) + '%');
    set('maxHumidSta', `${top.StationName}（${top.CountyName}）`);
  }
  set('stationCount', State.weatherData.length + State.rainfallData.length);
}

function set(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

/* ================================================================
   氣象資料表
   ================================================================ */
function renderWeatherTable() {
  const search = document.getElementById('weatherSearch')?.value?.toLowerCase() ?? '';
  State.weatherFiltered = State.weatherData.filter(d =>
    !search || [d.StationName, d.CountyName, d.TownName].some(x => x.toLowerCase().includes(search))
  );
  sortArray(State.weatherFiltered, State.weatherSort.col, State.weatherSort.dir);
  renderPagedTable('weatherBody', 'weatherPagination', State.weatherFiltered, State.weatherPage,
    renderWeatherRow, renderWeatherTable);
}

function renderWeatherRow(d) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${d.StationName}</td>
    <td>${d.CountyName}</td>
    <td>${d.TownName}</td>
    <td>${fmtTime(d.obs_time)}</td>
    <td>${fmtNum(d.AirTemperature)}</td>
    <td>${fmtNum(d.RelativeHumidity)}</td>
    <td>${fmtNum(d.Precipitation)}</td>
    <td>${fmtNum(d.WindSpeed)}</td>
    <td>${fmtNum(d.WindDirection)}</td>
    <td>${fmtNum(d.AirPressure)}</td>
    <td>${d.Weather || '—'}</td>`;
  return tr;
}

/* ================================================================
   雨量資料表
   ================================================================ */
function renderRainfallTable() {
  const search = document.getElementById('rainfallSearch')?.value?.toLowerCase() ?? '';
  State.rainfallFiltered = State.rainfallData.filter(d =>
    !search || [d.StationName, d.CountyName, d.TownName].some(x => x.toLowerCase().includes(search))
  );
  sortArray(State.rainfallFiltered, State.rainfallSort.col, State.rainfallSort.dir);
  renderPagedTable('rainfallBody', 'rainfallPagination', State.rainfallFiltered, State.rainfallPage,
    renderRainfallRow, renderRainfallTable);
}

function renderRainfallRow(d) {
  const tr = document.createElement('tr');
  const hi = v => v >= 50 ? ' class="text-danger fw-bold"' : v >= 20 ? ' class="text-warning"' : '';
  tr.innerHTML = `
    <td>${d.StationName}</td>
    <td>${d.CountyName}</td>
    <td>${d.TownName}</td>
    <td>${fmtTime(d.obs_time)}</td>
    <td>${fmtNum(d.now_precipitation)}</td>
    <td>${fmtNum(d.past_10min)}</td>
    <td${hi(d.past_1hr)}>${fmtNum(d.past_1hr)}</td>
    <td>${fmtNum(d.past_3hr)}</td>
    <td>${fmtNum(d.past_6hr)}</td>
    <td>${fmtNum(d.past_12hr)}</td>
    <td${hi(d.past_24hr)}>${fmtNum(d.past_24hr)}</td>
    <td${hi(d.past_2days)}>${fmtNum(d.past_2days)}</td>`;
  return tr;
}

/* ================================================================
   通用分頁渲染
   ================================================================ */
function renderPagedTable(bodyId, paginId, rows, page, rowFn, onPageChange) {
  const body  = document.getElementById(bodyId);
  const pagin = document.getElementById(paginId);
  if (!body) return;

  const total = rows.length;
  const pages = Math.ceil(total / State.PAGE_SIZE) || 1;
  const cur   = clamp(page, 1, pages);
  const slice = rows.slice((cur - 1) * State.PAGE_SIZE, cur * State.PAGE_SIZE);

  body.innerHTML = '';
  if (!slice.length) {
    body.innerHTML = '<tr><td colspan="20" class="loading-row">無資料</td></tr>';
  } else {
    slice.forEach(d => body.appendChild(rowFn(d)));
  }

  if (!pagin) return;
  pagin.innerHTML = `<span class="text-muted small me-2">共 ${total} 筆 / 第 ${cur}/${pages} 頁</span>`;
  const mkBtn = (label, p, disabled = false) => {
    const b = document.createElement('button');
    b.textContent = label; b.disabled = disabled;
    if (p === cur) b.classList.add('active');
    b.addEventListener('click', () => { if (bodyId === 'weatherBody') State.weatherPage = p; else State.rainfallPage = p; onPageChange(); });
    return b;
  };
  pagin.appendChild(mkBtn('«', 1, cur === 1));
  pagin.appendChild(mkBtn('‹', cur - 1, cur === 1));
  const lo = Math.max(1, cur - 2), hi = Math.min(pages, cur + 2);
  for (let p = lo; p <= hi; p++) pagin.appendChild(mkBtn(p, p));
  pagin.appendChild(mkBtn('›', cur + 1, cur === pages));
  pagin.appendChild(mkBtn('»', pages, cur === pages));
}

/* ================================================================
   排序工具
   ================================================================ */
function sortArray(arr, col, dir) {
  arr.sort((a, b) => {
    let av = a[col] ?? '', bv = b[col] ?? '';
    if (!isNaN(+av) && !isNaN(+bv)) { av = +av; bv = +bv; }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

function initSortHeaders(tableId, stateKey, renderFn) {
  const table = document.getElementById(tableId);
  if (!table) return;
  table.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (stateKey.col === col) stateKey.dir = stateKey.dir === 'asc' ? 'desc' : 'asc';
      else { stateKey.col = col; stateKey.dir = 'desc'; }
      table.querySelectorAll('th').forEach(t => t.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(stateKey.dir === 'asc' ? 'sort-asc' : 'sort-desc');
      renderFn();
    });
  });
}

/* ================================================================
   累積降雨量計算
   ================================================================ */
async function calcAccumRainfall() {
  const src = document.querySelector('input[name="dataSource"]:checked')?.value ?? 'api';
  let rows = [];

  if (src === 'api') {
    /* 用 API 取得的即時資料（past_24hr / past_2days） */
    rows = State.rainfallData.map(d => ({
      station_id: d.StationId, station_name: d.StationName,
      county_name: d.CountyName, town_name: d.TownName,
      accum24: d.past_24hr >= 0 ? d.past_24hr : 0,
      accum48: d.past_2days >= 0 ? d.past_2days : 0,
    }));
  } else {
    /* 從 Supabase 歷史資料計算 */
    const start = document.getElementById('startTime')?.value;
    const end   = document.getElementById('endTime')?.value;
    if (!start || !end) { showToast('請選擇起始及結束時間', 'warning'); return; }

    showToast('正在從資料庫計算累積降雨…');
    const data = await calcDbRainfallByRange(new Date(start).toISOString(), new Date(end).toISOString());
    if (!data) { showToast('資料庫查詢失敗或未設定 Supabase', 'danger'); return; }

    /* 逐站加總 past_1hr */
    const byStation = {};
    data.forEach(r => {
      if (!byStation[r.station_id]) {
        byStation[r.station_id] = {
          station_id: r.station_id, station_name: r.station_name,
          county_name: r.county_name, town_name: r.town_name, sum: 0, n: 0,
        };
      }
      if (r.past_1hr !== null) { byStation[r.station_id].sum += +r.past_1hr; byStation[r.station_id].n++; }
    });
    const hrs = (new Date(end) - new Date(start)) / 3600_000;
    rows = Object.values(byStation).map(s => ({
      station_id: s.station_id, station_name: s.station_name,
      county_name: s.county_name, town_name: s.town_name,
      accum24: hrs <= 24 ? s.sum : s.sum * (24 / Math.max(hrs, 1)),
      accum48: hrs <= 48 ? s.sum : s.sum * (48 / Math.max(hrs, 1)),
    }));
  }

  renderRainfallRanking(rows);
}

function aggByKey(rows, keyFn, v24Fn, v48Fn, nameFields) {
  const map = {};
  rows.forEach(r => {
    const key = keyFn(r);
    if (!map[key]) map[key] = { key, ...Object.fromEntries(nameFields.map(f => [f, r[f]])), max24: 0, max48: 0, sta: '' };
    const v24 = v24Fn(r), v48 = v48Fn(r);
    if (v24 > map[key].max24) { map[key].max24 = v24; map[key].sta = r.station_name; }
    if (v48 > map[key].max48) map[key].max48 = v48;
  });
  return Object.values(map);
}

function renderRainfallRanking(rows) {
  /* 縣市聚合 */
  const byCounty = aggByKey(rows, r => r.county_name, r => r.accum24, r => r.accum48, ['county_name']);
  byCounty.sort((a, b) => b.max24 - a.max24);
  fillRankTable('county24Body', byCounty, 'county_name', 'max24', CONFIG.ALERT_24H, CONFIG.WARN_24H, 'mm');

  const byCounty48 = [...byCounty].sort((a, b) => b.max48 - a.max48);
  fillRankTable('county48Body', byCounty48, 'county_name', 'max48', CONFIG.ALERT_48H, CONFIG.WARN_48H, 'mm');

  /* 鄉鎮聚合 */
  const byTown = aggByKey(rows, r => `${r.county_name}_${r.town_name}`, r => r.accum24, r => r.accum48, ['county_name', 'town_name']);
  byTown.sort((a, b) => b.max24 - a.max24);
  fillRankTableTown('town24Body', byTown, 'max24', CONFIG.ALERT_24H, CONFIG.WARN_24H);

  const byTown48 = [...byTown].sort((a, b) => b.max48 - a.max48);
  fillRankTableTown('town48Body', byTown48, 'max48', CONFIG.ALERT_48H, CONFIG.WARN_48H);
}

function fillRankTable(tbodyId, arr, nameCol, valCol, alertThr, warnThr) {
  const body = document.getElementById(tbodyId);
  if (!body) return;
  body.innerHTML = '';
  arr.forEach((r, i) => {
    const v = r[valCol];
    const tr = document.createElement('tr');
    const isAlert = v >= alertThr, isWarn = v >= warnThr && !isAlert;
    if (isAlert) tr.classList.add('alert-red');
    else if (isWarn) tr.classList.add('alert-orange');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${r[nameCol]}</td>
      <td>${fmtNum(v)}</td>
      <td>${r.sta || '—'}</td>
      <td>${isAlert ? '<span class="status-badge"><i class="bi bi-exclamation-triangle-fill"></i> 紅色警戒</span>'
         : isWarn  ? '<span class="status-badge"><i class="bi bi-exclamation-circle-fill"></i> 橙色注意</span>'
         : '<span class="status-badge">正常</span>'}</td>`;
    body.appendChild(tr);
  });
}

function fillRankTableTown(tbodyId, arr, valCol, alertThr, warnThr) {
  const body = document.getElementById(tbodyId);
  if (!body) return;
  body.innerHTML = '';
  arr.forEach((r, i) => {
    const v = r[valCol];
    const tr = document.createElement('tr');
    const isAlert = v >= alertThr, isWarn = v >= warnThr && !isAlert;
    if (isAlert) tr.classList.add('alert-red');
    else if (isWarn) tr.classList.add('alert-orange');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${r.county_name}</td>
      <td>${r.town_name}</td>
      <td>${fmtNum(v)}</td>
      <td>${r.sta || '—'}</td>
      <td>${isAlert ? '<span class="status-badge"><i class="bi bi-exclamation-triangle-fill"></i> 紅色警戒</span>'
         : isWarn  ? '<span class="status-badge"><i class="bi bi-exclamation-circle-fill"></i> 橙色注意</span>'
         : '<span class="status-badge">正常</span>'}</td>`;
    body.appendChild(tr);
  });
}

/* ================================================================
   資料庫狀態
   ================================================================ */
async function refreshDbStatus() {
  const stats = await fetchDbStats();
  if (!stats) {
    showToast('Supabase 尚未設定或連線失敗', 'warning'); return;
  }
  set('dbRainfallCount', stats.rainfallCount.toLocaleString() + ' 筆');
  set('dbWeatherCount',  stats.weatherCount.toLocaleString()  + ' 筆');
  set('dbRainfallStart', stats.rainfallStart ? fmtTime(stats.rainfallStart) : '無資料');
  set('dbRainfallEnd',   stats.rainfallEnd   ? fmtTime(stats.rainfallEnd)   : '無資料');
  set('dbWeatherStart',  stats.weatherStart  ? fmtTime(stats.weatherStart)  : '無資料');
  set('dbWeatherEnd',    stats.weatherEnd    ? fmtTime(stats.weatherEnd)    : '無資料');
}

/* ================================================================
   CSV 匯出
   ================================================================ */
function exportCSV(data, filename) {
  if (!data.length) { showToast('無資料可匯出'); return; }
  const keys = Object.keys(data[0]);
  const csv  = [keys.join(','), ...data.map(r => keys.map(k => `"${r[k] ?? ''}"`).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ================================================================
   歷史資料上傳
   ================================================================ */
function initUpload() {
  const dropZone  = document.getElementById('dropZone');
  const fileInput = document.getElementById('uploadFile');
  const browseBtn = document.getElementById('browseFile');

  browseBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', e => handleFile(e.target.files[0]));

  dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone?.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0]);
  });

  document.querySelectorAll('[data-upload]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-upload]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.uploadType = btn.dataset.upload;
    });
  });

  document.getElementById('submitUpload')?.addEventListener('click', doUpload);
  document.getElementById('cancelUpload')?.addEventListener('click', () => {
    document.getElementById('uploadPreview').style.display = 'none';
    document.getElementById('dropZone').style.display = '';
    State.uploadRows = [];
  });
}

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    const rows = parseCSV(text);
    State.uploadRows = rows;
    set('uploadFileName', file.name);
    set('uploadRowCount', rows.length);
    document.getElementById('uploadPreview').style.display = '';
    document.getElementById('dropZone').style.display = 'none';
  };
  reader.readAsText(file, 'UTF-8');
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
  });
}

async function doUpload() {
  if (!State.uploadRows.length) return;
  const table = State.uploadType === 'rainfall' ? 'rainfall_observations' : 'weather_observations';
  const sb = getSupabase();
  if (!sb) { showToast('請先設定 Supabase 連線資訊', 'warning'); return; }

  document.getElementById('uploadProgress').style.display = '';
  document.getElementById('submitUpload').disabled = true;

  const CHUNK = 200;
  for (let i = 0; i < State.uploadRows.length; i += CHUNK) {
    const chunk = State.uploadRows.slice(i, i + CHUNK);
    await sb.from(table).upsert(chunk, { onConflict: 'station_id,obs_time', ignoreDuplicates: true });
    const pct = Math.round((i + CHUNK) / State.uploadRows.length * 100);
    document.getElementById('uploadProgressBar').style.width = Math.min(pct, 100) + '%';
    set('uploadProgressText', `已上傳 ${Math.min(i + CHUNK, State.uploadRows.length)} / ${State.uploadRows.length} 筆`);
  }

  showToast(`已成功上傳 ${State.uploadRows.length} 筆資料至 Supabase`);
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('uploadPreview').style.display = 'none';
  document.getElementById('dropZone').style.display = '';
  document.getElementById('submitUpload').disabled = false;
  State.uploadRows = [];
  refreshDbStatus();
}

/* ================================================================
   歷史查詢
   ================================================================ */
async function queryHistory() {
  const type  = document.getElementById('historyType')?.value;
  const start = document.getElementById('histStart')?.value;
  const end   = document.getElementById('histEnd')?.value;
  const table = type === 'rainfall' ? 'rainfall_observations' : 'weather_observations';
  const result = document.getElementById('historyResult');
  if (!result) return;

  if (!start || !end) { showToast('請選擇起始及結束時間', 'warning'); return; }
  if (new Date(start) >= new Date(end)) { showToast('結束時間必須晚於起始時間', 'warning'); return; }

  result.innerHTML = '<div class="d-flex align-items-center gap-2"><div class="spinner"></div><span id="histProgressText">查詢中…</span></div>';

  const { data, error } = await queryHistoryRange(
    table,
    new Date(start).toISOString(),
    new Date(end).toISOString(),
    count => { const el = document.getElementById('histProgressText'); if (el) el.textContent = `查詢中… 已取得 ${count.toLocaleString()} 筆`; }
  );
  if (error) { result.innerHTML = `<div class="alert alert-danger">${error}</div>`; return; }

  result.innerHTML = `<div class="alert alert-info">共查得 <strong>${data.length.toLocaleString()}</strong> 筆資料</div>
    <button class="btn btn-sm btn-outline-success" id="exportHistBtn"><i class="bi bi-download"></i> 匯出CSV</button>`;
  document.getElementById('exportHistBtn')?.addEventListener('click', () => exportCSV(data, `history_${type}_${start}.csv`));
}

/* ================================================================
   設定頁面
   ================================================================ */
function initSettings() {
  /* 載入儲存值 */
  const apiEl = document.getElementById('cwaApiKey');
  const urlEl = document.getElementById('supabaseUrl');
  const keyEl = document.getElementById('supabaseKey');
  const intEl = document.getElementById('updateInterval');
  if (apiEl) apiEl.value = CONFIG.CWA_API_KEY;
  if (urlEl) urlEl.value = CONFIG.SUPABASE_URL;
  if (keyEl) keyEl.value = CONFIG.SUPABASE_KEY;
  if (intEl) intEl.value = CONFIG.UPDATE_INTERVAL;

  /* 儲存 CWA */
  document.getElementById('saveCwaSettings')?.addEventListener('click', () => {
    CONFIG.CWA_API_KEY     = apiEl?.value.trim() ?? CONFIG.CWA_API_KEY;
    CONFIG.UPDATE_INTERVAL = +(intEl?.value ?? 60);
    saveConfig();
    setupAutoRefresh();
    showToast('CWA 設定已儲存');
  });

  /* 測試 CWA */
  document.getElementById('testCwaApi')?.addEventListener('click', async () => {
    const res = document.getElementById('cwaTestResult');
    res.innerHTML = '<div class="spinner d-inline-block me-2"></div>測試中…';
    try {
      const r = await fetch(`${CONFIG.CWA_WEATHER_API}?Authorization=${apiEl?.value.trim()}&format=JSON&limit=1`);
      const j = await r.json();
      res.innerHTML = j.success === 'true'
        ? '<span class="text-success"><i class="bi bi-check-circle-fill"></i> 連線成功</span>'
        : '<span class="text-danger"><i class="bi bi-x-circle-fill"></i> API 回應錯誤</span>';
    } catch (e) {
      res.innerHTML = `<span class="text-danger"><i class="bi bi-x-circle-fill"></i> ${e.message}</span>`;
    }
  });

  /* 儲存 Supabase */
  document.getElementById('saveSupabaseSettings')?.addEventListener('click', () => {
    CONFIG.SUPABASE_URL = urlEl?.value.trim() ?? '';
    CONFIG.SUPABASE_KEY = keyEl?.value.trim() ?? '';
    resetSupabase();
    saveConfig();
    showToast('Supabase 設定已儲存');
  });

  /* 測試 Supabase */
  document.getElementById('testSupabase')?.addEventListener('click', async () => {
    CONFIG.SUPABASE_URL = urlEl?.value.trim() ?? '';
    CONFIG.SUPABASE_KEY = keyEl?.value.trim() ?? '';
    resetSupabase();
    const res = document.getElementById('sbTestResult');
    res.innerHTML = '<div class="spinner d-inline-block me-2"></div>測試中…';
    const ok = await testSupabaseConn();
    res.innerHTML = ok
      ? '<span class="text-success"><i class="bi bi-check-circle-fill"></i> 連線成功</span>'
      : '<span class="text-danger"><i class="bi bi-x-circle-fill"></i> 連線失敗，請確認 URL/Key 及資料表是否建立</span>';
  });

  /* 初始化資料表（複製 SQL） */
  document.getElementById('initSchema')?.addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('schemaSQL').textContent)
      .then(() => showToast('SQL 已複製，請至 Supabase SQL Editor 貼上執行'));
  });
  document.getElementById('copySchemaSql')?.addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('schemaSQL').textContent)
      .then(() => showToast('SQL 已複製至剪貼簿'));
  });

  /* API Key 顯示/隱藏 */
  document.getElementById('toggleApiKey')?.addEventListener('click', () => {
    const inp = document.getElementById('cwaApiKey');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('toggleSbKey')?.addEventListener('click', () => {
    const inp = document.getElementById('supabaseKey');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });
}

/* ================================================================
   自動計算（即時API模式）
   ================================================================ */
/**
 * 若降雨統計頁目前選取「即時API」模式，且已有雨量資料，
 * 則自動執行累積降雨量排行計算。
 * 在以下三個時機呼叫：
 *   1. 切換到「降雨統計」tab
 *   2. parseRainfallData() 取得新資料後
 *   3. 使用者將 radio 切回「即時API」
 */
function autoCalcRainfallIfApi() {
  const src = document.querySelector('input[name="dataSource"]:checked')?.value ?? 'api';
  if (src !== 'api') return;
  if (!State.rainfallData.length) {
    /* 資料尚未到位，顯示等待提示 */
    const colspanMap = { county24Body: 5, county48Body: 5, town24Body: 6, town48Body: 6 };
    ['county24Body', 'county48Body', 'town24Body', 'town48Body'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.textContent.trim().startsWith('請點擊')) {
        el.innerHTML = `<tr><td colspan="${colspanMap[id]}" class="loading-row"><div class="spinner d-inline-block me-2"></div>等待 API 資料載入…</td></tr>`;
      }
    });
    return;
  }
  calcAccumRainfall();
}

/* ================================================================
   資料來源切換（降雨統計頁）
   ================================================================ */
function initRainfallTab() {
  document.querySelectorAll('input[name="dataSource"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isDb = radio.value === 'db';
      document.getElementById('dbRangeGroup').style.display  = isDb ? '' : 'none';
      document.getElementById('dbRangeGroup2').style.display = isDb ? '' : 'none';
      /* 切回即時API時自動顯示最新資料 */
      if (!isDb) autoCalcRainfallIfApi();
    });
  });
  document.getElementById('calcRainfall')?.addEventListener('click', calcAccumRainfall);
}

/* ================================================================
   自動更新
   ================================================================ */
function setupAutoRefresh() {
  if (State.autoTimer) clearInterval(State.autoTimer);
  const mins = +CONFIG.UPDATE_INTERVAL;
  if (mins > 0) State.autoTimer = setInterval(fetchCWAData, mins * 60_000);
}

/* ================================================================
   初始化
   ================================================================ */
function init() {
  startClock();
  initSortHeaders('weatherTable',  State.weatherSort,  renderWeatherTable);
  initSortHeaders('rainfallTable', State.rainfallSort, renderRainfallTable);
  initSettings();
  initRainfallTab();
  initUpload();

  /* 搜尋 */
  document.getElementById('weatherSearch')?.addEventListener('input', () => { State.weatherPage = 1; renderWeatherTable(); });
  document.getElementById('rainfallSearch')?.addEventListener('input', () => { State.rainfallPage = 1; renderRainfallTable(); });

  /* 刷新 */
  document.getElementById('refreshWeather')?.addEventListener('click', fetchCWAData);
  document.getElementById('refreshRainfall')?.addEventListener('click', fetchCWAData);

  /* 匯出 */
  document.getElementById('exportWeatherCSV')?.addEventListener('click', () => exportCSV(State.weatherFiltered, 'weather_data.csv'));
  document.getElementById('exportRainfallCSV')?.addEventListener('click', () => exportCSV(State.rainfallFiltered, 'rainfall_data.csv'));

  /* 歷史查詢 */
  document.getElementById('queryHistory')?.addEventListener('click', queryHistory);
  document.getElementById('refreshDbStatus')?.addEventListener('click', refreshDbStatus);

  /* 自動更新排程 */
  setupAutoRefresh();

  /* 初始載入資料 */
  fetchCWAData();
}

document.addEventListener('DOMContentLoaded', init);
