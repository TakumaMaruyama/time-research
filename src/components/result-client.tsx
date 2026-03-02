"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { parseIsoDateOnly } from "@/lib/date";
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
  meet_metadata: Record<string, unknown> | null;
  items: Array<{ event_code: string; time: string }>;
};

type SearchApiResponse = {
  age: number;
  season: number;
  course: Course;
  gender: "M" | "F";
  results: Record<StandardLevel, SearchMeetResult[]>;
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

function isCourse(value: string | null): value is Course {
  return value !== null && COURSES.includes(value as Course);
}

function isGender(value: string | null): value is "M" | "F" {
  return value !== null && GENDERS.includes(value as "M" | "F");
}

export function ResultClient() {
  const params = useSearchParams();

  const requestPayload = useMemo(() => {
    const gender = params.get("gender");
    const birthDate = params.get("birthDate");
    const course = params.get("course");
    const seasonRaw = params.get("season");

    if (!isGender(gender)) {
      return { error: "gender が不正です。" };
    }

    if (!birthDate || !parseIsoDateOnly(birthDate)) {
      return { error: "birthDate が不正です。" };
    }

    if (!isCourse(course)) {
      return { error: "course が不正です。" };
    }

    let season: number | null = null;
    if (seasonRaw && seasonRaw.trim() !== "") {
      const seasonNumber = Number.parseInt(seasonRaw, 10);
      if (!/^\d{4}$/.test(seasonRaw) || seasonNumber < 1900 || seasonNumber > 3000) {
        return { error: "season が不正です。" };
      }
      season = seasonNumber;
    }

    return {
      payload: {
        gender,
        birthDate,
        course,
        season,
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
              <span className="font-medium">算出年齢:</span> {data.age} 歳
            </p>
            <p>
              <span className="font-medium">年度:</span> {data.season}
            </p>
            <p>
              <span className="font-medium">性別:</span> {data.gender}
            </p>
            <p>
              <span className="font-medium">プール:</span> {COURSE_LABELS[data.course]}
            </p>
          </div>

          <div className="space-y-6">
            {STANDARD_LEVELS.map((level) => {
              const meets = data.results[level];
              return (
                <section key={level} className="rounded border border-zinc-200 bg-white p-4">
                  <h2 className="mb-3 text-lg font-semibold">{LEVEL_LABELS[level]}</h2>
                  {meets.length === 0 ? (
                    <p className="text-sm text-zinc-600">該当なし</p>
                  ) : (
                    <div className="space-y-5">
                      {meets.map((meet) => (
                        <div key={meet.meet_id} className="rounded border border-zinc-200 p-3">
                          <h3 className="text-base font-semibold">{meet.meet_name}</h3>
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
                                  <th className="py-2">標準記録</th>
                                </tr>
                              </thead>
                              <tbody>
                                {meet.items.map((row, index) => (
                                  <tr
                                    key={`${meet.meet_id}-${row.event_code}-${index}`}
                                    className="border-b border-zinc-100"
                                  >
                                    <td className="py-2 pr-3">{formatEventCodeLabel(row.event_code)}</td>
                                    <td className="py-2">{row.time}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      ) : null}
    </>
  );
}
