"use client";

// SCAN-P7-19: last-resort page for a failure in the root layout itself. It
// replaces the whole page, so it carries its own <html> and plain inline
// styles (the app's stylesheet may not be available here).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#1f2933",
        }}
      >
        <h1 style={{ fontSize: 18, margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: 380, fontSize: 14, margin: 0, color: "#52606d" }}>
          Invento could not load this page. Try again, and if the problem comes back, tell your
          administrator{error.digest ? ` and quote the code ${error.digest}` : ""}.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => reset()}
            style={{
              background: "#1f6f4e",
              color: "#fff",
              border: 0,
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {/* A plain link on purpose: the router may be what failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ padding: "8px 16px", fontSize: 14, color: "#1f6f4e" }}>
            Go to Dashboard
          </a>
        </div>
      </body>
    </html>
  );
}
