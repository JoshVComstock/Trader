import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { Providers } from "@/components/app/providers";
import { PRIVACY_COOKIE, parsePrivacy } from "@/lib/privacy";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Racha", template: "%s · Racha" },
  description: "Bitácora de trading para índices sintéticos Boom y Crash.",
  applicationName: "Racha",
  appleWebApp: { capable: true, title: "Racha", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#14151c" },
    { media: "(prefers-color-scheme: light)", color: "#fafafc" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const privacy = parsePrivacy(jar.get(PRIVACY_COOKIE)?.value);

  return (
    <html
      lang="es"
      suppressHydrationWarning
      style={{ colorScheme: theme }}
      className={`${theme}${privacy ? " privacy" : ""} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
