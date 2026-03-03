"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  COMPARE_AGE_OPTIONS,
  formatCompareAgeLabel,
  type CompareAgeOption,
} from "@/lib/compare-age";
import {
  COURSE_ANY_DESCRIPTION,
} from "@/lib/course-label";
import { GENDERS } from "@/lib/domain";
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

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};

  if (values.playerName.trim().length > 50) {
    errors.playerName = "選手名は50文字以内で入力してください。";
  }

  if (values.targetAges.length === 0) {
    errors.targetAges = "検索したい年齢を1つ以上選択してください。";
  }

  return errors;
}

function buildSearchQuery(values: FormValues): URLSearchParams {
  const query = new URLSearchParams({
    gender: values.gender,
    targetAges: values.targetAges.join(","),
  });

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
      return { ...loaded, course: "ANY", season: "" };
    }
    return {
      playerName: "",
      gender: "M",
      course: "ANY",
      season: "",
      targetAges: [],
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

  const toggleTargetAge = (targetAge: CompareAgeOption) => {
    const exists = values.targetAges.includes(targetAge);
    const nextAges = exists
      ? values.targetAges.filter((item) => item !== targetAge)
      : [...values.targetAges, targetAge].sort((a, b) => a - b);
    setField("targetAges", nextAges);
  };

  const pushToResult = (input: FormValues) => {
    router.push(`/result?${buildSearchQuery(input).toString()}`);
  };

  const persistSearchInput = (input: FormValues) => {
    const normalizedInput = { ...input, season: "" };
    writeLastSearchInput(normalizedInput);
    setHistory(upsertSearchHistory(normalizedInput));
  };

  const onHistoryClick = (item: SearchHistoryItem) => {
    const input: FormValues = {
      playerName: item.playerName,
      gender: item.gender,
      course: "ANY",
      season: "",
      targetAges: item.targetAges,
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

      <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2">
        <p className="text-sm font-medium">プール長</p>
        <p className="mt-1 text-xs text-zinc-600">
          検索時の選択は不要です。短水路・長水路・共通をまとめて表示します。
        </p>
        <p className="mt-1 text-xs text-zinc-600">{COURSE_ANY_DESCRIPTION}</p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">検索したい年齢（必須）</label>
        <div className="flex flex-wrap gap-2">
          {COMPARE_AGE_OPTIONS.map((targetAge) => (
            <label
              key={targetAge}
              className="inline-flex cursor-pointer items-center gap-1 rounded border border-zinc-300 px-2 py-1 text-sm"
            >
              <input
                type="checkbox"
                checked={values.targetAges.includes(targetAge)}
                onChange={() => toggleTargetAge(targetAge)}
              />
              {formatCompareAgeLabel(targetAge)}
            </label>
          ))}
        </div>
        {errors.targetAges ? <p className="mt-1 text-sm text-red-600">{errors.targetAges}</p> : null}
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
                key={`${item.playerName}-${item.gender}-${item.course}-${item.season}-${item.searchedAt}-${index}`}
                type="button"
                onClick={() => onHistoryClick(item)}
                className="w-full rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-left hover:bg-zinc-100"
              >
                <p className="text-sm font-medium">
                  選手名: {item.playerName === "" ? "未入力" : item.playerName} / {GENDER_LABELS[item.gender]} /
                  全プール長
                  {item.targetAges.length > 0
                    ? ` / 検索年齢: ${item.targetAges.map((value) => formatCompareAgeLabel(value)).join(", ")}`
                    : ""}
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
