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
          <footer className="border-t border-zinc-200 px-6 pt-4 pb-12 text-center text-xs text-zinc-500 sm:pb-6">
            作成者Instagram:{" "}
            <a
              href="https://www.instagram.com/mrswim_kagoshima/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-zinc-400 underline-offset-2 transition-colors hover:text-zinc-700"
            >
              @mrswim_kagoshima
            </a>
          </footer>
        </div>
      </body>
    </html>
  );
}
