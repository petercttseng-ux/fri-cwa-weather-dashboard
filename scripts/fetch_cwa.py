"""
每小時從 CWA API 抓取氣象資料並寫入 Supabase
由 GitHub Actions 定期執行
"""

import os, json, sys, logging
from datetime import datetime, timezone
import requests
from supabase import create_client

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

CWA_KEY      = os.environ['CWA_API_KEY']
SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_KEY']

RAINFALL_API = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0002-001'
WEATHER_API  = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001'

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

def safe_float(v):
    try:
        f = float(v)
        return None if f == -99 else f
    except (TypeError, ValueError):
        return None

def fetch_json(url):
    r = requests.get(url, params={'Authorization': CWA_KEY, 'format': 'JSON', 'limit': 2000}, timeout=30)
    r.raise_for_status()
    return r.json()

def get_wgs84(coords):
    for c in (coords or []):
        if c.get('CoordinateName') == 'WGS84':
            return safe_float(c.get('StationLatitude')), safe_float(c.get('StationLongitude'))
    return None, None

def parse_rainfall(j):
    rows = []
    for s in j.get('records', {}).get('Station', []):
        geo = s.get('GeoInfo', {})
        re  = s.get('RainfallElement', {})
        lat, lon = get_wgs84(geo.get('Coordinates', []))
        rows.append({
            'station_id':        s.get('StationId'),
            'station_name':      s.get('StationName'),
            'county_name':       geo.get('CountyName'),
            'town_name':         geo.get('TownName'),
            'latitude':          lat,
            'longitude':         lon,
            'altitude':          safe_float(geo.get('StationAltitude')),
            'obs_time':          s.get('ObsTime', {}).get('DateTime'),
            'now_precipitation': safe_float(re.get('Now', {}).get('Precipitation')),
            'past_10min':        safe_float(re.get('Past10Min', {}).get('Precipitation')),
            'past_1hr':          safe_float(re.get('Past1hr', {}).get('Precipitation')),
            'past_3hr':          safe_float(re.get('Past3hr', {}).get('Precipitation')),
            'past_6hr':          safe_float(re.get('Past6Hr', {}).get('Precipitation')),
            'past_12hr':         safe_float(re.get('Past12hr', {}).get('Precipitation')),
            'past_24hr':         safe_float(re.get('Past24hr', {}).get('Precipitation')),
            'past_2days':        safe_float(re.get('Past2days', {}).get('Precipitation')),
            'past_3days':        safe_float(re.get('Past3days', {}).get('Precipitation')),
        })
    return [r for r in rows if r['obs_time']]

def parse_weather(j):
    rows = []
    for s in j.get('records', {}).get('Station', []):
        geo = s.get('GeoInfo', {})
        we  = s.get('WeatherElement', {})
        lat, lon = get_wgs84(geo.get('Coordinates', []))
        rows.append({
            'station_id':        s.get('StationId'),
            'station_name':      s.get('StationName'),
            'county_name':       geo.get('CountyName'),
            'town_name':         geo.get('TownName'),
            'latitude':          lat,
            'longitude':         lon,
            'altitude':          safe_float(geo.get('StationAltitude')),
            'obs_time':          s.get('ObsTime', {}).get('DateTime'),
            'weather':           we.get('Weather'),
            'precipitation':     safe_float(we.get('Now', {}).get('Precipitation') or we.get('Precipitation')),
            'wind_direction':    safe_float(we.get('WindDirection')),
            'wind_speed':        safe_float(we.get('WindSpeed')),
            'air_temperature':   safe_float(we.get('AirTemperature')),
            'relative_humidity': safe_float(we.get('RelativeHumidity')),
            'air_pressure':      safe_float(we.get('AirPressure')),
            'uv_index':          safe_float(we.get('UVIndex')),
            'peak_gust_speed':   safe_float(we.get('PeakGustSpeed')),
        })
    return [r for r in rows if r['obs_time']]

def upsert_chunks(table, rows, chunk=300):
    total = 0
    for i in range(0, len(rows), chunk):
        res = sb.table(table).upsert(rows[i:i+chunk], on_conflict='station_id,obs_time',
                                      ignore_duplicates=True).execute()
        total += len(rows[i:i+chunk])
        log.info(f'  {table}: inserted chunk {i//chunk+1}, cumulative {total}')
    return total

def main():
    run_time = datetime.now(timezone.utc).isoformat()
    log_data = {'run_time': run_time, 'status': 'ok', 'rainfall_rows': 0, 'weather_rows': 0, 'errors': []}

    try:
        log.info('Fetching CWA rainfall data…')
        rj = fetch_json(RAINFALL_API)
        rainfall_rows = parse_rainfall(rj)
        log.info(f'  Parsed {len(rainfall_rows)} rainfall stations')
        log_data['rainfall_rows'] = len(rainfall_rows)
        if rainfall_rows:
            upsert_chunks('rainfall_observations', rainfall_rows)
    except Exception as e:
        log.error(f'Rainfall error: {e}')
        log_data['errors'].append(f'rainfall: {e}')

    try:
        log.info('Fetching CWA weather data…')
        wj = fetch_json(WEATHER_API)
        weather_rows = parse_weather(wj)
        log.info(f'  Parsed {len(weather_rows)} weather stations')
        log_data['weather_rows'] = len(weather_rows)
        if weather_rows:
            upsert_chunks('weather_observations', weather_rows)
    except Exception as e:
        log.error(f'Weather error: {e}')
        log_data['errors'].append(f'weather: {e}')

    if log_data['errors']:
        log_data['status'] = 'partial_error'

    with open('fetch_log.json', 'w', encoding='utf-8') as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)

    log.info(f'Done. rainfall={log_data["rainfall_rows"]}, weather={log_data["weather_rows"]}, errors={log_data["errors"]}')
    sys.exit(1 if log_data['status'] == 'partial_error' and not log_data['rainfall_rows'] and not log_data['weather_rows'] else 0)

if __name__ == '__main__':
    main()
