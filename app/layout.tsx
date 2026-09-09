import type { Metadata } from "next";
import { Sora } from "next/font/google";
import { ThemeToggle } from "./components/theme-toggle";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SyncPlay",
  description: "Watch, talk, and play together in sync.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
