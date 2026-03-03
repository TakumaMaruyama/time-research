"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  formatCompareAgeLabel,
  normalizeCompareAges,
} from "@/lib/compare-age";
import {
  COURSE_ANY_DESCRIPTION,
  formatCourseStandardRecordLabel,
} from "@/lib/course-label";
import {
  COURSES,
  GENDERS,
  STANDARD_LEVELS,
  type Course,
  type StandardLevel,
} from "@/lib/domain";
import { formatEventCodeLabel } from "@/lib/event";

type SearchMeetResult = {
  meet_id: string;
  meet_name: string;
  meet_season: number;
  meet_course: Course;
  meet_date: string | null;
  meet_date_end: string | null;
  meet_metadata: Record<string, unknown> | null;
  items: Array<{ event_code: string; age: number; time: string }>;
};

type SearchApiResponse = {
  targetAges: number[];
  season: number | null;
  course: Course;
  gender: "M" | "F";
  results: Record<StandardLevel, SearchMeetResult[]>;
};

const LEVEL_LABELS: Record<StandardLevel, string> = {
  national: "全国レベル",
  kyushu: "九州レベル",
  kagoshima: "県レベル",
};

const GENDER_LABELS: Record<"M" | "F", string> = {
  M: "男子",
  F: "女子",
};

function isCourse(value: string | null): value is Course {
  return value !== null && COURSES.includes(value as Course);
}

function isGender(value: string | null): value is "M" | "F" {
  return value !== null && GENDERS.includes(value as "M" | "F");
}

function parseTargetAges(raw: string): number[] | null {
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  const parsed: number[] = [];
  for (const value of values) {
    const age = Number.parseInt(value, 10);
    if (!Number.isInteger(age) || age < 9 || age > 17) {
      return null;
    }
    parsed.push(age);
  }

  return normalizeCompareAges(parsed);
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

export function ResultClient() {
  const params = useSearchParams();

  const requestPayload = useMemo(() => {
    const gender = params.get("gender");
    const course = params.get("course");
    const targetAgesRaw = params.get("targetAges") ?? params.get("compareAges");

    if (!isGender(gender)) {
      return { error: "gender が不正です。" };
    }

    if (!isCourse(course)) {
      return { error: "course が不正です。" };
    }

    if (!targetAgesRaw || targetAgesRaw.trim() === "") {
      return { error: "targetAges が不正です。" };
    }

    const targetAges = parseTargetAges(targetAgesRaw);
    if (targetAges === null || targetAges.length === 0) {
      return { error: "targetAges が不正です。" };
    }

    return {
      payload: {
        gender,
        course,
        season: null,
        targetAges,
      },
    };
  }, [params]);

  const [data, setData] = useState<SearchApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const payload = requestPayload.payload;
    if (!payload) {
      setLoading(false);
      setError(requestPayload.error ?? "入力値が不正です。");
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const responseBody = (await response.json()) as SearchApiResponse | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in responseBody && responseBody.error
              ? responseBody.error
              : "検索に失敗しました。",
          );
        }

        if (!cancelled) {
          setData(responseBody as SearchApiResponse);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "検索に失敗しました。");
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [requestPayload]);

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-bold">検索結果</h1>
        <Link href="/" className="text-sm text-blue-700 underline">
          条件を変更する
        </Link>
      </div>

      {loading ? <p>検索中...</p> : null}
      {error ? <p className="rounded bg-red-50 p-3 text-red-700">{error}</p> : null}

      {data ? (
        <>
          <div className="mb-6 grid gap-2 rounded border border-zinc-200 bg-white p-4 text-sm sm:grid-cols-2">
            <p>
              <span className="font-medium">年度:</span> {data.season === null ? "すべて" : data.season}
            </p>
            <p>
              <span className="font-medium">性別:</span> {GENDER_LABELS[data.gender]}
            </p>
            <p>
              <span className="font-medium">検索対象:</span> {formatCourseStandardRecordLabel(data.course)}
            </p>
            {data.course === "ANY" ? (
              <p className="text-xs text-zinc-600 sm:col-span-2">{COURSE_ANY_DESCRIPTION}</p>
            ) : null}
            <p className="sm:col-span-2">
              <span className="font-medium">検索年齢:</span>{" "}
              {data.targetAges.map((value) => formatCompareAgeLabel(value)).join(", ")}
            </p>
          </div>

          <div className="space-y-6">
            {STANDARD_LEVELS.map((level) => {
              const meets = data.results[level];
              const levelSectionKey = [
                level,
                data.gender,
                data.course,
                data.season === null ? "all" : String(data.season),
                data.targetAges.join(","),
              ].join("|");
              return (
                <details
                  key={levelSectionKey}
                  className="rounded border border-zinc-200 bg-white p-4"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-lg font-semibold">{LEVEL_LABELS[level]}</h2>
                      <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                        {meets.length}件
                      </span>
                    </div>
                  </summary>

                  <div className="mt-3">
                    {meets.length === 0 ? (
                      <p className="text-sm text-zinc-600">該当なし</p>
                    ) : (
                      <div className="space-y-5">
                        {meets.map((meet) => (
                          <details key={meet.meet_id} className="rounded border border-zinc-200">
                            <summary className="cursor-pointer list-none p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-base font-semibold">{meet.meet_name}</h3>
                                <span className="rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                                  {formatCourseStandardRecordLabel(meet.meet_course)}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-zinc-600">
                                標準記録年度: {meet.meet_season} / 大会日付: {formatMeetDateRange(meet.meet_date, meet.meet_date_end)} / 種目数:{" "}
                                {new Set(meet.items.map((item) => item.event_code)).size}
                              </p>
                            </summary>
                            <div className="border-t border-zinc-200 p-3">
                              {meet.meet_metadata ? (
                                <p className="mb-3 mt-1 break-all text-xs text-zinc-600">
                                  metadata: {JSON.stringify(meet.meet_metadata)}
                                </p>
                              ) : null}
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-zinc-200 text-left">
                                      <th className="py-2 pr-3">種目</th>
                                      {data.targetAges.map((targetAge) => (
                                        <th key={`${meet.meet_id}-age-${targetAge}`} className="py-2 pr-3">
                                          {formatCompareAgeLabel(targetAge)}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {Array.from(new Set(meet.items.map((item) => item.event_code))).map(
                                      (eventCode) => {
                                        const byAge = new Map<number, string>();
                                        for (const item of meet.items) {
                                          if (item.event_code === eventCode) {
                                            byAge.set(item.age, item.time);
                                          }
                                        }

                                        return (
                                          <tr
                                            key={`${meet.meet_id}-${eventCode}`}
                                            className="border-b border-zinc-100"
                                          >
                                            <td className="py-2 pr-3">{formatEventCodeLabel(eventCode)}</td>
                                            {data.targetAges.map((targetAge) => (
                                              <td
                                                key={`${meet.meet_id}-${eventCode}-${targetAge}`}
                                                className="py-2 pr-3"
                                              >
                                                {byAge.get(targetAge) ?? "-"}
                                              </td>
                                            ))}
                                          </tr>
                                        );
                                      },
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </>
      ) : null}
    </>
  );
}
