import Link from "next/link";

import { AdminImportClient } from "@/components/admin-import-client";

export default function AdminImportPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl p-6">
      <div className="mb-4">
        <Link
          href="/"
          className="inline-flex rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
        >
          トップページへ戻る
        </Link>
      </div>
      <AdminImportClient />
    </main>
  );
}
