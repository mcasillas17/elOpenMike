import type { Metadata } from "next";
import { sora, inter } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Miguel Casillas",
  description: "Software Engineer, builder, and stand-up comedian.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable}`}>
      <body className="font-[family-name:var(--font-body)] antialiased">
        {children}
      </body>
    </html>
  );
}
