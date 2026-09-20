import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ClauseWise",
    template: "%s | ClauseWise",
  },
  description:
    "AI-powered legal document navigator. Understand, compare, and navigate legal documents in plain English.",
  robots: { index: false, follow: false }, // Private app — do not index
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Root layout — wraps all routes.
 * Auth and app layouts are nested inside their respective route groups.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

