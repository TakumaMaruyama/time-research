"use client";

import { useEffect, useMemo, useState } from "react";

import { AdminRecordsEditor } from "@/components/admin-records-editor";
import { COURSE_LABELS } from "@/lib/course-label";
import { parseIsoDateOnly } from "@/lib/date";
import { COURSES, STANDARD_LEVELS, type Course, type StandardLevel } from "@/lib/domain";

const ADMIN_TOKEN_STORAGE_KEY = "admin_auth_token";
const ADMIN_TOKEN_HEADER = "x-admin-token";
const ADMIN_IMPORT_FORM_STORAGE_KEY = "admin_import_form_v1";

type PreviewResponse = {
  meet: {
    id: string | null;
    level: StandardLevel;
    season: number;
    course: Course;
    name: string;
    meet_date: string | null;
    meet_date_end: string | null;
    metadata: Record<string, unknown> | null;
    exists: boolean;
  };
  source: {
    title: string;
    url: string | null;
    pages: number[] | null;
  } | null;
  normalizedRows: Array<{
    rowIndex: number;
    gender: "M" | "F";
    age_min: number;
    age_max: number;
    event_code: string;
    time: string;
    time_ms: number;
    status: "add" | "update" | "skip";
  }>;
  errors: Array<{ rowIndex: number | null; message: string }>;
  counts: {
    total: number;
    add: number;
    update: number;
    skip: number;
    error: number;
  };
};

type ImportResponse = {
  meetId: string | null;
  counts: {
    total: number;
    add: number;
    update: number;
    skip: number;
    error: number;
  };
  errors: Array<{ rowIndex: number | null; message: string }>;
  sourceId: string | null;
};

const LEVEL_LABELS: Record<StandardLevel, string> = {
  national: "全国レベル",
  kyushu: "九州レベル",
  kagoshima: "県レベル",
};

const STATUS_LABELS = {
  add: "追加",
  update: "更新",
  skip: "スキップ",
} as const;

function readAdminTokenFromStorage(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
}

function writeAdminTokenToStorage(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (token) {
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    return;
  }
  sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
}

type AdminImportFormDraft = {
  level: StandardLevel;
  season: string;
  course: Course;
  meetName: string;
  meetDate: string;
  meetDateEnd: string;
  meetMetadataText: string;
  jsonText: string;
};

function readAdminImportDraft(): AdminImportFormDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = sessionStorage.getItem(ADMIN_IMPORT_FORM_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AdminImportFormDraft>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (
      (parsed.level !== "national" && parsed.level !== "kyushu" && parsed.level !== "kagoshima") ||
      (parsed.course !== "SCM" && parsed.course !== "LCM" && parsed.course !== "ANY")
    ) {
      return null;
    }

    return {
      level: parsed.level,
      season: typeof parsed.season === "string" ? parsed.season : String(new Date().getFullYear()),
      course: parsed.course,
      meetName: typeof parsed.meetName === "string" ? parsed.meetName : "サンプル大会",
      meetDate: typeof parsed.meetDate === "string" ? parsed.meetDate : "",
      meetDateEnd: typeof parsed.meetDateEnd === "string" ? parsed.meetDateEnd : "",
      meetMetadataText: typeof parsed.meetMetadataText === "string" ? parsed.meetMetadataText : "",
      jsonText: typeof parsed.jsonText === "string" ? parsed.jsonText : "",
    };
  } catch {
    return null;
  }
}

function writeAdminImportDraft(draft: AdminImportFormDraft): void {
  if (typeof window === "undefined") {
    return;
  }

  sessionStorage.setItem(ADMIN_IMPORT_FORM_STORAGE_KEY, JSON.stringify(draft));
}

function parseMetadataText(text: string): {
  value: Record<string, unknown> | null;
  error: string | null;
} {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { value: null, error: null };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        value: null,
        error: "metadata は JSONオブジェクトで入力してください（例: {\"category\":\"県予選\"}）。",
      };
    }

    return { value: parsed as Record<string, unknown>, error: null };
  } catch {
    return {
      value: null,
      error: "metadata のJSON形式が不正です。",
    };
  }
}

function formatMeetDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate) {
    return "未設定";
  }
  if (!endDate || endDate === startDate) {
    return startDate;
  }
  return `${startDate} 〜 ${endDate}`;
}

export function AdminImportClient() {
  const [authenticated, setAuthenticated] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [level, setLevel] = useState<StandardLevel>("national");
  const [season, setSeason] = useState(String(new Date().getFullYear()));
  const [course, setCourse] = useState<Course>("SCM");
  const [meetName, setMeetName] = useState("サンプル大会");
  const [meetDate, setMeetDate] = useState("");
  const [meetDateEnd, setMeetDateEnd] = useState("");
  const [meetMetadataText, setMeetMetadataText] = useState("");
  const [jsonText, setJsonText] = useState("");

  const [requestLoading, setRequestLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [recordsEditorReloadKey, setRecordsEditorReloadKey] = useState(0);

  const handleUnauthorized = () => {
    setAuthenticated(false);
    setAdminToken(null);
    writeAdminTokenToStorage(null);
  };

  useEffect(() => {
    const loadSession = async () => {
      const storedToken = readAdminTokenFromStorage();
      setAdminToken(storedToken);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      try {
        const headers: HeadersInit = {};
        if (storedToken) {
          headers[ADMIN_TOKEN_HEADER] = storedToken;
        }

        const response = await fetch("/api/admin/session", {
          headers,
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as { authenticated?: boolean };
        setAuthenticated(Boolean(body.authenticated));
      } catch {
        setAuthenticated(false);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    loadSession();
  }, []);

  useEffect(() => {
    const draft = readAdminImportDraft();
    if (!draft) {
      return;
    }

    setLevel(draft.level);
    setSeason(draft.season);
    setCourse(draft.course);
    setMeetName(draft.meetName);
    setMeetDate(draft.meetDate);
    setMeetDateEnd(draft.meetDateEnd);
    setMeetMetadataText(draft.meetMetadataText);
    setJsonText(draft.jsonText);
  }, []);

  useEffect(() => {
    writeAdminImportDraft({
      level,
      season,
      course,
      meetName,
      meetDate,
      meetDateEnd,
      meetMetadataText,
      jsonText,
    });
  }, [level, season, course, meetName, meetDate, meetDateEnd, meetMetadataText, jsonText]);

  const seasonError = useMemo(() => {
    const seasonNumber = Number.parseInt(season, 10);
    if (!/^\d{4}$/.test(season) || seasonNumber < 1900 || seasonNumber > 3000) {
      return "年度は4桁の数値で入力してください。";
    }
    return null;
  }, [season]);

  const meetNameError = useMemo(() => {
    if (meetName.trim() === "") {
      return "大会名は必須です。";
    }
    return null;
  }, [meetName]);

  const meetDateError = useMemo(() => {
    const trimmed = meetDate.trim();
    if (trimmed === "") {
      return null;
    }
    if (!parseIsoDateOnly(trimmed)) {
      return "大会日付は YYYY-MM-DD 形式で入力してください。";
    }
    return null;
  }, [meetDate]);

  const meetDateEndError = useMemo(() => {
    const trimmed = meetDateEnd.trim();
    if (trimmed === "") {
      return null;
    }
    if (!parseIsoDateOnly(trimmed)) {
      return "大会終了日は YYYY-MM-DD 形式で入力してください。";
    }
    return null;
  }, [meetDateEnd]);

  const meetDateRangeError = useMemo(() => {
    const start = meetDate.trim();
    const end = meetDateEnd.trim();

    if (end === "") {
      return null;
    }
    if (start === "") {
      return "大会終了日を入力する場合は大会日付も入力してください。";
    }
    if (start > end) {
      return "大会終了日は大会日付以降を入力してください。";
    }
    return null;
  }, [meetDate, meetDateEnd]);

  const metadataInput = useMemo(() => parseMetadataText(meetMetadataText), [meetMetadataText]);

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);
    setLoginLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const body = (await response.json()) as { error?: string; token?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "ログインに失敗しました。");
      }

      const token = body.token ?? null;
      setAdminToken(token);
      writeAdminTokenToStorage(token);
      setAuthenticated(true);
      setPassword("");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "ログインに失敗しました。");
    } finally {
      setLoginLoading(false);
    }
  };

  const runAction = async (action: "preview" | "import") => {
    if (seasonError) {
      setActionError(seasonError);
      return;
    }

    if (meetNameError) {
      setActionError(meetNameError);
      return;
    }

    if (metadataInput.error) {
      setActionError(metadataInput.error);
      return;
    }

    if (meetDateError) {
      setActionError(meetDateError);
      return;
    }
    if (meetDateEndError) {
      setActionError(meetDateEndError);
      return;
    }
    if (meetDateRangeError) {
      setActionError(meetDateRangeError);
      return;
    }

    if (jsonText.trim() === "") {
      setActionError("JSONを入力してください。");
      return;
    }

    setActionError(null);
    setImportResult(null);
    setRequestLoading(true);

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (adminToken) {
        headers[ADMIN_TOKEN_HEADER] = adminToken;
      }

      const response = await fetch(`/api/admin/${action}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          level,
          season: Number.parseInt(season, 10),
          course,
          meetName: meetName.trim(),
          meetDate: meetDate.trim() === "" ? null : meetDate.trim(),
          meetDateEnd: meetDateEnd.trim() === "" ? null : meetDateEnd.trim(),
          meetMetadata: metadataInput.value,
          jsonText,
        }),
      });

      const body = (await response.json()) as
        | (PreviewResponse & { error?: string })
        | (ImportResponse & { error?: string })
        | { error?: string };

      if (response.status === 401) {
        handleUnauthorized();
        throw new Error("認証が切れました。再ログインしてください。");
      }

      if (!response.ok) {
        throw new Error(body.error ?? "処理に失敗しました。");
      }

      if (action === "preview") {
        setPreview(body as PreviewResponse);
      } else {
        setImportResult(body as ImportResponse);
        setRecordsEditorReloadKey((current) => current + 1);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "処理に失敗しました。");
    } finally {
      setRequestLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <form onSubmit={login} className="max-w-md space-y-4 rounded border border-zinc-200 bg-white p-6">
        <h1 className="text-xl font-bold">管理ログイン</h1>
        <div>
          <label className="mb-1 block text-sm font-medium">ADMIN_PASSWORD</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2"
            required
          />
        </div>
        {loginError ? <p className="text-sm text-red-700">{loginError}</p> : null}
        <button
          type="submit"
          disabled={loginLoading}
          className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
        >
          {loginLoading ? "ログイン中..." : "ログイン"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded border border-zinc-200 bg-white p-6">
        <h1 className="text-xl font-bold">標準記録インポート</h1>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">level</label>
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value as StandardLevel)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
            >
              {STANDARD_LEVELS.map((value) => (
                <option key={value} value={value}>
                  {value} ({LEVEL_LABELS[value]})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">標準記録年度</label>
            <input
              type="number"
              value={season}
              onChange={(event) => setSeason(event.target.value)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
              required
            />
            {seasonError ? <p className="mt-1 text-xs text-red-700">{seasonError}</p> : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">course</label>
            <select
              value={course}
              onChange={(event) => setCourse(event.target.value as Course)}
              className="w-full rounded border border-zinc-300 px-3 py-2"
            >
              {COURSES.map((value) => (
                <option key={value} value={value}>
                  {COURSE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">大会名</label>
          <input
            type="text"
            value={meetName}
            onChange={(event) => setMeetName(event.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2"
            placeholder="例: 2026県春季記録会"
            required
          />
          {meetNameError ? <p className="mt-1 text-xs text-red-700">{meetNameError}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">大会日付（任意）</label>
          <input
            type="date"
            value={meetDate}
            onChange={(event) => setMeetDate(event.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2"
          />
          {meetDateError ? <p className="mt-1 text-xs text-red-700">{meetDateError}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">大会終了日（任意）</label>
          <input
            type="date"
            value={meetDateEnd}
            onChange={(event) => setMeetDateEnd(event.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2"
          />
          {meetDateEndError ? <p className="mt-1 text-xs text-red-700">{meetDateEndError}</p> : null}
          {meetDateRangeError ? <p className="mt-1 text-xs text-red-700">{meetDateRangeError}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">metadata(JSON, 任意)</label>
          <textarea
            value={meetMetadataText}
            onChange={(event) => setMeetMetadataText(event.target.value)}
            className="h-24 w-full rounded border border-zinc-300 px-3 py-2 font-mono text-xs"
            placeholder='{"category":"県予選","venue":"鹿児島市"}'
          />
          {metadataInput.error ? <p className="mt-1 text-xs text-red-700">{metadataInput.error}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">JSON</label>
          <textarea
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
            className="h-64 w-full rounded border border-zinc-300 px-3 py-2 font-mono text-xs"
          />
        </div>

        {actionError ? <p className="text-sm text-red-700">{actionError}</p> : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => runAction("preview")}
            disabled={requestLoading}
            className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
          >
            解析（プレビュー）
          </button>
          <button
            type="button"
            onClick={() => runAction("import")}
            disabled={requestLoading}
            className="rounded bg-emerald-700 px-4 py-2 text-white disabled:opacity-60"
          >
            確定して登録
          </button>
        </div>
      </section>

      {preview ? (
        <section className="space-y-4 rounded border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">プレビュー結果</h2>
          <p className="text-sm">
            対象大会: {preview.meet.name}（{LEVEL_LABELS[preview.meet.level]} / {preview.meet.season} /
            {COURSE_LABELS[preview.meet.course]}）
          </p>
          <p className="text-sm">
            大会日付: {formatMeetDateRange(preview.meet.meet_date, preview.meet.meet_date_end)}
          </p>
          <p className="text-sm">大会の状態: {preview.meet.exists ? "既存大会を更新" : "新規大会を作成"}</p>
          <p className="text-sm">
            追加: {preview.counts.add} / 更新: {preview.counts.update} / スキップ: {preview.counts.skip} /
            エラー: {preview.counts.error}
          </p>

          {preview.errors.length > 0 ? (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-red-700">エラー</h3>
              <ul className="space-y-1 text-sm text-red-700">
                {preview.errors.map((error, index) => (
                  <li key={`${error.rowIndex}-${index}`}>
                    rows[{error.rowIndex ?? "-"}] {error.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left">
                  <th className="py-2 pr-3">rows[index]</th>
                  <th className="py-2 pr-3">gender</th>
                  <th className="py-2 pr-3">age_min</th>
                  <th className="py-2 pr-3">age_max</th>
                  <th className="py-2 pr-3">event_code</th>
                  <th className="py-2 pr-3">time</th>
                  <th className="py-2">status</th>
                </tr>
              </thead>
              <tbody>
                {preview.normalizedRows.map((row) => (
                  <tr key={row.rowIndex} className="border-b border-zinc-100">
                    <td className="py-2 pr-3">{row.rowIndex}</td>
                    <td className="py-2 pr-3">{row.gender}</td>
                    <td className="py-2 pr-3">{row.age_min}</td>
                    <td className="py-2 pr-3">{row.age_max}</td>
                    <td className="py-2 pr-3">{row.event_code}</td>
                    <td className="py-2 pr-3">{row.time}</td>
                    <td className="py-2">{STATUS_LABELS[row.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {importResult ? (
        <section className="rounded border border-emerald-300 bg-emerald-50 p-6 text-sm">
          <h2 className="mb-2 text-lg font-semibold">登録結果</h2>
          <p>
            追加: {importResult.counts.add} / 更新: {importResult.counts.update} / スキップ:
            {importResult.counts.skip} / エラー: {importResult.counts.error}
          </p>
        </section>
      ) : null}

      <AdminRecordsEditor
        key={recordsEditorReloadKey}
        adminToken={adminToken}
        defaultLevel={level}
        onUnauthorized={handleUnauthorized}
      />
    </div>
  );
}
