import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import AuthGuard from "@/components/AuthGuard";
import FloatingWidgets from "@/components/FloatingWidgets";
import Toaster from "@/components/Toaster";
import SiteFooter from "@/components/SiteFooter";
import UpdateNotifier from "@/components/UpdateNotifier";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MyDrive",
  description: "MyDrive - votre suite de productivite : documents, tables, mindmaps, presentations et photos.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "MyDrive" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthGuard>
          {children}
          <SiteFooter />
          <FloatingWidgets />
          <Toaster />
          <UpdateNotifier />
          <Link
            href="/foldermindmap"
            title="Vue Mindmap des dossiers"
            style={{
              position: "fixed",
              top: 14,
              right: 14,
              zIndex: 50,
              background: "#14532d",
              color: "#4ade80",
              border: "1px solid #22c55e",
              borderRadius: 20,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 2px 8px #00000066",
            }}
          >
            🗺 Mindmap
          </Link>
        </AuthGuard>
      </body>
    </html>
  );
}
