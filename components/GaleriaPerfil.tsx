'use client';

import { useRef, useState } from 'react';
import FotoAjustada from '@/components/FotoAjustada';

/**
 * components/GaleriaPerfil.tsx
 * Carrusel de todas las fotos del perfil. Debe ir dentro de un contenedor "relative" con alto fijo.
 * Se navega deslizando, tocando el lado izquierdo/derecho de la foto, o con las flechas.
 */
export default function GaleriaPerfil({ fotos, colorFondo }: { fotos: string[]; colorFondo: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);

  if (fotos.length === 0) {
    return <div className="absolute inset-0" style={{ backgroundColor: colorFondo }} />;
  }

  function alScrollear() {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    setActual(Math.round(el.scrollLeft / el.clientWidth));
  }

  function ir(i: number) {
    const el = scroller.current;
    if (!el) return;
    const destino = Math.max(0, Math.min(fotos.length - 1, i));
    el.scrollTo({ left: destino * el.clientWidth, behavior: 'smooth' });
  }

  // Tocar el lado izquierdo (40%) retrocede, el derecho (40%) avanza; el centro no hace nada.
  // Deslizar con el dedo sigue funcionando porque el toque se escucha sobre el mismo carrusel.
  function alTocar(e: React.MouseEvent<HTMLDivElement>) {
    if (fotos.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.4) ir(actual - 1);
    else if (x > rect.width * 0.6) ir(actual + 1);
  }

  return (
    <div className="absolute inset-0">
      <div
        ref={scroller}
        onScroll={alScrollear}
        onClick={alTocar}
        className="flex h-full w-full overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {fotos.map((f, i) => (
          <div key={`${f}-${i}`} className="relative flex-none w-full h-full snap-center">
            <FotoAjustada src={f} />
          </div>
        ))}
      </div>

      {fotos.length > 1 && (
        <>
          <div className="absolute top-16 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
            {fotos.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === actual ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`}
              />
            ))}
          </div>
          {actual > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); ir(actual - 1); }}
              aria-label="Foto anterior"
              className="flex absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 z-10 text-white items-center justify-center"
            >‹</button>
          )}
          {actual < fotos.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); ir(actual + 1); }}
              aria-label="Foto siguiente"
              className="flex absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 z-10 text-white items-center justify-center"
            >›</button>
          )}
        </>
      )}
    </div>
  );
}