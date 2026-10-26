'use client';

/**
 * components/AppHeader.tsx
 *
 * Barra superior fija (sticky) que envuelve la campanita de
 * notificaciones. Antes NotificacionesBell se renderizaba suelta dentro
 * de cada página, así que al hacer scroll se quedaba atrás o se perdía.
 * Ahora vive en un header "sticky top-0" dentro del layout compartido
 * de app/(app)/layout.tsx, así que se mantiene visible y en la misma
 * posición sin importar cuánto scroll hagas, en cualquier módulo.
 */

import NotificacionesBell from './NotificacionesBell';

export default function AppHeader({ titulo }: { titulo?: string }) {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
      <span className="text-base font-extrabold italic text-text">{titulo ?? 'Vela'}</span>
      <NotificacionesBell />
    </header>
  );
}