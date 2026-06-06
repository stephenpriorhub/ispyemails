import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "iSpyFinpub",
  description: "Competitor Email Intelligence",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="h-full bg-gray-950 text-gray-100 antialiased">
        {children}
        <Script
          src="https://oxfordhub.app/hub-nav.js"
          data-project-id="cmq1by18o0002ncdujwyk8b60"
          strategy="afterInteractive"
          id="hub-nav"
        />
      </body>
    </html>
  );
}
