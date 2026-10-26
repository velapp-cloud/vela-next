'use client';

/**
 * components/SelectorIdiomas.tsx
 * Chips con los idiomas más usados + "Otro" (campo de texto libre).
 * Entrega un texto separado por comas, igual que el campo `idiomas` de siempre.
 */
import { useState } from 'react';

const IDIOMAS_COMUNES = ['Español', 'Inglés', 'Francés', 'Portugués', 'Italiano'];

function parsear(valor: string) {
  const items = valor.split(',').map((s) => s.trim()).filter(Boolean);
  const esComun = (x: string) => IDIOMAS_COMUNES.some((i) => i.toLowerCase() === x.toLowerCase());
  const seleccion = IDIOMAS_COMUNES.filter((i) => items.some((x) => x.toLowerCase() === i.toLowerCase()));
  const otros = items.filter((x) => !esComun(x));
  return { seleccion, otroTexto: otros.join(', '), otroActivo: otros.length > 0 };
}

export default function SelectorIdiomas({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inicial = parsear(value);
  const [seleccion, setSeleccion] = useState<string[]>(inicial.seleccion);
  const [otroActivo, setOtroActivo] = useState(inicial.otroActivo);
  const [otroTexto, setOtroTexto] = useState(inicial.otroTexto);

  function emitir(sel: string[], activo: boolean, texto: string) {
    const otros = activo ? texto.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const ordenados = IDIOMAS_COMUNES.filter((i) => sel.includes(i));
    onChange([...ordenados, ...otros].join(', '));
  }

  function toggleIdioma(i: string) {
    const nueva = seleccion.includes(i) ? seleccion.filter((x) => x !== i) : [...seleccion, i];
    setSeleccion(nueva);
    emitir(nueva, otroActivo, otroTexto);
  }

  function toggleOtro() {
    const activo = !otroActivo;
    setOtroActivo(activo);
    emitir(seleccion, activo, otroTexto);
  }

  function cambiarOtro(texto: string) {
    const limpio = texto.slice(0, 60);
    setOtroTexto(limpio);
    emitir(seleccion, otroActivo, limpio);
  }

  const chip = (activo: boolean) =>
    `px-3 py-2 rounded-full text-xs font-medium border transition ${
      activo
        ? 'bg-vela-public-soft border-vela-public text-vela-public'
        : 'bg-vela-surface-2 border-vela-line text-vela-text-faint'
    }`;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mt-1.5">
        {IDIOMAS_COMUNES.map((i) => (
          <button key={i} type="button" onClick={() => toggleIdioma(i)} className={chip(seleccion.includes(i))}>
            {i}
          </button>
        ))}
        <button type="button" onClick={toggleOtro} className={chip(otroActivo)}>
          Otro
        </button>
      </div>
      {otroActivo && (
        <input
          value={otroTexto}
          onChange={(e) => cambiarOtro(e.target.value)}
          placeholder="Escribe tu idioma (si son varios, sepáralos con coma)"
          className="w-full mt-2.5 bg-vela-surface-2 border border-vela-line rounded-xl px-4 py-3 text-sm text-vela-text outline-none focus:border-vela-public/60"
        />
      )}
    </div>
  );
}