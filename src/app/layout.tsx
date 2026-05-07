import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { AuthSyncProvider } from "@/components/auth/AuthSyncProvider";
import { GlobalSmartTracker } from "@/components/home/GlobalSmartTracker";
import { PWARegister } from "@/components/pwa/PWARegister";
import { inter, merriweather, lora, roboto_mono, libre_baskerville, source_serif_4, work_sans, comic_neue, newsreader } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Yasi English — DeepSeek IELTS Flow",
    template: "%s · Yasi English",
  },
  description: "Acquire in Context, Internalize by Speech, Consolidate by Output.",
  applicationName: "Yasi English",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Yasi English",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  // Single theme-color avoids browser swapping the chrome / initial paint
  // background between light and dark, which produces a visible flash.
  themeColor: "#0F172A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
            try {
              // Apply the last-known theme BEFORE flipping data-hydrated.
              // While data-hydrated="0" the body transition is disabled
              // (see globals.css), so this paints instantly without animation.
              var last = null;
              try { last = window.localStorage.getItem("yasi:bg:last"); } catch (e) {}
              if (!last) {
                try {
                  for (var i = 0; i < window.localStorage.length; i++) {
                    var k = window.localStorage.key(i);
                    if (k && k.indexOf("yasi:bg:") === 0) {
                      var v = window.localStorage.getItem(k);
                      if (v) last = v;
                    }
                  }
                } catch (e) {}
              }
              if (last) document.documentElement.setAttribute("data-bg-theme", last);
            } catch (e) {}
            // Defer to the next frame so the theme is committed to the
            // first paint before transitions are unlocked.
            requestAnimationFrame(function() {
              document.documentElement.setAttribute("data-hydrated","1");
            });
          `}
        </Script>
        <AuthSyncProvider initialUser={null}>
          {children}
          <Suspense fallback={null}>
            <GlobalSmartTracker />
          </Suspense>
          <PWARegister />
        </AuthSyncProvider>
      </body>
    </html>
  );
}
