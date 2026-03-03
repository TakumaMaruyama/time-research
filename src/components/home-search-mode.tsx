"use client";

import { useState } from "react";

import { SearchForm } from "@/components/search-form";
import { JSF_QUALIFICATION_URL } from "@/lib/qualification";

type SearchMode = "standard" | "qualification";

const MODE_LABELS: Record<SearchMode, string> = {
  standard: "標準記録検索",
  qualification: "資格級",
};

export function HomeSearchMode() {
  const [mode, setMode] = useState<SearchMode>("standard");

  return (
    <section className="space-y-4">
      <div className="inline-flex rounded-md border border-zinc-300 bg-white p-1">
        {(["standard", "qualification"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`rounded px-3 py-1.5 text-sm transition-colors ${
              mode === value
                ? "bg-zinc-900 text-white"
                : "text-zinc-700 hover:bg-zinc-100"
            }`}
            aria-pressed={mode === value}
          >
            {MODE_LABELS[value]}
          </button>
        ))}
      </div>

      {mode === "standard" ? (
        <SearchForm />
      ) : (
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">資格級検索（公式サイト）</h2>
          <p className="text-sm text-zinc-700">
            日本水泳連盟の資格級は公式ページで最新情報を確認してください。
          </p>
          <a
            href={JSF_QUALIFICATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            日本水泳連盟 資格級ページを開く
          </a>
          <p className="break-all text-xs text-zinc-600">{JSF_QUALIFICATION_URL}</p>
        </div>
      )}
    </section>
  );
}
