import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://clearcheck-malta.nicgauci.chatgpt.site"),
  title: "ClearCheck — Sanctions & Public-Record Screening",
  description: "Screen people and businesses across EU and UN sanctions, Maltese court orders and focused web intelligence.",
  openGraph: {
    title: "ClearCheck — Sanctions & Public-Record Screening",
    description: "One search across official sanctions, Maltese court orders and focused web intelligence.",
    images: [{ url: "/og-platform.png", width: 1200, height: 630, alt: "ClearCheck sanctions and public-record screening platform" }],
  },
  twitter: { card: "summary_large_image", images: ["/og-platform.png"] },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html:`(()=>{try{const saved=localStorage.getItem("clearcheck-theme");const theme=saved==="dark"||saved==="light"?saved:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme}catch{document.documentElement.dataset.theme="light"}})()`}}/></head>
      <body><a className="skipLink" href="#main-content">Skip to main content</a><div id="main-content" tabIndex={-1}>{children}</div></body>
    </html>
  );
}
