# Schedule

這個版本會把課表存到 **Supabase**。同一個帳號在手機、平板、電腦登入後，會讀取同一份資料；若兩台裝置同時開啟，資料表變更也會透過 Realtime 重新載入。一個帳號底下可以建立多份課表，並在總覽頁切換、新增、複製、刪除。

## 1. 建立 Supabase 專案

1. 到 Supabase 建立一個 Project。
2. 打開 **SQL Editor**。
3. 把 `setup.sql` 全部貼上並執行。
4. 到專案的 **Settings → API Keys**（或 Connect 畫面）取得：
   - Project URL
   - Publishable key（格式通常是 `sb_publishable_...`）

> Publishable key 本來就可以放在瀏覽器端。真正的資料權限由 `setup.sql` 裡的 Row Level Security (RLS) 控制。不要把 secret/service_role key 放進 HTML。

### 已經在用舊版（單一課表）的人：升級到多課表版本

如果你的 Supabase 專案是舊版建的（只有 `schedule_events`，沒有 `schedules` 表），**不要**重新執行 `setup.sql`，改成：

1. 打開 Supabase 的 **SQL Editor**。
2. 把 `migration_multi_schedule.sql` 全部貼上並執行一次。

這段 SQL 會新增 `schedules` 表，並自動幫每個帳號建立一份叫「我的課表」的課表、把原本的事項全部歸進去，不會遺失資料。

## 2. 把 Supabase 資訊填進 index.html

用文字編輯器打開 `index.html`，搜尋：

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY = "YOUR_SUPABASE_PUBLISHABLE_KEY";
```

改成你的值，例如：

```js
const SUPABASE_URL = "https://abcxyz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_xxxxxxxxx";
```

儲存。

## 3. 測試

可以先直接用瀏覽器打開 `index.html`。

1. 註冊一個帳號。
2. 若 Supabase 專案有開啟 Email confirmation，先到信箱驗證。
3. 登入後，如果雲端還沒有任何事項，按 **「建立預設課表」**。
4. 新增、修改或刪除一個事項。
5. 用另一台裝置登入同一帳號，應該會看到相同內容。

## 4. 放到網路上

把 `index.html` 上傳到任何「靜態網站託管」即可，例如：

- GitHub Pages
- Cloudflare Pages
- Vercel
- Netlify

網站本身只是一個 HTML；資料會存到 Supabase，所以不同裝置會共用。

目前這個專案是用 **GitHub Pages** 部署，網址是：

**https://shankai1029.github.io/ShanKai-s-Schedule/**

推到 `main` 分支後，GitHub Pages 會自動重新部署，通常一兩分鐘內網址就會更新成最新版本。

## 目前功能

- Email + 密碼登入 / 註冊
- 每位帳號只能讀寫自己的課表
- 一個帳號可以建立多份課表，用總覽頁切換
- 總覽頁可以新增、複製、刪除課表，操作前都會跳出確認小視窗
- 會記住上次瀏覽的畫面（總覽頁或某份課表），下次登入自動回到那裡
- 新增 / 修改 / 刪除事項
- 開始與結束時間可精確到任意分鐘
- 14:20 會依比例放在 14:00–14:30 區間的約 2/3 位置
- Supabase 雲端同步
- Realtime 自動重新載入
- 匯入 / 匯出 JSON（範圍為目前開啟的課表）
- 列印
- 一鍵建立目前課表的預設內容

## 安全提醒

前端只應使用 **Publishable key**。不要把 Supabase 的 secret key 或 service_role key 寫進網頁。
