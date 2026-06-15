# 農業部水產試驗所 — 氣象觀測即時儀表板

## 功能特色

- **即時氣象資料**：每小時自動從中央氣象署 API 取得全台測站資料
- **雨量累積統計**：24/48小時縣市與鄉鎮別累積降雨排名，超標自動紅色警戒
- **Supabase 歷史資料庫**：GitHub Actions 定時儲存，支援自訂時間區段查詢
- **歷史資料上傳**：支援 CSV 格式批次上傳歷史氣象資料
- **多欄位排序**：所有資料表均支援點擊欄位標題排序

## 快速部署

### 1. 設定 Supabase

1. 前往 [supabase.com](https://supabase.com) 建立免費專案
2. 在 **SQL Editor** 執行 `supabase/schema.sql`
3. 複製 **Project URL** 和 **anon public key**

### 2. 設定 GitHub Secrets

在 GitHub Repository > Settings > Secrets and variables > Actions 新增：

| Secret 名稱    | 說明                              |
|----------------|-----------------------------------|
| `CWA_API_KEY`  | 中央氣象署 API 授權碼              |
| `SUPABASE_URL` | Supabase Project URL               |
| `SUPABASE_KEY` | Supabase anon key                  |

### 3. 啟用 GitHub Pages

在 Repository > Settings > Pages，Source 選擇 `main` 分支的根目錄，儲存後即可取得網址。

### 4. 前端設定 Supabase

開啟網頁後，前往「系統設定」頁面，填入 Supabase URL 及 Key 並儲存。

## 資料表結構

見 `supabase/schema.sql`

## 警戒閾值

| 類型      | 警戒值    |
|-----------|-----------|
| 24小時降雨 | 250 mm   |
| 48小時降雨 | 650 mm   |
| 24小時注意 | 130 mm   |
| 48小時注意 | 330 mm   |

## 技術架構

- **前端**：HTML5 + Bootstrap 5 + Vanilla JS（無需建置工具）
- **資料庫**：Supabase（PostgreSQL）
- **自動化**：GitHub Actions（每小時 cron）
- **部署**：GitHub Pages

## 資料來源

- 雨量觀測站：`O-A0002-001`
- 全測站逐時氣象：`O-A0001-001`
- 授權：[中央氣象署開放資料平台](https://opendata.cwa.gov.tw/)
