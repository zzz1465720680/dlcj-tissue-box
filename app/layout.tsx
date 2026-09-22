import type { Metadata } from "next";
import "./globals.css";
import "./showcase.css";

export const metadata: Metadata = {
  title: "鼎立车眷 · 车载纸巾盒",
  description: "小物，也有讲究。探索鼎立车眷白色撞色系列车载纸巾盒，从材质、配色到图案，定制你的日常。",
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
