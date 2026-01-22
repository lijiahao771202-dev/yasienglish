import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeepSeek IELTS Flow",
  description: "Acquire in Context, Internalize by Speech, Consolidate by Output.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
