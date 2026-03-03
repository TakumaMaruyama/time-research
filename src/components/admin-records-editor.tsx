"use client";

import { useState } from "react";

import {
  COURSE_LABELS,
  formatCourseStandardRecordLabel,
} from "@/lib/course-label";
import { parseIsoDateOnly } from "@/lib/date";
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
  season: number;
  course: Course;
  meet_date: string | null;
  meet_date_end: string | null;
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
  meet_date_end: string | null;
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
  defaultCourse: Course;
  onUnauthorized: () => void;
};

const LEVEL_LABELS: Record<StandardLevel, string> = {
  national: "全国レベル",
  kyushu: "九州レベル",
  kagoshima: "県レベル",
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
    return "event_code は FR/BK/BR/FL/IM + 距離 (例: FR_50) または FRR/MRR + 組数X距離 (例: FRR_4X100) で入力してください。";
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

function formatMeetDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate) {
    return "未設定";
  }
  if (!endDate || endDate === startDate) {
    return startDate;
  }
  return `${startDate} 〜 ${endDate}`;
}

function formatMetadataForEditor(metadata: Record<string, unknown> | null): string {
  if (!metadata) {
    return "";
  }
  return JSON.stringify(metadata, null, 2);
}

function parseMetadataForApi(text: string): {
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
        error: "metadata は JSONオブジェクトで入力してください。",
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

export function AdminRecordsEditor({
  adminToken,
  defaultLevel,
  defaultCourse,
  onUnauthorized,
}: Props) {
  const [level, setLevel] = useState<StandardLevel>(defaultLevel);
  const [course, setCourse] = useState<Course>(defaultCourse);

  const [meets, setMeets] = useState<MeetSummary[]>([]);
  const [selectedMeet, setSelectedMeet] = useState<MeetDetail | null>(null);
  const [records, setRecords] = useState<EditableRecord[]>([]);

  const [loadingMeets, setLoadingMeets] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [savingMeet, setSavingMeet] = useState(false);
  const [savingRecordId, setSavingRecordId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [deletingMeetId, setDeletingMeetId] = useState<string | null>(null);
  const [addingRecord, setAddingRecord] = useState(false);

  const [newRecord, setNewRecord] = useState<NewRecord>(newRecordDefault());
  const [editingMeetName, setEditingMeetName] = useState("");
  const [editingSeason, setEditingSeason] = useState("");
  const [editingMeetDate, setEditingMeetDate] = useState("");
  const [editingMeetDateEnd, setEditingMeetDateEnd] = useState("");
  const [editingMetadataText, setEditingMetadataText] = useState("");

  const [listError, setListError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorInfo, setEditorInfo] = useState<string | null>(null);

  const loadMeets = async () => {
    setLoadingMeets(true);
    setListError(null);
    setEditorInfo(null);

    try {
      const params = new URLSearchParams({
        level,
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
      setEditingMeetName(body.meet.name);
      setEditingSeason(String(body.meet.season));
      setEditingMeetDate(body.meet.meet_date ?? "");
      setEditingMeetDateEnd(body.meet.meet_date_end ?? "");
      setEditingMetadataText(formatMetadataForEditor(body.meet.metadata));
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

  const deleteMeet = async (meet: MeetSummary) => {
    if (
      !window.confirm(
        `大会「${meet.name}」を削除しますか？\nこの大会に紐づく標準記録（${meet.row_count}件）も削除されます。`,
      )
    ) {
      return;
    }

    setDeletingMeetId(meet.id);
    setListError(null);
    setEditorError(null);
    setEditorInfo(null);

    try {
      const response = await fetch(`/api/admin/records/${meet.id}`, {
        method: "DELETE",
        headers: buildHeaders(adminToken),
      });

      const body = (await response.json()) as { deletedMeetId?: string; error?: string };

      if (response.status === 401) {
        onUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error(body.error ?? "大会の削除に失敗しました。");
      }

      setMeets((prev) => prev.filter((item) => item.id !== meet.id));

      if (selectedMeet?.id === meet.id) {
        setSelectedMeet(null);
        setRecords([]);
      }

      setEditorInfo("大会を削除しました。");
    } catch (error) {
      setListError(error instanceof Error ? error.message : "大会の削除に失敗しました。");
    } finally {
      setDeletingMeetId(null);
    }
  };

  const saveMeetInfo = async () => {
    if (!selectedMeet) {
      return;
    }

    const normalizedMeetName = editingMeetName.trim();
    if (normalizedMeetName === "") {
      setEditorError("大会名を入力してください。");
      return;
    }

    const seasonNumber = Number.parseInt(editingSeason.trim(), 10);
    if (!/^\d{4}$/.test(editingSeason.trim()) || seasonNumber < 1900 || seasonNumber > 3000) {
      setEditorError("年度は4桁の数値で入力してください。");
      return;
    }

    const normalizedMeetDate = editingMeetDate.trim() === "" ? null : editingMeetDate.trim();
    if (normalizedMeetDate !== null && parseIsoDateOnly(normalizedMeetDate) === null) {
      setEditorError("大会日付は YYYY-MM-DD 形式で入力してください。");
      return;
    }
    const normalizedMeetDateEnd =
      editingMeetDateEnd.trim() === "" ? null : editingMeetDateEnd.trim();
    if (
      normalizedMeetDateEnd !== null &&
      parseIsoDateOnly(normalizedMeetDateEnd) === null
    ) {
      setEditorError("大会終了日は YYYY-MM-DD 形式で入力してください。");
      return;
    }
    if (normalizedMeetDate === null && normalizedMeetDateEnd !== null) {
      setEditorError("大会終了日を設定する場合は大会日付も入力してください。");
      return;
    }
    if (
      normalizedMeetDate !== null &&
      normalizedMeetDateEnd !== null &&
      normalizedMeetDateEnd < normalizedMeetDate
    ) {
      setEditorError("大会終了日は大会日付以降を入力してください。");
      return;
    }

    const metadataInput = parseMetadataForApi(editingMetadataText);
    if (metadataInput.error) {
      setEditorError(metadataInput.error);
      return;
    }

    setSavingMeet(true);
    setEditorError(null);
    setEditorInfo(null);

    try {
      const response = await fetch(`/api/admin/records/${selectedMeet.id}`, {
        method: "PATCH",
        headers: buildHeaders(adminToken, true),
        body: JSON.stringify({
          season: seasonNumber,
          meet_name: normalizedMeetName,
          meet_date: normalizedMeetDate,
          meet_date_end: normalizedMeetDateEnd,
          metadata: metadataInput.value,
        }),
      });

      const body = (await response.json()) as { meet?: MeetDetail; error?: string };

      if (response.status === 401) {
        onUnauthorized();
        return;
      }

      if (!response.ok || !body.meet) {
        throw new Error(body.error ?? "大会情報の更新に失敗しました。");
      }

      const updatedMeet = body.meet;

      setSelectedMeet(updatedMeet);
      setEditingMeetName(updatedMeet.name);
      setEditingSeason(String(updatedMeet.season));
      setEditingMeetDate(updatedMeet.meet_date ?? "");
      setEditingMeetDateEnd(updatedMeet.meet_date_end ?? "");
      setEditingMetadataText(formatMetadataForEditor(updatedMeet.metadata));
      setMeets((prev) =>
        prev.map((item) =>
          item.id === updatedMeet.id
            ? {
                ...item,
                name: updatedMeet.name,
                updated_at: updatedMeet.updated_at,
                season: updatedMeet.season,
                meet_date: updatedMeet.meet_date,
                meet_date_end: updatedMeet.meet_date_end,
                metadata: updatedMeet.metadata,
              }
              : item,
        ),
      );
      setEditorInfo("大会情報を更新しました。");
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "大会情報の更新に失敗しました。");
    } finally {
      setSavingMeet(false);
    }
  };

  return (
    <section className="space-y-4 rounded border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold">登録済み記録の閲覧・編集</h2>

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
                <div key={meet.id} className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => loadMeetDetail(meet.id)}
                    className={`flex-1 rounded border px-3 py-2 text-left text-xs transition-colors ${
                      selectedMeet?.id === meet.id
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300 bg-white hover:bg-zinc-100"
                    }`}
                  >
                    <p className="font-semibold">{meet.name}</p>
                    <p>標準記録年度: {meet.season}</p>
                    <p>{formatCourseStandardRecordLabel(meet.course)}</p>
                    <p>日付: {formatMeetDateRange(meet.meet_date, meet.meet_date_end)}</p>
                    <p>件数: {meet.row_count}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMeet(meet)}
                    disabled={deletingMeetId === meet.id}
                    className="rounded bg-red-700 px-2 py-1 text-[11px] text-white disabled:opacity-60"
                  >
                    {deletingMeetId === meet.id ? "削除中" : "大会削除"}
                  </button>
                </div>
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
                <p className="text-xs text-zinc-600">
                  大会日付: {formatMeetDateRange(selectedMeet.meet_date, selectedMeet.meet_date_end)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-zinc-700">大会名</label>
                  <input
                    type="text"
                    value={editingMeetName}
                    onChange={(event) => setEditingMeetName(event.target.value)}
                    className="w-64 rounded border border-zinc-300 px-2 py-1 text-xs"
                  />
                  <label className="text-xs text-zinc-700">標準記録年度</label>
                  <input
                    type="number"
                    value={editingSeason}
                    onChange={(event) => setEditingSeason(event.target.value)}
                    className="w-28 rounded border border-zinc-300 px-2 py-1 text-xs"
                  />
                  <label className="text-xs text-zinc-700">大会日付</label>
                  <input
                    type="date"
                    value={editingMeetDate}
                    onChange={(event) => setEditingMeetDate(event.target.value)}
                    className="w-40 rounded border border-zinc-300 px-2 py-1 text-xs"
                  />
                  <label className="text-xs text-zinc-700">大会終了日</label>
                  <input
                    type="date"
                    value={editingMeetDateEnd}
                    onChange={(event) => setEditingMeetDateEnd(event.target.value)}
                    className="w-40 rounded border border-zinc-300 px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setEditingMeetDate("")}
                    disabled={savingMeet || editingMeetDate === ""}
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 disabled:opacity-60"
                  >
                    開始日クリア
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingMeetDateEnd("")}
                    disabled={savingMeet || editingMeetDateEnd === ""}
                    className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 disabled:opacity-60"
                  >
                    終了日クリア
                  </button>
                  <button
                    type="button"
                    onClick={saveMeetInfo}
                    disabled={savingMeet}
                    className="rounded bg-zinc-900 px-2 py-1 text-xs text-white disabled:opacity-60"
                  >
                    {savingMeet ? "保存中" : "大会情報を保存"}
                  </button>
                </div>
                <div className="mt-2">
                  <label className="mb-1 block text-xs text-zinc-700">metadata(JSON, 任意)</label>
                  <textarea
                    value={editingMetadataText}
                    onChange={(event) => setEditingMetadataText(event.target.value)}
                    className="h-24 w-full rounded border border-zinc-300 px-2 py-1 font-mono text-xs"
                    placeholder='{"category":"県予選","venue":"鹿児島市"}'
                  />
                </div>
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
                    placeholder="FR_50 or FRR_4X100"
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
