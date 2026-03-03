import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold text-zinc-900">オフラインです</h1>
      <p className="text-sm text-zinc-700">
        ネットワーク接続を確認してから再度お試しください。
      </p>
      <Link
        href="/"
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700"
      >
        ホームへ戻る
      </Link>
    </main>
  );
}
