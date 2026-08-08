import type { Metadata } from "next";
import MotionProvider from "@/components/fx/MotionProvider";
import { Inter, Space_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import { themeInitScript } from "@/components/theme/ThemeSwitcher";
import CursorFX from "@/components/cursor/CursorFX";
import SplashCursor from "@/components/cursor/SplashCursor";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lumina — AI Resume Intelligence",
  description:
    "Know if your resume is good enough — before the ATS decides. Free, open-source AI resume analysis, job matching, and skill-gap roadmaps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-mode="dark"
      data-accent="violet"
      className={`${inter.variable} ${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-fg">
        <SplashCursor />
        <CursorFX />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
