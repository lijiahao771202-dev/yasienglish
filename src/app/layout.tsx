import type { Metadata } from "next";
import { AuthSyncProvider } from "@/components/auth/AuthSyncProvider";
import { inter, merriweather, lora, roboto_mono, libre_baskerville, source_serif_4, work_sans, comic_neue, newsreader } from "@/lib/fonts";
import { createServerClient } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeepSeek IELTS Flow",
  description: "Acquire in Context, Internalize by Speech, Consolidate by Output.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body className={`${inter.variable} ${merriweather.variable} ${lora.variable} ${roboto_mono.variable} ${libre_baskerville.variable} ${source_serif_4.variable} ${work_sans.variable} ${comic_neue.variable} ${newsreader.variable} antialiased font-sans`}>
        <AuthSyncProvider initialUserId={user?.id ?? null}>
          {children}
        </AuthSyncProvider>
      </body>
    </html>
  );
}
