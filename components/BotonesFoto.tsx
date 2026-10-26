'use client';

/**
 * components/BotonesFoto.tsx
 * Botones "Tomar foto" y "Galería".
 *
 * - Celular/tablet: "Tomar foto" abre la cámara nativa (input con capture).
 * - Computadora: abre una ventana con la cámara web (getUserMedia) para capturar la foto.
 *   Si no hay cámara o se niega el permiso, se avisa y se abre el selector de archivos.
 *
 * Llama a onChange con un evento que trae target.files, igual que un <input type="file">.
 * facing: 'user' = cámara frontal (selfie), 'environment' = cámara trasera (documentos, fotos).
 *
 * Solo se aceptan archivos JPG y PNG. Se revisa el contenido real del archivo (sus primeros bytes),
 * no el nombre ni el tipo que declara el navegador, así que un archivo de otro formato renombrado
 * a .jpg también se rechaza.
 */
import { useEffect, useRef, useState } from 'react';

function esDispositivoTactil(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const movil = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
  const tactil = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return movil || tactil;
}

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** true solo si el archivo es realmente un JPG o un PNG (por su firma de bytes). */
async function esJpgOPng(file: File): Promise<boolean> {
  try {
    const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const jpg = b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const png = b.length >= 8 && FIRMA_PNG.every((byte, i) => b[i] === byte);
    return jpg || png;
  } catch {
    return false;
  }
}

export default function BotonesFoto({
  onChange,
  disabled = false,
  facing = 'environment',
  compacto = false,
}: {
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  facing?: 'user' | 'environment';
  compacto?: boolean;
}) {
  const [tactil, setTactil] = useState<boolean | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTactil(esDispositivoTactil());
  }, []);

  const base = compacto ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2.5 text-xs';
  const clase = `${base} rounded-full font-bold border border-vela-public text-vela-public cursor-pointer text-center select-none ${
    disabled ? 'opacity-50 pointer-events-none' : ''
  }`;

  async function alSeleccionar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMensaje('');
    if (!(await esJpgOPng(file))) {
      setMensaje('Solo se permiten fotos en formato JPG o PNG. Elige otra imagen.');
      return;
    }
    entregarArchivo(file);
  }

  function entregarArchivo(file: File) {
    const dt = new DataTransfer();
    dt.items.add(file);
    const target = { files: dt.files, value: '' };
    onChange({ target, currentTarget: target } as unknown as React.ChangeEvent<HTMLInputElement>);
  }

  function abrirCamaraWeb() {
    if (disabled) return;
    setMensaje('');
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMensaje('Tu navegador no permite usar la cámara. Elige una foto de tu equipo.');
      inputArchivoRef.current?.click();
      return;
    }
    setAbierta(true);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className={`flex ${compacto ? 'flex-col' : 'flex-row'} gap-2 items-stretch`}>
        {tactil === false ? (
          <button type="button" onClick={abrirCamaraWeb} disabled={disabled} className={clase}>
            📷 Tomar foto
          </button>
        ) : (
          <label className={clase}>
            📷 Tomar foto
            <input
              type="file"
              accept="image/jpeg,image/png"
              capture={facing}
              className="hidden"
              onChange={alSeleccionar}
              disabled={disabled}
            />
          </label>
        )}
        <label className={clase}>
          🖼️ Galería
          <input
            ref={inputArchivoRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={alSeleccionar}
            disabled={disabled}
          />
        </label>
      </div>
      {mensaje !== '' && <p className="text-[11px] text-vela-amber">{mensaje}</p>}

      {abierta && (
        <CamaraWeb
          facing={facing}
          onCapturar={(file) => { setAbierta(false); entregarArchivo(file); }}
          onCerrar={() => setAbierta(false)}
          onSinCamara={(texto) => {
            setAbierta(false);
            setMensaje(texto);
            inputArchivoRef.current?.click();
          }}
        />
      )}
    </div>
  );
}

function CamaraWeb({ facing, onCapturar, onCerrar, onSinCamara }: {
  facing: 'user' | 'environment';
  onCapturar: (file: File) => void;
  onCerrar: () => void;
  onSinCamara: (texto: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [lista, setLista] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setLista(true);
        }
      } catch (err: any) {
        if (cancelado) return;
        const nombre = err?.name ?? '';
        if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
          onSinCamara('No diste permiso a la cámara. Actívalo en el candado de la barra de direcciones, o elige una foto de tu equipo.');
        } else if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') {
          onSinCamara('No encontramos una cámara en este equipo. Elige una foto de tu equipo.');
        } else {
          onSinCamara('No se pudo abrir la cámara. Elige una foto de tu equipo.');
        }
      }
    })();
    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  function capturar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // La vista previa de la selfie se ve en espejo, pero la foto se guarda al derecho.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapturar(file);
      },
      'image/jpeg',
      0.92,
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-vela-bg border border-vela-line rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-vela-line">
          <p className="text-sm font-bold text-vela-text">Tomar foto</p>
          <button type="button" onClick={onCerrar} className="w-8 h-8 rounded-full bg-vela-surface-2 text-vela-text-dim">✕</button>
        </div>
        <div className="relative bg-black aspect-[4/3]">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-contain ${facing === 'user' ? '-scale-x-100' : ''}`}
          />
          {!lista && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-xs text-white/80">Abriendo cámara...</p>
            </div>
          )}
        </div>
        <div className="flex gap-3 p-4">
          <button
            type="button"
            onClick={onCerrar}
            className="flex-1 py-3 rounded-full bg-vela-surface-2 border border-vela-line text-vela-text-faint text-sm font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={capturar}
            disabled={!lista}
            className="flex-1 py-3 rounded-full bg-vela-public text-white text-sm font-bold disabled:opacity-50"
          >
            📸 Capturar
          </button>
        </div>
      </div>
    </div>
  );
}