import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline · Yasi English",
  description: "You are offline. Reconnect to keep flowing.",
};

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(120% 120% at 70% 20%, #4F46E5 0%, #1E1B4B 55%, #0B1020 100%)",
        color: "#E0E7FF",
        padding: "24px",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <img
          src="/icon.svg"
          alt="Yasi English"
          width={96}
          height={96}
          style={{ borderRadius: 24, boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}
        />
        <h1 style={{ fontSize: 28, marginTop: 24, marginBottom: 8, letterSpacing: -0.4 }}>
          You&apos;re offline
        </h1>
        <p style={{ opacity: 0.8, lineHeight: 1.55, fontSize: 15 }}>
          Reconnect and we&apos;ll resume your flow. Cached pages remain available
          from the home screen.
        </p>
        <a
          href="/"
          style={{
            marginTop: 24,
            display: "inline-block",
            padding: "12px 22px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.12)",
            color: "white",
            textDecoration: "none",
            border: "1px solid rgba(255,255,255,0.18)",
            backdropFilter: "blur(8px)",
          }}
        >
          Try home again
        </a>
      </div>
    </main>
  );
}
