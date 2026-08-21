import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "1815: Field of Eagles",
  description: "A hex-and-counter Napoleonic wargame",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
