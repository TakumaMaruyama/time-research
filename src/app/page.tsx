import Link from "next/link";

import { HomeSearchMode } from "@/components/home-search-mode";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl p-6">
      <h1 className="mb-2 text-2xl font-bold">標準記録検索アプリ</h1>
      <p className="mb-6 text-sm text-zinc-700">
        標準記録検索と資格級確認を切り替えて利用できます。
      </p>
      <HomeSearchMode />
      <Link
        href="/admin/import"
        className="fixed bottom-4 right-4 text-xs text-zinc-400 transition-colors hover:text-zinc-600"
      >
        管理者ログイン
      </Link>
    </main>
  );
}
