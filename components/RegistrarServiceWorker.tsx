'use client';

import { useEffect } from 'react';

/**
 * components/RegistrarServiceWorker.tsx
 * Como decidimos no usar next-pwa (por las vulnerabilidades de su
 * cadena de dependencias en tiempo de build), el registro del service
 * worker se hace a mano, aqui — se monta una sola vez desde el layout
 * raiz.
 */
export default function RegistrarServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('Error registrando el service worker:', err);
      });
    }
  }, []);

  return null;
}
