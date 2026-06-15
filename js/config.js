/* ── 預設設定，由 localStorage 覆蓋 ── */
const CONFIG = {
  CWA_API_KEY:     'CWA-4024AEE6-8945-4BAE-9AE2-3A5D649911CC',
  SUPABASE_URL:    '',
  SUPABASE_KEY:    '',
  UPDATE_INTERVAL: 60,   // minutes

  CWA_RAINFALL_API: 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0002-001',
  CWA_WEATHER_API:  'https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001',

  ALERT_24H: 250,
  ALERT_48H: 650,
  WARN_24H:  130,
  WARN_48H:  330,
};

/* load saved settings */
(function () {
  const saved = JSON.parse(localStorage.getItem('cwa_config') || '{}');
  Object.assign(CONFIG, saved);
})();

function saveConfig() {
  localStorage.setItem('cwa_config', JSON.stringify({
    CWA_API_KEY:     CONFIG.CWA_API_KEY,
    SUPABASE_URL:    CONFIG.SUPABASE_URL,
    SUPABASE_KEY:    CONFIG.SUPABASE_KEY,
    UPDATE_INTERVAL: CONFIG.UPDATE_INTERVAL,
  }));
}
