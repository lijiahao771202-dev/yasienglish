import type { Metadata } from "next";
import Script from "next/script";
import { AuthSyncProvider } from "@/components/auth/AuthSyncProvider";
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
    <html lang="en" data-hydrated="0" suppressHydrationWarning>
        <body className={`${inter.variable} ${merriweather.variable} ${lora.variable} ${roboto_mono.variable} ${libre_baskerville.variable} ${source_serif_4.variable} ${work_sans.variable} ${comic_neue.variable} ${newsreader.variable} antialiased font-sans`}>
        <Script id="liquid-glass-hydration-guard" strategy="beforeInteractive">
          {`document.documentElement.setAttribute("data-hydrated","1");`}
        </Script>
        <AuthSyncProvider initialUser={null}>
          {children}
        </AuthSyncProvider>
      </body>
    </html>
  );
}
