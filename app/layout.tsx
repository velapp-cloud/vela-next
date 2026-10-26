import type { Metadata, Viewport } from "next";
import "./globals.css";
import RegistrarServiceWorker from "@/components/RegistrarServiceWorker";
import Analytics from "@/components/Analytics";
import { SessionProvider } from "@/lib/session/SessionProvider";

const SITIO = "https://www.myvelapp.com";
const TITULO = "Vela — Conexiones verificadas y seguras en El Salvador";
const DESCRIPCION =
  "Conoce personas con identidad verificada y protégete en cada encuentro con alertas de seguridad y contactos de emergencia.";

export const metadata: Metadata = {
  metadataBase: new URL(SITIO),
  title: {
    default: TITULO,
    template: "%s | Vela",
  },
  description: DESCRIPCION,
  applicationName: "Vela",
  keywords: [
    "Vela",
    "conexiones verificadas",
    "seguridad",
    "El Salvador",
    "verificación de identidad",
    "citas seguras",
  ],
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  openGraph: {
    type: "website",
    url: SITIO,
    siteName: "Vela",
    locale: "es_SV",
    title: TITULO,
    description: DESCRIPCION,
    // La imagen la toma sola de app/opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: DESCRIPCION,
    // La imagen la toma sola de app/opengraph-image.tsx
  },
};

export const viewport: Viewport = {
  themeColor: "#0D0D0D",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-vela-bg text-vela-text">
        <SessionProvider>{children}</SessionProvider>
        <RegistrarServiceWorker />
        <Analytics />
      </body>
    </html>
  );
}