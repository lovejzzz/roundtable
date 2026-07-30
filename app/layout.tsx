import type { Metadata } from "next";
import { headers } from "next/headers";
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

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const previewUrl = new URL("/og.png", baseUrl).toString();

  return {
    metadataBase: baseUrl,
    title: "Roundtable — Codex, Claude, and Antigravity",
    description:
      "A live project discussion between Codex CLI, Claude CLI, and Antigravity CLI, with you setting the direction.",
    openGraph: {
      title: "Roundtable",
      description: "Three agents. One project. You set the direction.",
      type: "website",
      images: [{ url: previewUrl, width: 1200, height: 630, alt: "Roundtable" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Roundtable",
      description: "Three agents. One project. You set the direction.",
      images: [previewUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
