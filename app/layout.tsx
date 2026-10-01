import type { Metadata } from "next";
import "./globals.css";
import "./showcase.css";

export const metadata: Metadata = {
  title: "鼎立车眷 · 汽车内饰与日常",
  description: "把材质、配色与细节，放进每一天的出行。探索鼎立车眷的汽车内饰与生活小物。",
  icons: {
    icon: "/brand/dc-logo.svg",
    shortcut: "/brand/dc-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
