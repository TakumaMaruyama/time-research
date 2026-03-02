"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { parseIsoDateOnly } from "@/lib/date";
import { COURSES, GENDERS } from "@/lib/domain";
import {
  readLastSearchInput,
  readSearchHistory,
  type SearchHistoryItem,
  type StoredSearchInput,
  upsertSearchHistory,
  writeLastSearchInput,
} from "@/lib/search-history";

type FormValues = StoredSearchInput;

type FormErrors = Partial<Record<keyof FormValues, string>>;

const GENDER_LABELS: Record<FormValues["gender"], string> = {
  M: "男子",
  F: "女子",
};

const COURSE_LABELS: Record<FormValues["course"], string> = {
  SCM: "短水路 (25m)",
  LCM: "長水路 (50m)",
  ANY: "どちらでも良い",
};

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};

  if (values.playerName.trim().length > 50) {
    errors.playerName = "選手名は50文字以内で入力してください。";
  }

  if (!values.birthDate) {
    errors.birthDate = "生年月日を入力してください。";
  } else if (!parseIsoDateOnly(values.birthDate)) {
    errors.birthDate = "YYYY-MM-DD 形式で正しい日付を入力してください。";
  }

  if (values.season.trim() !== "") {
    const seasonNumber = Number.parseInt(values.season, 10);
    if (!/^\d{4}$/.test(values.season) || seasonNumber < 1900 || seasonNumber > 3000) {
      errors.season = "年度は4桁の数値で入力してください（例: 2026）。";
    }
  }

  return errors;
}

function buildSearchQuery(values: FormValues): URLSearchParams {
  const query = new URLSearchParams({
    gender: values.gender,
    birthDate: values.birthDate,
    course: values.course,
  });

  if (values.season.trim() !== "") {
    query.set("season", values.season.trim());
  }

  return query;
}

function formatSearchedAt(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function SearchForm() {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(() => {
    const loaded = readLastSearchInput();
    if (loaded) {
      return loaded;
    }
    return {
      playerName: "",
      gender: "M",
      birthDate: "",
      course: "ANY",
      season: "",
    };
  });
  const [history, setHistory] = useState<SearchHistoryItem[]>(() => readSearchHistory());
  const [errors, setErrors] = useState<FormErrors>({});

  const hasErrors = useMemo(() => Object.keys(errors).length > 0, [errors]);

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    const next = { ...values, [key]: value };
    setValues(next);
    setErrors(validate(next));
  };

  const pushToResult = (input: FormValues) => {
    router.push(`/result?${buildSearchQuery(input).toString()}`);
  };

  const persistSearchInput = (input: FormValues) => {
    writeLastSearchInput(input);
    setHistory(upsertSearchHistory(input));
  };

  const onHistoryClick = (item: SearchHistoryItem) => {
    const input: FormValues = {
      playerName: item.playerName,
      gender: item.gender,
      birthDate: item.birthDate,
      course: item.course,
      season: item.season,
    };

    setValues(input);
    setErrors({});
    persistSearchInput(input);
    pushToResult(input);
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationErrors = validate(values);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    persistSearchInput(values);
    pushToResult(values);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
      <div>
        <label className="mb-1 block text-sm font-medium">選手名（任意）</label>
        <input
          type="text"
          value={values.playerName}
          onChange={(event) => setField("playerName", event.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2"
          placeholder="例: 山田 太郎"
          maxLength={50}
        />
        {errors.playerName ? <p className="mt-1 text-sm text-red-600">{errors.playerName}</p> : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">性別</label>
        <select
          value={values.gender}
          onChange={(event) => setField("gender", event.target.value as FormValues["gender"])}
          className="w-full rounded border border-zinc-300 px-3 py-2"
        >
          {GENDERS.map((gender) => (
            <option key={gender} value={gender}>
              {GENDER_LABELS[gender]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">生年月日</label>
        <input
          type="date"
          value={values.birthDate}
          onChange={(event) => setField("birthDate", event.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2"
          required
        />
        {errors.birthDate ? <p className="mt-1 text-sm text-red-600">{errors.birthDate}</p> : null}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">標準記録のプール長</label>
        <select
          value={values.course}
          onChange={(event) => setField("course", event.target.value as FormValues["course"])}
          className="w-full rounded border border-zinc-300 px-3 py-2"
        >
          {COURSES.map((course) => (
            <option key={course} value={course}>
              {COURSE_LABELS[course]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">年度（任意）</label>
        <input
          type="number"
          value={values.season}
          onChange={(event) => setField("season", event.target.value)}
          placeholder="例: 2026"
          className="w-full rounded border border-zinc-300 px-3 py-2"
        />
        <p className="mt-1 text-xs text-zinc-600">未入力の場合は最新年度の記録を検索します。</p>
        {errors.season ? <p className="mt-1 text-sm text-red-600">{errors.season}</p> : null}
      </div>

      <button
        type="submit"
        className="w-full rounded bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700"
      >
        検索する
      </button>

      {hasErrors ? <p className="text-sm text-red-700">入力内容を確認してください。</p> : null}

      <section className="space-y-2 border-t border-zinc-200 pt-4">
        <h2 className="text-sm font-semibold">検索履歴（最新10件）</h2>
        {history.length === 0 ? (
          <p className="text-xs text-zinc-600">履歴はありません。</p>
        ) : (
          <div className="space-y-2">
            {history.map((item, index) => (
              <button
                key={`${item.playerName}-${item.gender}-${item.birthDate}-${item.course}-${item.season}-${item.searchedAt}-${index}`}
                type="button"
                onClick={() => onHistoryClick(item)}
                className="w-full rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-left hover:bg-zinc-100"
              >
                <p className="text-sm font-medium">
                  選手名: {item.playerName === "" ? "未入力" : item.playerName} / {GENDER_LABELS[item.gender]} /{" "}
                  {item.birthDate} / 標準記録のプール長: {COURSE_LABELS[item.course]} / 年度:{" "}
                  {item.season === "" ? "最新年度" : item.season}
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  検索日時: {formatSearchedAt(item.searchedAt)}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>
    </form>
  );
}
