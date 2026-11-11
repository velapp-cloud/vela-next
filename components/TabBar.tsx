'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/session/SessionProvider';
import { useTotalSinLeer } from '@/lib/chats/useTotalSinLeer';
import { useSolicitudesPendientes } from '@/lib/solicitudes/useSolicitudesPendientes';
import {
  IconoExplorar,
  IconoChats,
  IconoEncuentros,
  IconoPerfil,
} from '@/components/iconos';

// Seguridad es el botón flotante rojo y Planes se abre desde la ventana de "mejora tu plan",
// por eso ya no van en la barra.
const TABS: { href: string; label: string; Icono: typeof IconoExplorar }[] = [
  { href: '/explorar', label: 'Vela', Icono: IconoExplorar },
  { href: '/chat', label: 'Chat', Icono: IconoChats },
  { href: '/encuentro', label: 'Encuentro', Icono: IconoEncuentros },
  { href: '/perfil', label: 'Perfil', Icono: IconoPerfil },
];

export default function TabBar() {
  const pathname = usePathname();
  const { perfil } = useSession();
  const sinLeer = useTotalSinLeer(perfil?.id, perfil?.rol as 'cliente' | 'proveedora' | undefined);
  const solicitudes = useSolicitudesPendientes(perfil?.id, pathname);

  return (
    <nav
      className="
        order-last shrink-0 border-t border-vela-line bg-vela-bg flex justify-around items-center py-2 px-1
        pb-[max(0.5rem,env(safe-area-inset-bottom))]
        md:order-first md:h-full md:w-60 md:flex-col md:justify-start md:items-stretch
        md:gap-1 md:border-t-0 md:border-r md:py-6 md:px-3 md:overflow-y-auto
      "
    >
      <Link
        href="/explorar"
        className="hidden md:block px-4 pb-5 font-serif italic text-3xl text-vela-public"
      >
        Vela
      </Link>

      {TABS.map((tab) => {
        const esActual = pathname === tab.href;
        // Chat: número de conversaciones por abrir. Vela: punto si hay solicitudes por revisar.
        const conteo = tab.href === '/chat' ? sinLeer : 0;
        const hayPunto = tab.href === '/explorar' && solicitudes > 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex flex-col items-center justify-center gap-1 px-3 h-14 rounded-xl transition-colors
              md:flex-row md:justify-start md:gap-3 md:px-4 md:h-12 md:hover:bg-vela-surface ${
              esActual ? 'text-vela-public md:bg-vela-public-soft' : 'text-vela-text-faint'
            }`}
          >
            {esActual && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-vela-public md:top-1/2 md:left-0 md:translate-x-0 md:-translate-y-1/2 md:h-6 md:w-0.5" />
            )}
            {/* Caja del mismo tamaño que el ícono: los avisos flotan encima (absolute)
                y nunca mueven el resto del menú. */}
            <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center">
              <tab.Icono size={24} stroke={esActual ? 2 : 1.75} aria-hidden="true" />
              {conteo > 0 && (
                <span
                  aria-label={`${conteo} ${conteo === 1 ? 'chat por abrir' : 'chats por abrir'}`}
                  className="absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-vela-public px-1 text-[9px] font-bold leading-none text-white ring-2 ring-vela-bg"
                >
                  {conteo > 9 ? '9+' : conteo}
                </span>
              )}
              {hayPunto && (
                <span
                  aria-label="Tienes solicitudes por revisar"
                  className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full bg-vela-public ring-2 ring-vela-bg"
                />
              )}
            </span>
            <span className={`text-[10px] md:text-sm ${esActual ? 'font-bold' : 'font-medium'}`}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}