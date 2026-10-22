import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TripMatch — USC Marshall MSBA",
  description: "Find MSBA classmates whose travel plans line up with yours.",
  robots: { index: false, follow: false }, // private pilot
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FBF8F0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Always the light cream theme (the dark tokens in globals.css only apply
    // if this attribute is removed).
    <html lang="en" data-theme="light" style={{ colorScheme: "light" }}>
      <body>{children}</body>
    </html>
  );
}
