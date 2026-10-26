/**
 * components/FotoAjustada.tsx
 * Foto completa y centrada dentro de su contenedor (el contenedor debe ser "relative").
 * Si la foto no tiene la misma proporción, los lados se rellenan con la misma foto desenfocada.
 */
export default function FotoAjustada({ src, className = '' }: { src: string; className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden bg-black ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain"
      />
    </div>
  );
}