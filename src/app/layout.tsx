import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif", weight: ["400", "500", "600"], style: ["normal", "italic"] });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "CORRECT · colour-correction coach",
  description:
    "Cancel the colour, not your skin. CORRECT reads redness, dark circles and dark spots with YouCam Skin AI, picks the corrector shade for your depth and undertone, and shows the result on your own face.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable} font-sans bg-cream text-ink antialiased`}>{children}</body>
    </html>
  );
}
