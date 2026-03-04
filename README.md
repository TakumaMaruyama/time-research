# 標準記録検索アプリ

Next.js (App Router) + TypeScript + Tailwind + Drizzle + PostgreSQL で作成した、
全国レベル / 九州レベル / 県レベル（鹿児島）の標準記録検索アプリです。
トップページには「頑張ろう」ボタンがあり、利用者ごとに1日1回まで押せて、全体累計を表示します。

## 技術スタック

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- PostgreSQL
- Drizzle ORM + drizzle-kit
- zod

## 必要な環境変数

`.env` を作成して以下を設定してください。

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
ADMIN_PASSWORD=your_admin_password
```

## セットアップ

```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

## 主要ページ

- `/` 検索フォーム
- `/result` 検索結果表示
- `/admin/import` 管理画面（JSONプレビュー/登録 + 取込済み記録の閲覧・編集）

## API

- `POST /api/search`
- `GET /api/cheer`
- `POST /api/cheer`
- `POST /api/admin/login`
- `GET /api/admin/session`
- `POST /api/admin/preview`
- `POST /api/admin/import`
- `GET /api/admin/records`
- `GET /api/admin/records/:meetId`
- `POST /api/admin/records/:meetId`
- `PATCH /api/admin/records/:meetId/:recordId`
- `DELETE /api/admin/records/:meetId/:recordId`

### 管理APIリクエスト（preview/import）

```json
{
  "level": "national",
  "season": 2026,
  "course": "SCM",
  "meetName": "2026 県春季記録会",
  "meetDate": "2026-05-03",
  "meetDateEnd": "2026-05-05",
  "meetMetadata": { "category": "県予選" },
  "jsonText": "{ ... }"
}
```

- `course` は `SCM` / `LCM` / `ANY`（短水路・長水路共通）
- `ANY` は「短水路・長水路のどちらかの記録で標準記録を突破していれば可」を意味します。
- `meetDate` は任意（`YYYY-MM-DD`）
- `meetDateEnd` は任意（`YYYY-MM-DD`、`meetDate` と同日またはそれ以降）

### 検索APIレスポンス（抜粋）

```json
{
  "targetAges": [11, 12, 13],
  "season": 2026,
  "course": "SCM",
  "gender": "M",
  "results": {
    "national": [
      {
        "meet_id": "uuid",
        "meet_name": "全国大会A",
        "meet_date": "2026-05-03",
        "meet_date_end": "2026-05-05",
        "meet_metadata": { "category": "本戦" },
        "items": [{ "event_code": "FR_50", "time": "00:29.80" }]
      }
    ],
    "kyushu": [],
    "kagoshima": []
  }
}
```

## 管理画面の入力JSON形式

```json
{
  "source": {
    "title": "string",
    "url": "string | null",
    "pages": [1, 2, 3]
  },
  "rows": [
    {
      "gender": "M",
      "age_min": 11,
      "age_max": 12,
      "event_code": "FR_50",
      "time": "29.80"
    }
  ]
}
```

- `event_code` は `/^((FR|BK|BR|FL|IM)_\d{2,4}|(FRR|MRR)_\dX\d{2,4})$/`
- `time` は `59.87`, `1:02.34`, `00:29.80`, `10:12.34` を許容
- 壊れた行はエラーとして除外

## DB構成（概要）

- `meets`:
  - `level, season, course, name` で一意
  - `metadata_json` に任意情報を保存
- `standards`:
  - `meet_id` に紐づく大会単位データ
  - 一意キーは `(meet_id, gender, age_min, age_max, event_code)`

## サンプルJSON

```json
{
  "source": {"title":"sample","url":null,"pages":null},
  "rows":[
    {"gender":"M","age_min":11,"age_max":12,"event_code":"FR_50","time":"29.80"},
    {"gender":"M","age_min":11,"age_max":12,"event_code":"FR_100","time":"1:05.20"},
    {"gender":"F","age_min":13,"age_max":14,"event_code":"IM_200","time":"2:28.50"},
    {"gender":"M","age_min":13,"age_max":14,"event_code":"FRR_4X100","time":"4:12.34"}
  ]
}
```

## Replit Deploy

1. Replit Secrets に `DATABASE_URL` と `ADMIN_PASSWORD` を設定
2. 初回のみ `npm run db:setup` を実行（2回目以降は不要）
3. Deploy 設定の Build command は `npm run build`、Start command は `npm run start` にしてデプロイ
