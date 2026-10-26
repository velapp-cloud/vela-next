'use client';

/**
 * app/(app)/explorar/page.tsx
 * Se comporta distinto segun el rol:
 * - cliente: explora perfiles de "quiero ser descubierta" — vista de
 *   tarjeta unica (Basico/Premium) o cuadricula/lista (Gold/VIP).
 *   Las 3 vistas muestran la misma informacion (alias, edad, zona,
 *   estatura, regalo) y los mismos botones: ✕ eliminar y ❤️ me encanta.
 * - proveedor: ve las solicitudes de encuentro que ha recibido.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { CAPACIDADES } from '@/lib/planes/capacidades';
import { CATEGORIAS_CHIPS } from '@/lib/chips/chipsPreferencia';
import { aceptarSolicitud } from '@/lib/citas/aceptarSolicitud';
import { formatoHora12 } from '@/lib/citas/formatoHora';
import { resolverFotoUrl } from '@/lib/perfiles/resolverFoto';
import { descartarPerfil, cerrarChatPorEliminacion } from '@/lib/perfiles/descartarPerfil';
import FotoAjustada from '@/components/FotoAjustada';
import ModalDescartarPerfil from '@/components/ModalDescartarPerfil';
import {
  IconoUbicacion,
  IconoEstatura,
  IconoRegalo,
  IconoEncuentros,
  IconoHora,
  IconoDuracion,
  IconoCerrar,
  IconoCorazon,
} from '@/components/iconos';
import { notificarMeEncanta } from '@/lib/notificaciones/meEncanta';
import { estiloAro, colorAro, ETIQUETA_PLAN } from '@/lib/planes/colorPlan';

type PerfilPublico = {
  id: string;
  alias: string;
  avatar_color: string;
  ciudad: string | null;
  estatura: string | null;
  edad: number | null;
  regalo: string | null;
  fotos: string[] | null;
  foto_url: string | null;
  verificado: boolean;
  calificacion_prom: number | null;
  plan: string;
};

type Vista = 'tarjeta' | 'cuadricula' | 'lista';

// Motivos de rechazo de solicitud. Los marcados como "bloquea" cierran
// permanentemente la posibilidad de que ese cliente vuelva a aparecer
// en el Explorar de la proveedora o le vuelva a enviar solicitudes.
const MOTIVOS_RECHAZO_SOLICITUD: { texto: string; bloquea: boolean }[] = [
  { texto: 'Está ocupada', bloquea: false },
  { texto: 'Quiere cambiar de horario', bloquea: false },
  { texto: 'Quiere cambiar de lugar', bloquea: false },
  { texto: 'No me interesa', bloquea: true },
];

export default function Explorar() {
  const { perfil } = useSession();

  if (!perfil) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-vela-text-faint">Cargando...</p>
      </main>
    );
  }

  return perfil.rol === 'cliente' ? <ExplorarCliente /> : <SolicitudesRecibidas />;
}

/**
 * Las dos líneas de información que se repiten en las 3 vistas:
 * zona + estatura, y el regalo. Solo cambia el tamaño y el color según la vista.
 */
function LineasInfo({ p, tamIcono, claseUbicacion, claseRegalo, textoSinCiudad = '—' }: {
  p: PerfilPublico;
  tamIcono: number;
  claseUbicacion: string;
  claseRegalo: string;
  textoSinCiudad?: string;
}) {
  return (
    <>
      <p className={`flex items-center gap-1.5 min-w-0 ${claseUbicacion}`}>
        <IconoUbicacion size={tamIcono} className="flex-shrink-0" />
        <span className="truncate">{p.ciudad || textoSinCiudad}</span>
        <IconoEstatura size={tamIcono} className="ml-1 flex-shrink-0" />
        <span className="flex-shrink-0">{p.estatura || '—'}</span>
      </p>
      <p className={`flex items-center gap-1.5 min-w-0 ${claseRegalo}`}>
        <IconoRegalo size={tamIcono} className="flex-shrink-0" />
        <span className="truncate">{p.regalo || '—'}</span>
      </p>
    </>
  );
}

