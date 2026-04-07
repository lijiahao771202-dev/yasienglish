import type { Metadata } from "next";
import Script from "next/script";
import { AuthSyncProvider } from "@/components/auth/AuthSyncProvider";
import { GlobalSmartTracker } from "@/components/home/GlobalSmartTracker";
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
        <body className={`${inter.variable} ${merriweather.variable} ${lora.variable} ${roboto_mono.variable} ${libre_baskerville.variable} ${source_serif_4.variable} ${work_sans.variable} ${comic_neue.variable} ${newsreader.variable} antialiased font-sans min-h-screen`}>
        <Script id="liquid-glass-hydration-guard" strategy="beforeInteractive">
          {`
            document.documentElement.setAttribute("data-hydrated","1");
            try {
              for (var i = 0; i < window.localStorage.length; i++) {
                 var k = window.localStorage.key(i);
                 if (k && k.indexOf("yasi:bg:") === 0) {
                    var theme = window.localStorage.getItem(k);
                    if (theme) document.documentElement.setAttribute("data-bg-theme", theme);
                 }
              }
            } catch (e) {}
          `}
        </Script>
        <AuthSyncProvider initialUser={null}>
          {children}
          <GlobalSmartTracker />
        </AuthSyncProvider>
      </body>
    </html>
  );
}
