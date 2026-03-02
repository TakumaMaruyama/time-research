"use client";

import { useMemo, useState } from "react";

import {
  COURSES,
  EVENT_CODE_REGEX,
  GENDERS,
  STANDARD_LEVELS,
  type Course,
  type Gender,
  type StandardLevel,
} from "@/lib/domain";

const ADMIN_TOKEN_HEADER = "x-admin-token";

type MeetSummary = {
  id: string;
  name: string;
  course: Course;
  meet_date: string | null;
  metadata: Record<string, unknown> | null;
  row_count: number;
  updated_at: string;
};

type MeetDetailRecord = {
  id: string;
  gender: Gender;
  age_min: number;
  age_max: number;
  event_code: string;
  time: string;
  time_ms: number;
};

type MeetDetail = {
  id: string;
  level: StandardLevel;
  season: number;
  course: Course;
  name: string;
  meet_date: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

type EditableRecord = {
  id: string;
  gender: Gender;
  age_min: string;
  age_max: string;
  event_code: string;
  time: string;
};

type NewRecord = {
  gender: Gender;
  age_min: string;
  age_max: string;
  event_code: string;
  time: string;
};

type Props = {
  adminToken: string | null;
  defaultLevel: StandardLevel;
  defaultSeason: string;
  defaultCourse: Course;
  onUnauthorized: () => void;
};

const LEVEL_LABELS: Record<StandardLevel, string> = {
  national: "全国レベル",
  kyushu: "九州レベル",
  kagoshima: "県レベル",
};

const COURSE_LABELS: Record<Course, string> = {
  SCM: "短水路 (25m)",
  LCM: "長水路 (50m)",
  ANY: "どちらでも良い",
};

const GENDER_LABELS: Record<Gender, string> = {
  M: "男子",
  F: "女子",
};

function buildHeaders(adminToken: string | null, includeJson = false): HeadersInit {
  const headers: HeadersInit = {};
  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }
  if (adminToken) {
    headers[ADMIN_TOKEN_HEADER] = adminToken;
  }
  return headers;
}

function normalizeRecordForApi(record: NewRecord | EditableRecord) {
  return {
    gender: record.gender,
    age_min: Number.parseInt(record.age_min, 10),
    age_max: Number.parseInt(record.age_max, 10),
    event_code: record.event_code.trim().toUpperCase(),
    time: record.time.trim(),
  };
}

function validateRecordInput(record: NewRecord | EditableRecord): string | null {
  const ageMin = Number.parseInt(record.age_min, 10);
  const ageMax = Number.parseInt(record.age_max, 10);

  if (!Number.isInteger(ageMin) || !Number.isInteger(ageMax)) {
    return "age_min / age_max は整数で入力してください。";
  }
  if (ageMin < 0 || ageMax < 0 || ageMin > 120 || ageMax > 120) {
    return "age_min / age_max は 0-120 の範囲で入力してください。";
  }
  if (ageMin > ageMax) {
    return "age_min は age_max 以下で入力してください。";
  }

  const eventCode = record.event_code.trim().toUpperCase();
  if (!EVENT_CODE_REGEX.test(eventCode)) {
    return "event_code は FR/BK/BR/FL/IM + 距離 (例: FR_50) で入力してください。";
  }

  if (record.time.trim() === "") {
    return "time を入力してください。";
  }

  return null;
}

function toEditable(record: MeetDetailRecord): EditableRecord {
  return {
    id: record.id,
    gender: record.gender,
    age_min: String(record.age_min),
    age_max: String(record.age_max),
    event_code: record.event_code,
    time: record.time,
  };
}

function newRecordDefault(): NewRecord {
  return {
    gender: "M",
    age_min: "",
    age_max: "",
    event_code: "",
    time: "",
  };
}