function ExplorarCliente() {
  const { perfil } = useSession();
  const cap = perfil ? CAPACIDADES[perfil.plan] : CAPACIDADES.basico;
  const soyVip = perfil?.plan === 'vip';

  const [vista, setVista] = useState<Vista>(cap.vistaUnicaForzada ? 'tarjeta' : 'cuadricula');
  const [perfiles, setPerfiles] = useState<PerfilPublico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [indiceTarjeta, setIndiceTarjeta] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [showFiltros, setShowFiltros] = useState(false);

  // Perfil que se está por eliminar (ventana de confirmación con motivo).
  const [aDescartar, setADescartar] = useState<PerfilPublico | null>(null);
  const [descartando, setDescartando] = useState(false);
  const [errorDescarte, setErrorDescarte] = useState('');

  const [edadMin, setEdadMin] = useState(18);
  const [edadMax, setEdadMax] = useState(60);
  const [ciudadFiltro, setCiudadFiltro] = useState('');
  const [calMinFiltro, setCalMinFiltro] = useState(0);
  const [chipsFiltro, setChipsFiltro] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    const { data, error } = await supabase
      .from('perfiles_publicos')
      .select('*')
      .eq('rol', 'proveedor');

    if (error) {
      console.error('Error cargando perfiles:', error);
      setCargando(false);
      return;
    }

    // Perfiles eliminados por mí o que me bloquearon: nunca deben aparecer en mi Explorar.
    let bloqueadosPor = new Set<string>();
    if (userId) {
      const { data: bloqueos } = await supabase
        .from('bloqueos')
        .select('proveedora_id')
        .eq('cliente_id', userId);
      bloqueadosPor = new Set((bloqueos ?? []).map((b: any) => b.proveedora_id));
    }

    const visibles = (data ?? []).filter((p: any) => !bloqueadosPor.has(p.id));

    const conFoto = visibles.map((p: any) => ({
      ...p,
      foto_url: p.fotos && p.fotos.length > 0 ? resolverFotoUrl(supabase, p.fotos[0]) : null,
    }));

    const ordenados = [...conFoto].sort((a: any, b: any) => {
      if (a.plan === 'vip' && b.plan !== 'vip') return -1;
      if (b.plan === 'vip' && a.plan !== 'vip') return 1;
      return 0;
    });

    setPerfiles(ordenados);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function toggleChipFiltro(chip: string) {
    setChipsFiltro((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));
  }

  const filtrados = perfiles.filter((p) => {
    if (busqueda.trim() && !p.alias.toLowerCase().includes(busqueda.trim().toLowerCase())) return false;
    if (p.edad != null && (p.edad < edadMin || p.edad > edadMax)) return false;
    if (cap.filtrosAvanzados && ciudadFiltro.trim() && p.ciudad !== ciudadFiltro.trim()) return false;
    if (cap.filtrosAvanzados && calMinFiltro > 0 && (p.calificacion_prom ?? 0) < calMinFiltro) return false;
    return true;
  });

  const limitados = filtrados.slice(0, cap.perfilesDia);

  async function handleMeEncanta(otroId: string) {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;
    const { error } = await supabase.from('favoritos').insert({ usuario_id: userId, perfil_guardado: otroId });
    // Solo se avisa si el Me encanta es nuevo (si ya existía, la inserción falla y no se repite el aviso).
    if (!error) {
      const destino = perfiles.find((x) => x.id === otroId);
      await notificarMeEncanta(supabase, {
        paraId: otroId,
        paraPlan: destino?.plan,
        deAlias: perfil?.alias,
        dePlan: perfil?.plan,
      });
    }
  }

  function pedirDescartar(p: PerfilPublico) {
    setErrorDescarte('');
    setADescartar(p);
  }

  async function confirmarDescarte(motivo: string, nota: string) {
    if (!aDescartar || !perfil?.id || descartando) return;
    setDescartando(true);
    setErrorDescarte('');
    const supabase = createClient();
    const r = await descartarPerfil(supabase, {
      miId: perfil.id,
      miAlias: perfil.alias,
      perfilId: aDescartar.id,
      motivo,
      nota,
    });
    setDescartando(false);
    if (!r.ok) {
      setErrorDescarte(r.error);
      return;
    }
    const idQuitado = aDescartar.id;
    setPerfiles((prev) => prev.filter((x) => x.id !== idQuitado));
    setADescartar(null);
  }

  return (
    <main className="flex-1 flex flex-col px-6 py-6 max-w-md mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[28px] leading-tight font-bold text-vela-text">Explorar</h1>
        {!cap.vistaUnicaForzada && (
          <div className="flex gap-1 bg-vela-surface-2 rounded-2xl p-1">
            <button onClick={() => setVista('cuadricula')} className={`w-11 h-11 rounded-xl text-base flex items-center justify-center ${vista === 'cuadricula' ? 'bg-vela-public text-white' : 'text-vela-text-faint'}`}>▦</button>
            <button onClick={() => setVista('lista')} className={`w-11 h-11 rounded-xl text-base flex items-center justify-center ${vista === 'lista' ? 'bg-vela-public text-white' : 'text-vela-text-faint'}`}>☰</button>
            <button onClick={() => setVista('tarjeta')} className={`w-11 h-11 rounded-xl text-base flex items-center justify-center ${vista === 'tarjeta' ? 'bg-vela-public text-white' : 'text-vela-text-faint'}`}>▢</button>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por alias..."
          className="flex-1 min-w-0 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none focus:border-vela-public/60"
        />
        <button
          onClick={() => setShowFiltros(true)}
          className="w-14 h-14 rounded-2xl bg-vela-surface-2 border border-vela-line text-vela-text-dim text-base flex items-center justify-center"
        >
          ⚙️
        </button>
      </div>

      {cargando ? (
        <p className="text-sm text-vela-text-faint text-center py-8">Cargando...</p>
      ) : limitados.length === 0 ? (
        <p className="text-sm text-vela-text-faint text-center py-8">No hay perfiles que coincidan con tu búsqueda.</p>
      ) : vista === 'tarjeta' ? (
        <TarjetaUnica
          perfiles={limitados}
          indice={indiceTarjeta}
          setIndice={setIndiceTarjeta}
          onMeEncanta={handleMeEncanta}
          onPedirDescartar={pedirDescartar}
          soyVip={soyVip}
        />
      ) : vista === 'cuadricula' ? (
        <div className="grid grid-cols-2 gap-3">
          {limitados.map((p) => (
            <TarjetaGrid key={p.id} p={p} soyVip={soyVip} onMeEncanta={handleMeEncanta} onPedirDescartar={pedirDescartar} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {limitados.map((p) => (
            <TarjetaLista key={p.id} p={p} soyVip={soyVip} onMeEncanta={handleMeEncanta} onPedirDescartar={pedirDescartar} />
          ))}
        </div>
      )}

      {showFiltros && (
        <ModalFiltros
          esAvanzado={cap.filtrosAvanzados}
          edadMin={edadMin} edadMax={edadMax} setEdadMin={setEdadMin} setEdadMax={setEdadMax}
          ciudadFiltro={ciudadFiltro} setCiudadFiltro={setCiudadFiltro}
          calMinFiltro={calMinFiltro} setCalMinFiltro={setCalMinFiltro}
          chipsFiltro={chipsFiltro} toggleChipFiltro={toggleChipFiltro}
          onCerrar={() => setShowFiltros(false)}
        />
      )}

      {aDescartar && (
        <ModalDescartarPerfil
          alias={aDescartar.alias}
          enviando={descartando}
          error={errorDescarte}
          onCancelar={() => { if (!descartando) setADescartar(null); }}
          onConfirmar={confirmarDescarte}
        />
      )}
    </main>
  );
}

function TarjetaUnica({ perfiles, indice, setIndice, onMeEncanta, onPedirDescartar, soyVip }: {
  perfiles: PerfilPublico[]; indice: number; setIndice: (i: number) => void;
  onMeEncanta: (id: string) => void; onPedirDescartar: (p: PerfilPublico) => void; soyVip: boolean;
}) {
  const total = perfiles.length;
  const actual = total > 0 ? ((indice % total) + total) % total : 0;
  const p = perfiles[actual];

  const inicioX = useRef<number | null>(null);
  const ignorarClick = useRef(false);

  if (!p) return <p className="text-sm text-vela-text-faint text-center py-8">No hay perfiles disponibles por ahora.</p>;

  const foto = p.foto_url;

  // Pasa al siguiente perfil; al llegar al último vuelve al primero.
  function siguiente() { setIndice((actual + 1) % total); }
  function anterior() { setIndice((actual - 1 + total) % total); }

  function alTocarInicio(e: React.TouchEvent) {
    inicioX.current = e.touches[0].clientX;
  }
  function alTocarFin(e: React.TouchEvent) {
    if (inicioX.current === null) return;
    const dx = e.changedTouches[0].clientX - inicioX.current;
    inicioX.current = null;
    if (Math.abs(dx) < 50) return;
    // Evita que el "click" que sigue al deslizar cuente como un toque extra.
    ignorarClick.current = true;
    setTimeout(() => { ignorarClick.current = false; }, 350);
    if (dx < 0) siguiente(); else anterior();
  }

  return (
    <div
      className="relative rounded-[28px] overflow-hidden border border-vela-line bg-vela-surface aspect-[4/5] flex flex-col justify-end select-none"
      style={estiloAro(p.plan, soyVip)}
      onTouchStart={alTocarInicio}
      onTouchEnd={alTocarFin}
    >
      {foto ? (
        <FotoAjustada src={foto} />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: p.avatar_color }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent pointer-events-none" />

      {/* Zonas táctiles: lado izquierdo = anterior, lado derecho = siguiente */}
      <div className="absolute inset-0 flex z-10">
        <button
          type="button"
          aria-label="Perfil anterior"
          onClick={() => { if (!ignorarClick.current) anterior(); }}
          className="w-1/2 h-full cursor-w-resize"
        />
        <button
          type="button"
          aria-label="Perfil siguiente"
          onClick={() => { if (!ignorarClick.current) siguiente(); }}
          className="w-1/2 h-full cursor-e-resize"
        />
      </div>

      <span className="absolute top-3 left-3 z-20 text-[11px] font-bold bg-black/45 text-white rounded-full px-2.5 py-1 pointer-events-none">
        {actual + 1} / {total}
      </span>
      {p.plan === 'vip' && (
        <span className="absolute top-3 right-3 z-20 text-[10px] font-extrabold bg-vela-amber text-black rounded-full px-2.5 py-1 pointer-events-none">★ VIP</span>
      )}
      {soyVip && p.plan !== 'vip' && colorAro(p.plan, true) && (
        <span
          className="absolute top-3 right-3 z-20 text-[10px] font-extrabold text-black rounded-full px-2.5 py-1 pointer-events-none"
          style={{ backgroundColor: colorAro(p.plan, true) ?? undefined }}
        >
          {ETIQUETA_PLAN[p.plan]}
        </span>
      )}
      {/* Tocar el nombre abre el perfil completo (ahí sí se navegan todas las fotos) */}
      <Link
        href={`/perfil-detalle/${p.id}`}
        onClick={(e) => { if (ignorarClick.current) e.preventDefault(); }}
        className="relative z-20 block p-5 text-white"
      >
        <p className="text-2xl font-extrabold italic">{p.alias}{p.edad ? `, ${p.edad}` : ''}</p>
        <LineasInfo
          p={p}
          tamIcono={18}
          claseUbicacion="text-sm opacity-90"
          claseRegalo="text-sm opacity-90"
          textoSinCiudad="Sin ciudad"
        />
        <p className="mt-1 text-xs font-bold underline underline-offset-2">Ver perfil completo →</p>
      </Link>
      <div className="relative z-20 flex gap-4 justify-center pb-5">
        <button
          type="button"
          onClick={() => onPedirDescartar(p)}
          className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-vela-safety shadow-lg"
          aria-label="Eliminar perfil"
        ><IconoCerrar size={28} stroke={2.4} /></button>
        <Link
          href={`/perfil-detalle/${p.id}?solicitud=1`}
          onClick={() => onMeEncanta(p.id)}
          className="w-16 h-16 rounded-full bg-vela-public flex items-center justify-center text-white shadow-lg"
          aria-label="Me encanta"
        ><IconoCorazon size={28} fill="currentColor" /></Link>
      </div>
    </div>
  );
}

function TarjetaGrid({ p, soyVip, onMeEncanta, onPedirDescartar }: {
  p: PerfilPublico; soyVip: boolean; onMeEncanta: (id: string) => void; onPedirDescartar: (p: PerfilPublico) => void;
}) {
  const router = useRouter();
  const foto = p.foto_url;
  return (
    <div
      style={estiloAro(p.plan, soyVip)}
      className="relative rounded-3xl overflow-hidden border border-vela-line bg-vela-surface aspect-[3/4.4]"
    >
      {foto ? (
        <FotoAjustada src={foto} />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: p.avatar_color }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent pointer-events-none" />

      {/* Toda la tarjeta abre el perfil; los botones van por encima */}
      <Link href={`/perfil-detalle/${p.id}`} className="absolute inset-0 z-10" aria-label={`Ver perfil de ${p.alias}`} />

      {p.plan === 'vip' && (
        <span className="absolute top-2 right-2 z-20 text-[9px] font-extrabold bg-vela-amber text-black rounded-full px-2 py-0.5 pointer-events-none">★ VIP</span>
      )}
      {soyVip && p.plan !== 'vip' && colorAro(p.plan, true) && (
        <span
          className="absolute top-2 right-2 z-20 text-[9px] font-extrabold text-black rounded-full px-2 py-0.5 pointer-events-none"
          style={{ backgroundColor: colorAro(p.plan, true) ?? undefined }}
        >
          {ETIQUETA_PLAN[p.plan]}
        </span>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-20 p-3 text-white pointer-events-none">
        <p className="text-sm font-bold italic truncate">{p.alias}{p.edad ? `, ${p.edad}` : ''}</p>
        <LineasInfo
          p={p}
          tamIcono={14}
          claseUbicacion="text-[11px] opacity-90"
          claseRegalo="text-[11px] opacity-90"
        />
        <div className="mt-2.5 flex gap-2 justify-center pointer-events-auto">
          <button
            type="button"
            onClick={() => onPedirDescartar(p)}
            className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-vela-safety shadow-lg"
            aria-label="Eliminar perfil"
          ><IconoCerrar size={22} stroke={2.4} /></button>
          <button
            type="button"
            onClick={() => { onMeEncanta(p.id); router.push(`/perfil-detalle/${p.id}?solicitud=1`); }}
            className="w-11 h-11 rounded-full bg-vela-public flex items-center justify-center text-white shadow-lg"
            aria-label="Me encanta"
          ><IconoCorazon size={22} fill="currentColor" /></button>
        </div>
      </div>
    </div>
  );
}

function TarjetaLista({ p, soyVip, onMeEncanta, onPedirDescartar }: {
  p: PerfilPublico; soyVip: boolean; onMeEncanta: (id: string) => void; onPedirDescartar: (p: PerfilPublico) => void;
}) {
  const router = useRouter();
  const foto = p.foto_url;
  return (
    <div className="bg-vela-surface border border-vela-line rounded-2xl p-4 flex flex-col gap-3">
      <Link href={`/perfil-detalle/${p.id}`} className="flex gap-3 items-center">
        <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: p.avatar_color, ...(estiloAro(p.plan, soyVip) ?? {}) }}>
          {foto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="" className="w-full h-full object-cover object-top" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-base font-bold text-vela-text italic truncate">{p.alias}{p.edad ? `, ${p.edad}` : ''}</p>
            {p.plan === 'vip' && <span className="text-[10px] font-extrabold text-vela-amber">★ VIP</span>}
            {soyVip && p.plan !== 'vip' && colorAro(p.plan, true) && (
              <span className="text-[10px] font-extrabold" style={{ color: colorAro(p.plan, true) ?? undefined }}>{ETIQUETA_PLAN[p.plan]}</span>
            )}
          </div>
          <LineasInfo
            p={p}
            tamIcono={16}
            claseUbicacion="text-sm text-vela-text-faint"
            claseRegalo="text-sm text-vela-text-dim"
          />
        </div>
        <span className="text-sm text-vela-amber">★ {(p.calificacion_prom ?? 0).toFixed(1)}</span>
      </Link>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onPedirDescartar(p)}
          className="flex-1 h-12 rounded-full bg-white flex items-center justify-center text-vela-safety"
          aria-label="Eliminar perfil"
        ><IconoCerrar size={24} stroke={2.4} /></button>
        <button
          type="button"
          onClick={() => { onMeEncanta(p.id); router.push(`/perfil-detalle/${p.id}?solicitud=1`); }}
          className="flex-1 h-12 rounded-full bg-vela-public flex items-center justify-center text-white"
          aria-label="Me encanta"
        ><IconoCorazon size={24} fill="currentColor" /></button>
      </div>
    </div>
  );
}

function ModalFiltros({ esAvanzado, edadMin, edadMax, setEdadMin, setEdadMax, ciudadFiltro, setCiudadFiltro, calMinFiltro, setCalMinFiltro, chipsFiltro, toggleChipFiltro, onCerrar }: {
  esAvanzado: boolean;
  edadMin: number; edadMax: number; setEdadMin: (n: number) => void; setEdadMax: (n: number) => void;
  ciudadFiltro: string; setCiudadFiltro: (s: string) => void;
  calMinFiltro: number; setCalMinFiltro: (n: number) => void;
  chipsFiltro: string[]; toggleChipFiltro: (c: string) => void;
  onCerrar: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50">
      <div className="bg-vela-bg border border-vela-line rounded-t-[28px] sm:rounded-[28px] max-w-md w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-vela-line">
          <h2 className="text-xl font-bold text-vela-text">Filtros</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="w-11 h-11 rounded-full bg-vela-surface-2 flex items-center justify-center text-vela-text-dim"><IconoCerrar size={20} stroke={2.2} /></button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          <div>
            <p className="text-xs font-semibold text-vela-text-faint mb-2">Rango de edad: {edadMin} – {edadMax}</p>
            <div className="flex gap-3">
              <input type="range" min={18} max={70} value={edadMin} onChange={(e) => setEdadMin(Number(e.target.value))} className="flex-1 accent-vela-public" />
              <input type="range" min={18} max={70} value={edadMax} onChange={(e) => setEdadMax(Number(e.target.value))} className="flex-1 accent-vela-public" />
            </div>
          </div>

          {esAvanzado ? (
            <>
              <div>
                <label className="text-xs font-semibold text-vela-text-faint">Ciudad</label>
                <input
                  value={ciudadFiltro}
                  onChange={(e) => setCiudadFiltro(e.target.value)}
                  placeholder="Ej. San Salvador"
                  className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none"
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-vela-text-faint mb-2">Calificación mínima: {calMinFiltro > 0 ? `★ ${calMinFiltro}` : 'Cualquiera'}</p>
                <input type="range" min={0} max={5} step={0.5} value={calMinFiltro} onChange={(e) => setCalMinFiltro(Number(e.target.value))} className="w-full accent-vela-public" />
              </div>
              <div>
                <p className="text-xs font-semibold text-vela-text-faint mb-2">Preferencias del perfil</p>
                <div className="flex flex-col gap-3">
                  {CATEGORIAS_CHIPS.map((cat) => (
                    <div key={cat.id}>
                      <p className="text-[11px] text-vela-public font-semibold mb-1.5">{cat.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {cat.chips.map((chip) => (
                          <button
                            key={chip}
                            onClick={() => toggleChipFiltro(chip)}
                            className={`px-4 py-2.5 rounded-full text-sm font-medium border ${
                              chipsFiltro.includes(chip) ? 'bg-vela-public-soft border-vela-public text-vela-public' : 'bg-vela-surface-2 border-vela-line text-vela-text-faint'
                            }`}
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-vela-surface-2 rounded-2xl p-5 text-center">
              <p className="text-xs text-vela-text-faint">Los filtros por ciudad, calificación y preferencias son exclusivos de los planes Gold y VIP.</p>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-vela-line">
          <button onClick={onCerrar} className="w-full h-14 rounded-full bg-vela-public text-white font-bold text-base flex items-center justify-center gap-2">
            Aplicar filtros
            <IconoFlecha />
          </button>
        </div>
      </div>
    </div>
  );
}

type Solicitud = {
  id: string;
  cliente_id: string;
  alias: string;
  avatar_color: string;
  foto_url: string | null;
  fecha: string;
  hora: string;
  duracion: string;
  lugar: string;
  tipo: string;
  mensaje: string;
};

function SolicitudesRecibidas() {
  const { perfil } = useSession();
  const router = useRouter();
  const cap = perfil ? CAPACIDADES[perfil.plan] : CAPACIDADES.basico;

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState('');
  const [rechazando, setRechazando] = useState<Solicitud | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState<string | null>(null);

  // Al ver las solicitudes, su notificación se marca leída al instante (como WhatsApp).
  const marcarNotisSolicitudLeidas = useCallback(async () => {
    if (!perfil?.id) return;
    const supabase = createClient();
    await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('para_usuario_id', perfil.id)
      .eq('leida', false)
      .ilike('mensaje', '%solicitud%')
      .eq('ruta', '/explorar');
  }, [perfil?.id]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) { setCargando(false); return; }

    const { data } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('proveedora_id', userId)
      .order('creado_en', { ascending: false });

    const clienteIds = (data ?? []).map((s: any) => s.cliente_id);
    let clientesMap: Record<string, any> = {};
    if (clienteIds.length > 0) {
      const { data: clientes } = await supabase.from('perfiles_publicos').select('id, alias, avatar_color, fotos').in('id', clienteIds);
      clientesMap = Object.fromEntries((clientes ?? []).map((c: any) => [
        c.id,
        { ...c, foto_url: c.fotos && c.fotos.length > 0 ? resolverFotoUrl(supabase, c.fotos[0]) : null },
      ]));
    }

    setSolicitudes((data ?? []).map((s: any) => ({
      id: s.id,
      cliente_id: s.cliente_id,
      alias: clientesMap[s.cliente_id]?.alias ?? 'Perfil',
      avatar_color: clientesMap[s.cliente_id]?.avatar_color ?? '#D91F3A',
      foto_url: clientesMap[s.cliente_id]?.foto_url ?? null,
      fecha: s.fecha,
      hora: s.hora,
      duracion: s.duracion,
      lugar: s.lugar,
      tipo: s.tipo,
      mensaje: s.mensaje ?? '',
    })));

    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => { marcarNotisSolicitudLeidas(); }, [marcarNotisSolicitudLeidas]);

  useEffect(() => {
    if (!perfil?.id) return;
    const supabase = createClient();

    const canal = supabase
      .channel(`solicitudes-recibidas-${perfil.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'solicitudes', filter: `proveedora_id=eq.${perfil.id}` },
        async (payload) => {
          const fila = payload.new as any;
          const { data: cliente } = await supabase
            .from('perfiles_publicos')
            .select('id, alias, avatar_color, fotos')
            .eq('id', fila.cliente_id)
            .maybeSingle();
          if (!cliente) return;

          setSolicitudes((prev) => [
            {
              id: fila.id,
              cliente_id: fila.cliente_id,
              alias: cliente.alias ?? 'Perfil',
              avatar_color: cliente.avatar_color ?? '#D91F3A',
              foto_url: cliente.fotos && cliente.fotos.length > 0 ? resolverFotoUrl(supabase, cliente.fotos[0]) : null,
              fecha: fila.fecha,
              hora: fila.hora,
              duracion: fila.duracion,
              lugar: fila.lugar,
              tipo: fila.tipo,
              mensaje: fila.mensaje ?? '',
            },
            ...prev,
          ]);

          // Ya está viendo la solicitud: la notificación (que llega un instante después) se marca leída.
          setTimeout(() => { marcarNotisSolicitudLeidas(); }, 800);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [perfil?.id, marcarNotisSolicitudLeidas]);

  async function aceptar(s: Solicitud) {
    setProcesando(s.id);
    setErrorAccion('');
    const supabase = createClient();

    try {
      const r = await aceptarSolicitud(supabase, s, perfil?.alias ?? 'Alguien');
      if (!r.ok) {
        setErrorAccion(r.error);
        setProcesando(null);
        if (r.choque) window.alert(r.error);
        return;
      }

      setProcesando(null);
      if (r.chatId) {
        router.push(`/chat/${r.chatId}`);
      } else {
        cargar();
      }
    } catch (err: any) {
      console.error('Error inesperado aceptando la solicitud:', err?.message ?? err);
      setErrorAccion('Algo falló aceptando la solicitud. Revisa la consola e intenta de nuevo.');
      setProcesando(null);
    }
  }

  function abrirRechazo(s: Solicitud) {
    setRechazando(s);
    setMotivoRechazo(null);
    setErrorAccion('');
  }

  async function confirmarRechazo() {
    if (!rechazando || !motivoRechazo || !perfil?.id) return;
    const s = rechazando;
    const motivo = MOTIVOS_RECHAZO_SOLICITUD.find((m) => m.texto === motivoRechazo);

    setProcesando(s.id);
    setErrorAccion('');
    const supabase = createClient();

    const { error } = await supabase.from('solicitudes').delete().eq('id', s.id);
    if (error) {
      console.error('Error rechazando la solicitud:', error.message, error.details, error.hint, error.code);
      setErrorAccion('No se pudo rechazar la solicitud. Intenta de nuevo.');
      setProcesando(null);
      return;
    }

    if (motivo?.bloquea) {
      const { error: bloqueoError } = await supabase.from('bloqueos').upsert(
        { proveedora_id: perfil.id, cliente_id: s.cliente_id, motivo: motivoRechazo },
        { onConflict: 'proveedora_id,cliente_id' }
      );
      if (bloqueoError) {
        console.error('Error bloqueando al cliente:', bloqueoError.message, bloqueoError.details, bloqueoError.hint, bloqueoError.code);
      } else {
        // Si ya había un chat entre las dos personas: se cierra y el cliente ve el motivo.
        // Para ti, ese chat desaparece de tu lista.
        await cerrarChatPorEliminacion(supabase, {
          clienteId: s.cliente_id,
          proveedoraId: perfil.id,
          quienElimina: 'proveedora',
          aliasQuienElimina: perfil.alias ?? 'Alguien',
          motivoVisible: motivoRechazo,
        });
      }
    } else {
      await supabase.from('notificaciones').insert({
        para_usuario_id: s.cliente_id,
        mensaje: `${perfil?.alias ?? 'Alguien'} no pudo aceptar tu solicitud de encuentro: ${motivoRechazo}.`,
        ruta: '/explorar',
      });
    }

    setProcesando(null);
    setRechazando(null);
    setMotivoRechazo(null);
    cargar();
  }

  return (
    <main className="flex-1 px-6 py-6 max-w-md mx-auto w-full">
      <h1 className="text-[28px] leading-tight font-bold text-vela-text mb-1">Solicitudes</h1>

      <div className="bg-vela-surface border border-vela-line rounded-2xl p-4 mb-5">
        <p className="text-xs text-vela-text-faint">
          Plan {cap.label} · alcance <span className="text-vela-public font-semibold">
            {perfil?.plan === 'vip' ? '100% + prioridad' : perfil?.plan === 'gold' ? '80%' : perfil?.plan === 'premium' ? '55%' : '30%'}
          </span>
        </p>
      </div>

      {errorAccion && (
        <div className="bg-vela-safety-soft border border-vela-safety rounded-2xl p-4 mb-4">
          <p className="text-xs text-vela-safety">{errorAccion}</p>
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-vela-text-faint text-center py-8">Cargando...</p>
      ) : solicitudes.length === 0 ? (
        <p className="text-sm text-vela-text-faint text-center py-8">No tienes solicitudes pendientes por ahora.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {solicitudes.map((s) => (
            <div key={s.id} className="bg-vela-surface border border-vela-line rounded-3xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ backgroundColor: s.avatar_color }}>
                  {s.foto_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.foto_url} alt="" className="w-full h-full object-cover object-top" />
                  ) : (
                    <span className="text-white font-bold text-sm">{s.alias.charAt(0)}</span>
                  )}
                </div>
                <p className="text-lg font-bold text-vela-text italic">{s.alias}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3 text-sm text-vela-text-dim">
                <p className="flex items-center gap-2 min-w-0"><IconoEncuentros size={18} className="flex-shrink-0 text-vela-text-faint" /><span className="truncate">{s.fecha}</span></p>
                <p className="flex items-center gap-2 min-w-0"><IconoHora size={18} className="flex-shrink-0 text-vela-text-faint" /><span className="truncate">{formatoHora12(s.hora)}</span></p>
                <p className="flex items-center gap-2 min-w-0"><IconoDuracion size={18} className="flex-shrink-0 text-vela-text-faint" /><span className="truncate">{s.duracion}</span></p>
                <p className="flex items-center gap-2 min-w-0"><IconoUbicacion size={18} className="flex-shrink-0 text-vela-text-faint" /><span className="truncate">{s.lugar}</span></p>
              </div>
              {s.mensaje && <p className="text-sm text-vela-text-faint italic mb-3">"{s.mensaje}"</p>}

              {rechazando?.id === s.id ? (
                <div className="flex flex-col gap-3 bg-vela-surface-2 rounded-2xl p-4 border border-vela-line">
                  <p className="text-xs font-bold text-vela-text-faint">¿Por qué rechazas esta solicitud?</p>
                  <div className="flex flex-wrap gap-2">
                    {MOTIVOS_RECHAZO_SOLICITUD.map((m) => (
                      <button
                        key={m.texto}
                        onClick={() => setMotivoRechazo(m.texto)}
                        className={`px-4 py-2.5 rounded-full text-sm font-medium border ${
                          motivoRechazo === m.texto ? 'bg-vela-public-soft border-vela-public text-vela-public' : 'bg-vela-surface border-vela-line text-vela-text-faint'
                        }`}
                      >
                        {m.texto}
                      </button>
                    ))}
                  </div>
                  {motivoRechazo && MOTIVOS_RECHAZO_SOLICITUD.find((m) => m.texto === motivoRechazo)?.bloquea && (
                    <p className="text-[11px] text-vela-safety">
                      Este perfil quedará bloqueado: no podrá ver tu perfil ni enviarte más solicitudes.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setRechazando(null); setMotivoRechazo(null); }}
                      className="flex-1 h-12 rounded-full bg-vela-surface border border-vela-line text-vela-text-faint text-sm font-bold"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmarRechazo}
                      disabled={!motivoRechazo || procesando === s.id}
                      className="flex-1 h-12 rounded-full bg-vela-safety text-white text-sm font-bold disabled:opacity-50"
                    >
                      {procesando === s.id ? '...' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => abrirRechazo(s)}
                    disabled={procesando === s.id}
                    className="flex-1 h-14 rounded-full border-[1.5px] border-vela-public bg-transparent text-vela-text text-base font-bold disabled:opacity-50"
                  >
                    Rechazar
                  </button>
                  <button
                    onClick={() => aceptar(s)}
                    disabled={procesando === s.id}
                    className="flex-1 h-14 rounded-full bg-vela-public text-white text-base font-bold flex items-center justify-center disabled:opacity-50"
                  >
                    {procesando === s.id ? '...' : 'Aceptar'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

/** Flecha de los botones principales (solo diseño). */
function IconoFlecha() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}