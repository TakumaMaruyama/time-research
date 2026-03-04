"use client";

import { useEffect, useState } from "react";

type CheerStatusResponse = {
  totalCount: number;
  canCheer: boolean;
  today: string;
};

type CheerPostResponse = CheerStatusResponse & {
  accepted: boolean;
};

type ApiErrorResponse = {
  error?: string;
};

const countFormatter = new Intl.NumberFormat("ja-JP");

function getErrorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as ApiErrorResponse).error === "string" &&
    (body as ApiErrorResponse).error
  ) {
    return (body as ApiErrorResponse).error as string;
  }
  return fallback;
}

export function CheerButton() {
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [canCheer, setCanCheer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/cheer", {
          method: "GET",
          cache: "no-store",
        });
        const body = (await response.json()) as CheerStatusResponse | ApiErrorResponse;

        if (!response.ok) {
          throw new Error(getErrorMessage(body, "状態の取得に失敗しました。"));
        }

        if (cancelled) {
          return;
        }

        const data = body as CheerStatusResponse;
        setTotalCount(data.totalCount);
        setCanCheer(data.canCheer);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "状態の取得に失敗しました。",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const onCheerClick = async () => {
    if (!canCheer || submitting || loading) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/cheer", {
        method: "POST",
        cache: "no-store",
      });
      const body = (await response.json()) as CheerPostResponse | ApiErrorResponse;

      if (!response.ok) {
        throw new Error(getErrorMessage(body, "送信に失敗しました。"));
      }

      const data = body as CheerPostResponse;
      setTotalCount(data.totalCount);
      setCanCheer(data.canCheer);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "送信に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  };

  const buttonLabel = loading
    ? "読み込み中..."
    : submitting
      ? "送信中..."
      : canCheer
        ? "頑張ろう"
        : "今日は押しました";

  return (
    <section className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-6">
      <h2 className="text-lg font-semibold text-zinc-900">みんなの頑張り累計</h2>
      <p className="text-3xl font-bold text-emerald-700" aria-live="polite">
        {totalCount === null ? "..." : `${countFormatter.format(totalCount)} 回`}
      </p>
      <p className="text-sm text-zinc-700">1日1回、みんなで積み上げよう</p>
      <button
        type="button"
        onClick={onCheerClick}
        disabled={loading || submitting || !canCheer || totalCount === null}
        className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {buttonLabel}
      </button>
      {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
    </section>
  );
}
