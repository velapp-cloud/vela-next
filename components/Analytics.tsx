import { GoogleAnalytics, GoogleTagManager } from '@next/third-parties/google';

/**
 * components/Analytics.tsx
 * Carga Google Tag Manager y Google Analytics 4 si sus IDs están definidos
 * en las variables de entorno (si no, no carga nada).
 *
 *   NEXT_PUBLIC_GTM_ID = GTM-XXXXXXX
 *   NEXT_PUBLIC_GA_ID  = G-XXXXXXXXXX
 *
 * Importante: si GA4 se carga aquí, NO agregues otra etiqueta "Configuración
 * de GA4" dentro de GTM con el mismo ID, o cada visita se contará doble.
 */
export default function Analytics() {
  const gtm = process.env.NEXT_PUBLIC_GTM_ID;
  const ga = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <>
      {gtm ? <GoogleTagManager gtmId={gtm} /> : null}
      {ga ? <GoogleAnalytics gaId={ga} /> : null}
    </>
  );
}