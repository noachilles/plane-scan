import type { Metadata, Viewport } from "next";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlaneScan — 항공권 최저가 감시",
  description: "여행 일정을 등록하면 최저가 항공권을 감시하고, 조건에 맞는 특가가 뜨면 바로 알려드립니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isDev = process.env.NODE_ENV !== "production";
  const source = process.env.FLIGHT_SOURCE ?? "mock";

  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
            <i className="bi bi-airplane-engines text-xl text-blue-600" aria-hidden />
            <span className="text-lg font-bold tracking-tight text-slate-900">
              Plane<span className="text-blue-600">Scan</span>
            </span>
            <span className="hidden text-sm text-slate-500 sm:inline">항공권 최저가 감시</span>
            {isDev && (
              <span className="ml-auto rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                DEV · {source.toUpperCase()}
              </span>
            )}
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
