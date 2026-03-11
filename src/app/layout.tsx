import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Neural Notebook - AI-Powered Knowledge Canvas",
  description: "Ein unendlicher Canvas für dein Wissen. Mischung aus Notion, NotebookLM und Freeforms mit AI-Integration.",
  keywords: ["Neural Notebook", "Knowledge Management", "Canvas", "AI", "Ollama", "Notion Alternative", "NotebookLM"],
  authors: [{ name: "Neural Notebook Team" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Neural Notebook",
    description: "AI-Powered Knowledge Canvas",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
