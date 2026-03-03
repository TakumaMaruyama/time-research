import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "標準記録検索アプリ",
  description: "全国・九州・鹿児島県の標準記録を検索/管理するアプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-zinc-50 text-zinc-900 antialiased`}
      >
        <div className="flex min-h-screen flex-col">
          <div className="flex-1">{children}</div>
          <footer className="border-t border-zinc-200 px-6 pt-5 pb-14 sm:pb-8">
            <div className="mx-auto max-w-4xl rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 p-4 shadow-sm">
              <p className="text-sm font-semibold text-zinc-900">更新を見逃したくない方へ</p>
              <p className="mt-1 text-xs text-zinc-700 sm:text-sm">
                作成者Instagramで更新情報や小ネタを先に出すことがあります。フォローしておくと、良いことがあるかもしれません。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href="https://www.instagram.com/mrswim_kagoshima/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-700 sm:text-sm"
                >
                  Instagramをフォローする（@mrswim_kagoshima）
                </a>
                <a
                  href="https://forms.gle/fBPW8WCes37W3beEA"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-100 sm:text-sm"
                >
                  不具合を報告する
                </a>
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-zinc-500">
              Follow:{" "}
              <a
                href="https://www.instagram.com/mrswim_kagoshima/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-zinc-400 underline-offset-2 hover:text-zinc-700"
              >
                @mrswim_kagoshima
              </a>
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
