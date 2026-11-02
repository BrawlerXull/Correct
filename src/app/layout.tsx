import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { PrefsProvider } from "@/lib/prefs";

const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif", weight: ["400", "500", "600"], style: ["normal", "italic"] });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "CORRECT · colour-correction coach",
  description:
    "Cancel the colour, not your skin. CORRECT reads redness, dark circles and dark spots with YouCam Skin AI, picks the corrector shade for your depth and undertone, and shows the result on your own face.",
  applicationName: "CORRECT",
  appleWebApp: { capable: true, title: "CORRECT", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FBF7F2",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply saved text-size / contrast before first paint (no flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=JSON.parse(localStorage.getItem("correct-prefs-v1")||"{}");var h=document.documentElement;if(p.textSize)h.dataset.textsize=p.textSize;if(p.contrast)h.dataset.contrast=p.contrast;if(p.lang)h.lang=p.lang}catch(e){}`,
          }}
        />
      </head>
      <body className={`${serif.variable} ${sans.variable} font-sans bg-cream text-ink antialiased`}>
        <PrefsProvider>{children}</PrefsProvider>
      </body>
    </html>
  );
}
