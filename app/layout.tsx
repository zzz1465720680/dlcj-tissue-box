import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "鼎立车眷 · 定制工坊",
  description: "从一张皮料开始，设计你的专属纸巾盒。材质、配色、打孔、图案与侧标，实时 3D 预览。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
