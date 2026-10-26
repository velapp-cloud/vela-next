'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { prepararImagen, FORMATOS_TEXTO } from '@/lib/utils/imagenes';
import BotonesFoto from '@/components/BotonesFoto';
import FotoAjustada from '@/components/FotoAjustada';

/**
 * components/EditorFotos.tsx
 * Editor de fotos del perfil: agregar (cámara/galería), quitar y reordenar.
 * La foto en la posición 0 es la principal (la que se ve en Explorar).
 * Reordenar: arrastrar (computadora) o botones ★ / ◀ ▶ (celular).
 */
export default function EditorFotos({
  userId,
  fotos,
  onChange,
  limite,
  minimo,
}: {
  userId: string;
  fotos: string[];
  onChange: (fotos: string[]) => void;
  limite: number;
  minimo: number;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const fotosRef = useRef(fotos);
  fotosRef.current = fotos;

  async function agregar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || fotos.length >= limite) return;
    setSubiendo(true);
    setError('');

    const r = await prepararImagen(file, 'perfil');
    if (!r.ok) {
      setError(r.error);
      setSubiendo(false);
      return;
    }

    const supabase = createClient();
    const path = `${userId}/${Date.now()}-${r.archivo.name}`;
    const { error: upErr } = await supabase.storage.from('fotos-perfil').upload(path, r.archivo);
    URL.revokeObjectURL(r.vistaPrevia);
    setSubiendo(false);

    if (upErr) {
      console.error('Error subiendo foto:', upErr);
      setError('No se pudo subir la foto. Intenta de nuevo.');
      return;
    }
    const { data } = supabase.storage.from('fotos-perfil').getPublicUrl(path);
    onChange([...fotosRef.current, data.publicUrl]);
  }

  function mover(de: number, a: number) {
    if (de === a || a < 0 || a >= fotos.length) return;
    const copia = [...fotos];
    const [item] = copia.splice(de, 1);
    copia.splice(a, 0, item);
    onChange(copia);
  }

  function quitar(i: number) {
    onChange(fotos.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <p className="text-xs font-semibold text-vela-text-faint mb-1">
        Fotos ({fotos.length}/{limite})
      </p>
      <p className="text-[11px] text-vela-text-faint mb-2 leading-relaxed">
        La primera foto es tu principal y es la que se ve en Explorar. Arrástrala o toca ★ para cambiarla.
        Formatos: {FORMATOS_TEXTO}; Vela las ajusta solas.
      </p>

      {error !== '' && <p className="text-xs text-vela-safety mb-2">{error}</p>}

      <div className="grid grid-cols-3 gap-2">
        {fotos.map((f, i) => (
          <div
            key={`${f}-${i}`}
            draggable
            onDragStart={() => setArrastrando(i)}
            onDragOver={(e) => { e.preventDefault(); if (sobre !== i) setSobre(i); }}
            onDragLeave={() => setSobre((s) => (s === i ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              if (arrastrando !== null) mover(arrastrando, i);
              setArrastrando(null);
              setSobre(null);
            }}
            onDragEnd={() => { setArrastrando(null); setSobre(null); }}
            className={`flex flex-col gap-1 ${arrastrando === i ? 'opacity-40' : ''}`}
          >
            <div
              className={`relative aspect-[4/5] rounded-lg overflow-hidden border cursor-grab ${
                sobre === i && arrastrando !== null && arrastrando !== i
                  ? 'border-vela-public border-2'
                  : i === 0
                    ? 'border-vela-public'
                    : 'border-vela-line'
              }`}
            >
              <FotoAjustada src={f} />
              {i === 0 && (
                <span className="absolute left-1 bottom-1 text-[9px] font-bold bg-vela-public text-white rounded-full px-1.5 py-0.5">
                  Principal
                </span>
              )}
              <button
                type="button"
                onClick={() => quitar(i)}
                aria-label="Quitar foto"
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-vela-safety text-white text-[10px] flex items-center justify-center"
              >✕</button>
            </div>

            <div className="flex items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => mover(i, i - 1)}
                disabled={i === 0}
                aria-label="Mover antes"
                className="w-6 h-6 rounded-md bg-vela-surface-2 text-vela-text-dim text-xs disabled:opacity-30"
              >◀</button>
              <button
                type="button"
                onClick={() => mover(i, 0)}
                disabled={i === 0}
                className="flex-1 h-6 rounded-md bg-vela-surface-2 text-[10px] font-bold text-vela-public disabled:opacity-30"
              >★ Principal</button>
              <button
                type="button"
                onClick={() => mover(i, i + 1)}
                disabled={i === fotos.length - 1}
                aria-label="Mover después"
                className="w-6 h-6 rounded-md bg-vela-surface-2 text-vela-text-dim text-xs disabled:opacity-30"
              >▶</button>
            </div>
          </div>
        ))}

        {fotos.length < limite && (
          <div className="aspect-[4/5] rounded-lg border-2 border-dashed border-vela-line-strong flex flex-col items-center justify-center gap-1.5 text-vela-text-faint text-[11px] text-center px-1">
            <span>{subiendo ? 'Procesando...' : '+ Agregar'}</span>
            <BotonesFoto onChange={agregar} disabled={subiendo} facing="user" compacto />
          </div>
        )}
      </div>

      {fotos.length < minimo && (
        <p className="text-[11px] text-vela-amber mt-2">Necesitas al menos {minimo} fotos.</p>
      )}
    </div>
  );
}