export function AdminRecordsEditor({
  adminToken,
  defaultLevel,
  defaultSeason,
  defaultCourse,
  onUnauthorized,
}: Props) {
  const [level, setLevel] = useState<StandardLevel>(defaultLevel);
  const [season, setSeason] = useState(defaultSeason);
  const [course, setCourse] = useState<Course>(defaultCourse);

  const [meets, setMeets] = useState<MeetSummary[]>([]);
  const [selectedMeet, setSelectedMeet] = useState<MeetDetail | null>(null);
  const [records, setRecords] = useState<EditableRecord[]>([]);

  const [loadingMeets, setLoadingMeets] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [savingRecordId, setSavingRecordId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [addingRecord, setAddingRecord] = useState(false);

  const [newRecord, setNewRecord] = useState<NewRecord>(newRecordDefault());

  const [listError, setListError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorInfo, setEditorInfo] = useState<string | null>(null);

  const seasonError = useMemo(() => {
    const seasonNumber = Number.parseInt(season, 10);
    if (!/^\d{4}$/.test(season) || seasonNumber < 1900 || seasonNumber > 3000) {
      return "年度は4桁の数値で入力してください。";
    }
    return null;
  }, [season]);

  const loadMeets = async () => {
    if (seasonError) {
      setListError(seasonError);
      return;
    }

    setLoadingMeets(true);
    setListError(null);
    setEditorInfo(null);

    try {
      const params = new URLSearchParams({
        level,
        season: season.trim(),
        course,
      });

      const response = await fetch(`/api/admin/records?${params.toString()}`, {
        headers: buildHeaders(adminToken),
      });

      const body = (await response.json()) as
        | { meets: MeetSummary[]; error?: string }
        | { error?: string };

      if (response.status === 401) {
        onUnauthorized();
        return;
      }

      if (!response.ok || !("meets" in body)) {
        throw new Error(body.error ?? "大会一覧の取得に失敗しました。");
      }

      setMeets(body.meets);

      if (selectedMeet && !body.meets.some((meet) => meet.id === selectedMeet.id)) {
        setSelectedMeet(null);
        setRecords([]);
      }
    } catch (error) {
      setListError(error instanceof Error ? error.message : "大会一覧の取得に失敗しました。");
    } finally {
      setLoadingMeets(false);
    }
  };

  const loadMeetDetail = async (meetId: string) => {
    setLoadingRecords(true);
    setEditorError(null);
    setEditorInfo(null);

    try {
      const response = await fetch(`/api/admin/records/${meetId}`, {
        headers: buildHeaders(adminToken),
      });

      const body = (await response.json()) as
        | { meet: MeetDetail; records: MeetDetailRecord[]; error?: string }
        | { error?: string };

      if (response.status === 401) {
        onUnauthorized();
        return;
      }

      if (!response.ok || !("records" in body)) {
        throw new Error(body.error ?? "大会詳細の取得に失敗しました。");
      }

      setSelectedMeet(body.meet);
      setRecords(body.records.map(toEditable));
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "大会詳細の取得に失敗しました。");
    } finally {
      setLoadingRecords(false);
    }
  };

  const updateRecordField = <K extends keyof EditableRecord>(
    recordId: string,
    field: K,
    value: EditableRecord[K],
  ) => {
    setRecords((prev) =>
      prev.map((record) => (record.id === recordId ? { ...record, [field]: value } : record)),
    );
  };

  const saveRecord = async (record: EditableRecord) => {
    if (!selectedMeet) {
      return;
    }

    const validationError = validateRecordInput(record);
    if (validationError) {
      setEditorError(validationError);
      return;
    }

    setSavingRecordId(record.id);
    setEditorError(null);
    setEditorInfo(null);

    try {
      const response = await fetch(`/api/admin/records/${selectedMeet.id}/${record.id}`, {
        method: "PATCH",
        headers: buildHeaders(adminToken, true),
        body: JSON.stringify(normalizeRecordForApi(record)),
      });

      const body = (await response.json()) as
        | { record: MeetDetailRecord; error?: string }
        | { error?: string };

      if (response.status === 401) {
        onUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error(body.error ?? "記録の更新に失敗しました。");
      }

      if ("record" in body) {
        setRecords((prev) =>
          prev.map((row) => (row.id === record.id ? toEditable(body.record) : row)),
        );
      }

      setEditorInfo("記録を更新しました。");
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "記録の更新に失敗しました。");
    } finally {
      setSavingRecordId(null);
    }
  };

  const deleteRecord = async (recordId: string) => {
    if (!selectedMeet) {
      return;
    }

    if (!window.confirm("この行を削除しますか？")) {
      return;
    }

    setDeletingRecordId(recordId);
    setEditorError(null);
    setEditorInfo(null);

    try {
      const response = await fetch(`/api/admin/records/${selectedMeet.id}/${recordId}`, {
        method: "DELETE",
        headers: buildHeaders(adminToken),
      });

      const body = (await response.json()) as { error?: string };

      if (response.status === 401) {
        onUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error(body.error ?? "記録の削除に失敗しました。");
      }

      setRecords((prev) => prev.filter((record) => record.id !== recordId));
      setMeets((prev) =>
        prev.map((meet) =>
          meet.id === selectedMeet.id
            ? { ...meet, row_count: Math.max(0, meet.row_count - 1) }
            : meet,
        ),
      );
      setEditorInfo("記録を削除しました。");
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "記録の削除に失敗しました。");
    } finally {
      setDeletingRecordId(null);
    }
  };

  const addRecord = async () => {
    if (!selectedMeet) {
      return;
    }

    const validationError = validateRecordInput(newRecord);
    if (validationError) {
      setEditorError(validationError);
      return;
    }

    setAddingRecord(true);
    setEditorError(null);
    setEditorInfo(null);

    try {
      const response = await fetch(`/api/admin/records/${selectedMeet.id}`, {
        method: "POST",
        headers: buildHeaders(adminToken, true),
        body: JSON.stringify(normalizeRecordForApi(newRecord)),
      });

      const body = (await response.json()) as
        | { record: MeetDetailRecord; error?: string }
        | { error?: string };

      if (response.status === 401) {
        onUnauthorized();
        return;
      }

      if (!response.ok || !("record" in body)) {
        throw new Error(body.error ?? "記録の追加に失敗しました。");
      }

      await loadMeetDetail(selectedMeet.id);
      setMeets((prev) =>
        prev.map((meet) =>
          meet.id === selectedMeet.id ? { ...meet, row_count: meet.row_count + 1 } : meet,
        ),
      );
      setNewRecord(newRecordDefault());
      setEditorInfo("記録を追加しました。");
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "記録の追加に失敗しました。");
    } finally {
      setAddingRecord(false);
    }
  };

  return (
    <section className="space-y-4 rounded border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold">登録済み記録の閲覧・編集</h2>

      <div className="grid gap-4 sm:grid-cols-4">
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
          <label className="mb-1 block text-sm font-medium">season</label>
          <input
            type="number"
            value={season}
            onChange={(event) => setSeason(event.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2"
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

        <div className="flex items-end">
          <button
            type="button"
            onClick={loadMeets}
            disabled={loadingMeets}
            className="w-full rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-60"
          >
            {loadingMeets ? "読み込み中..." : "大会一覧を取得"}
          </button>
        </div>
      </div>

      {listError ? <p className="text-sm text-red-700">{listError}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded border border-zinc-200 p-3">
          <h3 className="mb-2 text-sm font-semibold">大会一覧</h3>
          {meets.length === 0 ? (
            <p className="text-xs text-zinc-600">大会一覧を取得してください。</p>
          ) : (
            <div className="space-y-2">
              {meets.map((meet) => (
                <button
                  key={meet.id}
                  type="button"
                  onClick={() => loadMeetDetail(meet.id)}
                  className={`w-full rounded border px-3 py-2 text-left text-xs transition-colors ${
                    selectedMeet?.id === meet.id
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white hover:bg-zinc-100"
                  }`}
                >
                  <p className="font-semibold">{meet.name}</p>
                  <p>標準記録のプール長: {COURSE_LABELS[meet.course]}</p>
                  <p>日付: {meet.meet_date ?? "未設定"}</p>
                  <p>件数: {meet.row_count}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded border border-zinc-200 p-3">
          {!selectedMeet ? (
            <p className="text-sm text-zinc-600">左の大会一覧から編集対象を選択してください。</p>
          ) : (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold">{selectedMeet.name}</h3>
                <p className="text-xs text-zinc-600">
                  {LEVEL_LABELS[selectedMeet.level]} / {selectedMeet.season} / {COURSE_LABELS[selectedMeet.course]}
                </p>
                <p className="text-xs text-zinc-600">大会日付: {selectedMeet.meet_date ?? "未設定"}</p>
                {selectedMeet.metadata ? (
                  <p className="mt-1 break-all text-xs text-zinc-600">
                    metadata: {JSON.stringify(selectedMeet.metadata)}
                  </p>
                ) : null}
              </div>

              {loadingRecords ? <p className="text-sm">記録を読み込み中...</p> : null}
              {editorError ? <p className="text-sm text-red-700">{editorError}</p> : null}
              {editorInfo ? <p className="text-sm text-emerald-700">{editorInfo}</p> : null}

              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left">
                      <th className="py-2 pr-2">gender</th>
                      <th className="py-2 pr-2">age_min</th>
                      <th className="py-2 pr-2">age_max</th>
                      <th className="py-2 pr-2">event_code</th>
                      <th className="py-2 pr-2">time</th>
                      <th className="py-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id} className="border-b border-zinc-100">
                        <td className="py-2 pr-2">
                          <select
                            value={record.gender}
                            onChange={(event) =>
                              updateRecordField(record.id, "gender", event.target.value as Gender)
                            }
                            className="rounded border border-zinc-300 px-2 py-1"
                          >
                            {GENDERS.map((gender) => (
                              <option key={gender} value={gender}>
                                {GENDER_LABELS[gender]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            value={record.age_min}
                            onChange={(event) =>
                              updateRecordField(record.id, "age_min", event.target.value)
                            }
                            className="w-20 rounded border border-zinc-300 px-2 py-1"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            value={record.age_max}
                            onChange={(event) =>
                              updateRecordField(record.id, "age_max", event.target.value)
                            }
                            className="w-20 rounded border border-zinc-300 px-2 py-1"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={record.event_code}
                            onChange={(event) =>
                              updateRecordField(record.id, "event_code", event.target.value)
                            }
                            className="w-28 rounded border border-zinc-300 px-2 py-1"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="text"
                            value={record.time}
                            onChange={(event) => updateRecordField(record.id, "time", event.target.value)}
                            className="w-28 rounded border border-zinc-300 px-2 py-1"
                          />
                        </td>
                        <td className="py-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveRecord(record)}
                              disabled={savingRecordId === record.id || deletingRecordId === record.id}
                              className="rounded bg-zinc-900 px-2 py-1 text-white disabled:opacity-60"
                            >
                              {savingRecordId === record.id ? "保存中" : "保存"}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteRecord(record.id)}
                              disabled={deletingRecordId === record.id || savingRecordId === record.id}
                              className="rounded bg-red-700 px-2 py-1 text-white disabled:opacity-60"
                            >
                              {deletingRecordId === record.id ? "削除中" : "削除"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {records.length === 0 ? (
                      <tr>
                        <td className="py-3 text-zinc-600" colSpan={6}>
                          記録がありません。
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="rounded border border-zinc-200 p-3">
                <h4 className="mb-2 text-sm font-semibold">新規行を追加</h4>
                <div className="grid gap-2 md:grid-cols-6">
                  <select
                    value={newRecord.gender}
                    onChange={(event) =>
                      setNewRecord((prev) => ({ ...prev, gender: event.target.value as Gender }))
                    }
                    className="rounded border border-zinc-300 px-2 py-1"
                  >
                    {GENDERS.map((gender) => (
                      <option key={gender} value={gender}>
                        {GENDER_LABELS[gender]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="age_min"
                    value={newRecord.age_min}
                    onChange={(event) =>
                      setNewRecord((prev) => ({ ...prev, age_min: event.target.value }))
                    }
                    className="rounded border border-zinc-300 px-2 py-1"
                  />
                  <input
                    type="number"
                    placeholder="age_max"
                    value={newRecord.age_max}
                    onChange={(event) =>
                      setNewRecord((prev) => ({ ...prev, age_max: event.target.value }))
                    }
                    className="rounded border border-zinc-300 px-2 py-1"
                  />
                  <input
                    type="text"
                    placeholder="FR_50"
                    value={newRecord.event_code}
                    onChange={(event) =>
                      setNewRecord((prev) => ({ ...prev, event_code: event.target.value }))
                    }
                    className="rounded border border-zinc-300 px-2 py-1"
                  />
                  <input
                    type="text"
                    placeholder="00:29.80"
                    value={newRecord.time}
                    onChange={(event) => setNewRecord((prev) => ({ ...prev, time: event.target.value }))}
                    className="rounded border border-zinc-300 px-2 py-1"
                  />
                  <button
                    type="button"
                    onClick={addRecord}
                    disabled={addingRecord}
                    className="rounded bg-emerald-700 px-3 py-1 text-white disabled:opacity-60"
                  >
                    {addingRecord ? "追加中" : "追加"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
