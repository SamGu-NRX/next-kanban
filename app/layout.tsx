import React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // We'll create this next
import { ThemeProvider } from "@/components/theme-provider"; // Assuming components move to root

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kanban Board",
  description: "A Kanban board built with Next.js, dnd-kit, and shadcn/ui",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
