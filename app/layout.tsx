import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
export const metadata: Metadata = { title: "iSpyEmails", description: "Competitor Email Intelligence" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${geist.variable} h-full`}><body className="h-full bg-gray-950 text-gray-100 antialiased">{children}</body></html>;
}
