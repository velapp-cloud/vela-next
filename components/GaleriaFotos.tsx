'use client';

import { useEffect, useState } from 'react';

/**
 * components/GaleriaFotos.tsx
 * Galería tipo Tinder. Se coloca DENTRO de un contenedor "relative" con tamaño
 * (ocupa todo el contenedor). Toca la mitad derecha = siguiente foto,
 * mitad izquierda = foto anterior. Si solo hay 1 foto no muestra nada extra.
 *
 * IMPORTANTE: ponla como PRIMER hijo del contenedor y a los elementos que
 * van encima (degradados, textos) agrégales "pointer-events-none"; los
 * botones encima sí deben recibir clics normalmente.
 */
export default function GaleriaFotos({
  fotos,
  colorFondo,
}: {
  fotos: string[];
  colorFondo: string;
}) {
  const [indice, setIndice] = useState(0);
  const total = fotos.length;
  const clave = fotos.join('|');

  useEffect(() => {
    setIndice(0);
  }, [clave]);

  function siguiente() {
    setIndice((i) => Math.min(i + 1, total - 1));
  }
  function anterior() {
    setIndice((i) => Math.max(i - 1, 0));
  }

  return (
    <div className="absolute inset-0">
      {total > 0 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={fotos[indice]}
          src={fotos[indice]}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-cover"
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: colorFondo }} />
      )}

      {total > 1 && (
        <>
          <div className="pointer-events-none absolute left-3 right-3 top-1.5 flex gap-1">
            {fotos.map((_, i) => (
              <span
                key={i}
                className={`h-[3px] flex-1 rounded-full ${i === indice ? 'bg-white' : 'bg-white/35'}`}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={anterior}
            className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
          />
          <button
            type="button"
            aria-label="Foto siguiente"
            onClick={siguiente}
            className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
          />
        </>
      )}
    </div>
  );
}