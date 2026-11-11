'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconoSeguridad } from '@/components/iconos';

/**
 * Botón flotante de Seguridad, visible en todas las pantallas de la app (menos en Seguridad).
 * Se posiciona dentro de la columna de contenido, así nunca tapa la barra de navegación.
 */
export default function BotonSeguridadFlotante() {
  const pathname = usePathname() ?? '';
  if (pathname === '/seguridad' || pathname.startsWith('/seguridad/')) return null;

  // En un chat abierto sube un poco para no tapar el botón de enviar.
  const enChat = pathname.startsWith('/chat/');

  return (
    <Link
      href="/seguridad"
      aria-label="Seguridad"
      className={`absolute right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-vela-safety text-white shadow-lg ring-2 ring-vela-bg transition-transform active:scale-95 ${
        enChat ? 'bottom-24' : 'bottom-4'
      }`}
    >
      <IconoSeguridad size={26} stroke={2} aria-hidden="true" />
    </Link>
  );
}