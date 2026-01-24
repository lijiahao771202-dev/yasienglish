import type { Metadata } from "next";
import { inter, merriweather, lora, roboto_mono, libre_baskerville, source_serif_4, work_sans, comic_neue, newsreader } from "@/lib/fonts";
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
      <body className={`${inter.variable} ${merriweather.variable} ${lora.variable} ${roboto_mono.variable} ${libre_baskerville.variable} ${source_serif_4.variable} ${work_sans.variable} ${comic_neue.variable} ${newsreader.variable} antialiased font-sans`}>
        {children}
      </body>
    </html>
  );
}
