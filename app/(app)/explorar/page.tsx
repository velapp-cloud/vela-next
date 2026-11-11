'use client';

/**
 * app/(app)/explorar/page.tsx
 * Se comporta distinto segun el rol:
 * - cliente: explora los perfiles de "quiero ser descubierta" que le asigna la base de datos
 *   (lote de 24 horas; el cliente VIP las ve a todas). Pantalla principal: perfil a PANTALLA COMPLETA
 *   (como Tinder / TikTok), entre el borde de arriba y la barra de navegacion.
 *     · la foto CUBRE toda la pantalla; los botones flotan encima
 *     · tocar el lado izquierdo/derecho de la foto = pasar de foto
 *     · deslizar (a los lados o arriba/abajo) = pasar de perfil
 *     · icono de ojo = abrir el perfil completo
 *     · corazon = SOLO da/quita "me gusta"
 *   Vistas de cuadricula/lista y filtros avanzados: visibles para todos; si el plan no los incluye
 *   sube la ventana de planes (hook useAccesoPlan).
 *   La pantalla recuerda filtros y el perfil donde ibas al volver de un perfil o al recargar.
 * - proveedor: ve las solicitudes de encuentro que ha recibido (con el plan de quien las envia).
 */
import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { CAPACIDADES } from '@/lib/planes/capacidades';
import { useAccesoPlan } from '@/lib/planes/accesoPlan';
import { CATEGORIAS_CHIPS } from '@/lib/chips/chipsPreferencia';
import { aceptarSolicitud } from '@/lib/citas/aceptarSolicitud';
import { formatoHora12 } from '@/lib/citas/formatoHora';
import { resolverFotoUrl } from '@/lib/perfiles/resolverFoto';
import { descartarPerfil, cerrarChatPorEliminacion } from '@/lib/perfiles/descartarPerfil';
import FotoAjustada from '@/components/FotoAjustada';
import ModalDescartarPerfil from '@/components/ModalDescartarPerfil';
import { useRouter } from 'next/navigation';
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
  /** Todas las fotos del perfil, ya con su dirección completa. */
  fotos_urls: string[];
  verificado: boolean;
  calificacion_prom: number | null;
  plan: string;
  /** true = ya hubo contacto con esta persona (su chat sigue en mi lista). */
  conservado?: boolean;
};

type Vista = 'tarjeta' | 'cuadricula' | 'lista';

const EDAD_MINIMA = 18;
const EDAD_MAXIMA_DEFECTO = 60;
const EDAD_TOPE = 70;
const CLAVE_VISTA = 'vela:vista-explorar';
const CLAVE_ESTADO = 'vela:explorar-estado';

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

/** Corazón de "me encanta": solo da o quita el me gusta. No abre ninguna pantalla. */
function BotonMeEncanta({ activo, onClick, clase, tam }: {
  activo: boolean; onClick: () => void; clase: string; tam: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      aria-label={activo ? 'Quitar me encanta' : 'Me encanta'}
      className={`${clase} flex items-center justify-center shadow-lg transition-colors ${
        activo ? 'bg-vela-public text-white' : 'bg-white text-vela-public'
      }`}
    >
      <IconoCorazon size={tam} fill={activo ? 'currentColor' : 'none'} />
    </button>
  );
}

/** Icono de filtro (tres líneas con perillas), pequeño, como en Tinder. */
function IconoFiltro({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2.2" fill="currentColor" />
      <circle cx="15" cy="12" r="2.2" fill="currentColor" />
      <circle cx="8" cy="18" r="2.2" fill="currentColor" />
    </svg>
  );
}

/** Icono de ojo: abrir el perfil completo. */
function IconoOjo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Botón redondo de filtros. Sobre la foto va translúcido; fuera de la foto, como botón normal. */
function BotonFiltros({ onClick, activo, sobreFoto }: { onClick: () => void; activo: boolean; sobreFoto: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Filtros"
      className={`relative w-10 h-10 rounded-full border flex items-center justify-center ${
        sobreFoto
          ? 'bg-black/40 border-white/30 text-white backdrop-blur-sm'
          : 'bg-vela-surface-2 border-vela-line text-vela-text-dim'
      }`}
    >
      <IconoFiltro size={18} />
      {activo && (
        <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-vela-public ring-2 ring-vela-bg" aria-hidden="true" />
      )}
    </button>
  );
}

function ExplorarCliente() {
  const { perfil } = useSession();
  const { tieneAcceso, requerir } = useAccesoPlan();
  const cap = perfil ? CAPACIDADES[perfil.plan] : CAPACIDADES.basico;
  const soyVip = perfil?.plan === 'vip';

  // Por defecto todos ven la tarjeta única. Quien no tiene las vistas extra en su plan siempre la ve.
  const [vista, setVista] = useState<Vista>('tarjeta');
  const vistaActual: Vista = tieneAcceso('vistas_extra') ? vista : 'tarjeta';
  const [perfiles, setPerfiles] = useState<PerfilPublico[]>([]);
  const [meEncantaIds, setMeEncantaIds] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [indiceTarjeta, setIndiceTarjeta] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [showFiltros, setShowFiltros] = useState(false);

  // Perfil que se está por eliminar (ventana de confirmación con motivo).
  const [aDescartar, setADescartar] = useState<PerfilPublico | null>(null);
  const [descartando, setDescartando] = useState(false);
  const [errorDescarte, setErrorDescarte] = useState('');

  const [edadMin, setEdadMin] = useState(EDAD_MINIMA);
  const [edadMax, setEdadMax] = useState(EDAD_MAXIMA_DEFECTO);
  const [ciudadFiltro, setCiudadFiltro] = useState('');
  const [calMinFiltro, setCalMinFiltro] = useState(0);
  const [chipsFiltro, setChipsFiltro] = useState<string[]>([]);

  // Persistencia: filtros y perfil donde ibas (mientras dure la sesión del navegador).
  const [restaurado, setRestaurado] = useState(false);
  const [idARestaurar, setIdARestaurar] = useState<string | null>(null);

  // Recuerda la vista elegida entre visitas.
  useEffect(() => {
    try {
      const guardada = localStorage.getItem(CLAVE_VISTA);
      if (guardada === 'tarjeta' || guardada === 'cuadricula' || guardada === 'lista') setVista(guardada);
    } catch {
      // sin almacenamiento: se queda la tarjeta
    }
  }, []);

  // Al entrar: recupera filtros y el perfil donde ibas.
  useEffect(() => {
    try {
      const crudo = sessionStorage.getItem(CLAVE_ESTADO);
      if (crudo) {
        const e = JSON.parse(crudo);
        if (typeof e.busqueda === 'string') setBusqueda(e.busqueda);
        if (typeof e.edadMin === 'number' && typeof e.edadMax === 'number' && e.edadMin <= e.edadMax) {
          setEdadMin(e.edadMin);
          setEdadMax(e.edadMax);
        }
        if (typeof e.ciudadFiltro === 'string') setCiudadFiltro(e.ciudadFiltro);
        if (typeof e.calMinFiltro === 'number') setCalMinFiltro(e.calMinFiltro);
        if (Array.isArray(e.chipsFiltro)) setChipsFiltro(e.chipsFiltro.filter((c: unknown) => typeof c === 'string'));
        if (typeof e.perfilId === 'string') setIdARestaurar(e.perfilId);
      }
    } catch {
      // si el dato guardado está dañado, se ignora
    }
    setRestaurado(true);
  }, []);

  function cambiarVista(v: Vista) {
    // Cuadrícula y lista son de Gold y VIP: sin ese plan sube la ventana de planes.
    if (v !== 'tarjeta' && !requerir('vistas_extra')) return;
    setVista(v);
    setIndiceTarjeta(0);
    try {
      localStorage.setItem(CLAVE_VISTA, v);
    } catch {
      // no pasa nada si no se puede guardar
    }
  }

  // La edad inicial nunca pasa de la final (y la final nunca baja de la inicial).
  function cambiarEdadMin(valor: number) {
    setEdadMin(Math.min(valor, edadMax));
  }
  function cambiarEdadMax(valor: number) {
    setEdadMax(Math.max(valor, edadMin));
  }

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga('');
    const supabase = createClient();

    // La base de datos decide qué perfiles me tocan: zona de cada proveedora, alcance de su plan,
    // lote de 24 horas, perfiles con chat conservados y bloqueos ya descartados.
    const { data: lote, error: errorLote } = await supabase.rpc('explorar_mis_perfiles');
    if (errorLote) {
      console.error('Error cargando perfiles:', errorLote);
      setErrorCarga('No se pudieron cargar los perfiles. Intenta de nuevo.');
      setCargando(false);
      return;
    }

    const filasLote = (lote ?? []) as { perfil_id: string; conservado: boolean }[];
    if (filasLote.length === 0) {
      setPerfiles([]);
      setCargando(false);
      return;
    }

    const ids = filasLote.map((f) => f.perfil_id);
    const conservadoPorId = new Map(filasLote.map((f) => [f.perfil_id, f.conservado]));
    const { data, error } = await supabase.from('perfiles_publicos').select('*').in('id', ids);

    if (error) {
      console.error('Error cargando perfiles:', error);
      setErrorCarga('No se pudieron cargar los perfiles. Intenta de nuevo.');
      setCargando(false);
      return;
    }

    // A quiénes ya les di "me encanta" (para pintar el corazón).
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userId) {
      const { data: favs } = await supabase
        .from('favoritos')
        .select('perfil_guardado')
        .eq('usuario_id', userId)
        .in('perfil_guardado', ids);
      setMeEncantaIds(new Set((favs ?? []).map((f: any) => f.perfil_guardado)));
    }

    const conFoto = (data ?? []).map((p: any) => {
      const urls = ((p.fotos ?? []) as string[])
        .map((f) => resolverFotoUrl(supabase, f))
        .filter((u): u is string => !!u);
      return {
        ...p,
        conservado: conservadoPorId.get(p.id) ?? false,
        fotos_urls: urls,
        foto_url: urls[0] ?? null,
      };
    });

    // Primero los VIP; luego los que ya tienen chat contigo; el resto en un orden estable.
    const ordenados = [...conFoto].sort((a: any, b: any) => {
      if (a.plan === 'vip' && b.plan !== 'vip') return -1;
      if (b.plan === 'vip' && a.plan !== 'vip') return 1;
      if (a.conservado && !b.conservado) return -1;
      if (b.conservado && !a.conservado) return 1;
      return String(a.id).localeCompare(String(b.id));
    });

    setPerfiles(ordenados);
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function toggleChipFiltro(chip: string) {
    setChipsFiltro((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));
  }

  function limpiarFiltros() {
    setBusqueda('');
    setEdadMin(EDAD_MINIMA);
    setEdadMax(EDAD_MAXIMA_DEFECTO);
    setCiudadFiltro('');
    setCalMinFiltro(0);
    setChipsFiltro([]);
    setIndiceTarjeta(0);
  }

  const hayFiltros =
    busqueda.trim() !== '' ||
    edadMin !== EDAD_MINIMA ||
    edadMax !== EDAD_MAXIMA_DEFECTO ||
    ciudadFiltro.trim() !== '' ||
    calMinFiltro > 0 ||
    chipsFiltro.length > 0;

  const filtrados = perfiles.filter((p) => {
    if (busqueda.trim() && !p.alias.toLowerCase().includes(busqueda.trim().toLowerCase())) return false;
    if (p.edad != null && (p.edad < edadMin || p.edad > edadMax)) return false;
    if (cap.filtrosAvanzados && ciudadFiltro.trim() && p.ciudad !== ciudadFiltro.trim()) return false;
    if (cap.filtrosAvanzados && calMinFiltro > 0 && (p.calificacion_prom ?? 0) < calMinFiltro) return false;
    return true;
  });

  // El límite diario (10 / 25 / 45 / 99) ya lo aplica la base de datos al armar el lote.
  const limitados = filtrados;

  // Perfil a pantalla completa: solo en la vista de tarjeta y cuando ya hay perfiles que mostrar.
  const pantallaCompleta = vistaActual === 'tarjeta' && !cargando && !errorCarga && limitados.length > 0;

  const perfilActualId =
    limitados.length > 0 ? limitados[((indiceTarjeta % limitados.length) + limitados.length) % limitados.length]?.id ?? null : null;

  // Cuando ya cargaron los perfiles, vuelve al que estabas viendo.
  useEffect(() => {
    if (!idARestaurar || cargando) return;
    const idx = limitados.findIndex((p) => p.id === idARestaurar);
    if (idx >= 0) setIndiceTarjeta(idx);
    setIdARestaurar(null);
  }, [idARestaurar, cargando, limitados]);

  // Guarda filtros y perfil actual cada vez que cambian.
  useEffect(() => {
    if (!restaurado || cargando || idARestaurar) return;
    try {
      sessionStorage.setItem(
        CLAVE_ESTADO,
        JSON.stringify({ busqueda, edadMin, edadMax, ciudadFiltro, calMinFiltro, chipsFiltro, perfilId: perfilActualId }),
      );
    } catch {
      // sin almacenamiento: no se recuerda, pero todo funciona igual
    }
  }, [restaurado, cargando, idARestaurar, busqueda, edadMin, edadMax, ciudadFiltro, calMinFiltro, chipsFiltro, perfilActualId]);

  /** Da o quita el "me encanta". Se pinta al instante y se revierte si el servidor falla. */
  async function toggleMeEncanta(otroId: string) {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;

    const yaDado = meEncantaIds.has(otroId);
    const cambiar = (poner: boolean) =>
      setMeEncantaIds((prev) => {
        const nuevo = new Set(prev);
        if (poner) nuevo.add(otroId); else nuevo.delete(otroId);
        return nuevo;
      });

    cambiar(!yaDado);

    if (yaDado) {
      const { error } = await supabase.from('favoritos').delete().eq('usuario_id', userId).eq('perfil_guardado', otroId);
      if (error) cambiar(true);
      return;
    }

    const { error } = await supabase.from('favoritos').insert({ usuario_id: userId, perfil_guardado: otroId });
    if (error) {
      cambiar(false);
      return;
    }
    const destino = perfiles.find((x) => x.id === otroId);
    await notificarMeEncanta(supabase, {
      paraId: otroId,
      paraPlan: destino?.plan,
      deAlias: perfil?.alias,
      dePlan: perfil?.plan,
    });
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
    <main
      className={
        pantallaCompleta
          ? 'relative flex min-h-0 w-full flex-1 flex-col md:mx-auto md:max-w-md'
          : 'flex-1 flex flex-col px-6 py-4 max-w-md mx-auto w-full'
      }
    >
      {!pantallaCompleta && (
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-vela-text">Explorar</h1>
          <BotonFiltros onClick={() => setShowFiltros(true)} activo={hayFiltros} sobreFoto={false} />
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-vela-text-faint text-center py-8">Cargando...</p>
      ) : errorCarga ? (
        <div className="text-center py-8">
          <p className="text-sm text-vela-safety mb-3">{errorCarga}</p>
          <button onClick={cargar} className="h-12 px-6 rounded-full bg-vela-surface-2 border border-vela-line text-sm font-bold text-vela-text">
            Reintentar
          </button>
        </div>
      ) : limitados.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-vela-text-faint mb-3">
            {hayFiltros ? 'No hay perfiles que coincidan con tus filtros.' : 'No hay perfiles disponibles por ahora.'}
          </p>
          {hayFiltros && (
            <button onClick={limpiarFiltros} className="h-12 px-6 rounded-full bg-vela-surface-2 border border-vela-line text-sm font-bold text-vela-text">
              Quitar filtros
            </button>
          )}
        </div>
      ) : vistaActual === 'tarjeta' ? (
        <TarjetaUnica
          perfiles={limitados}
          indice={indiceTarjeta}
          setIndice={setIndiceTarjeta}
          meEncantaIds={meEncantaIds}
          onToggleMeEncanta={toggleMeEncanta}
          onPedirDescartar={pedirDescartar}
          soyVip={soyVip}
          botonFiltros={<BotonFiltros onClick={() => setShowFiltros(true)} activo={hayFiltros} sobreFoto />}
        />
      ) : vistaActual === 'cuadricula' ? (
        <div className="grid grid-cols-2 gap-3">
          {limitados.map((p) => (
            <TarjetaGrid key={p.id} p={p} soyVip={soyVip} meEncanta={meEncantaIds.has(p.id)} onToggleMeEncanta={toggleMeEncanta} onPedirDescartar={pedirDescartar} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {limitados.map((p) => (
            <TarjetaLista key={p.id} p={p} soyVip={soyVip} meEncanta={meEncantaIds.has(p.id)} onToggleMeEncanta={toggleMeEncanta} onPedirDescartar={pedirDescartar} />
          ))}
        </div>
      )}

      {showFiltros && (
        <ModalFiltros
          tieneVistas={tieneAcceso('vistas_extra')}
          esAvanzado={tieneAcceso('filtros_avanzados')}
          onBloqueado={(f) => { requerir(f); }}
          vista={vistaActual}
          cambiarVista={cambiarVista}
          busqueda={busqueda} setBusqueda={(s) => { setBusqueda(s); setIndiceTarjeta(0); }}
          edadMin={edadMin} edadMax={edadMax} setEdadMin={cambiarEdadMin} setEdadMax={cambiarEdadMax}
          ciudadFiltro={ciudadFiltro} setCiudadFiltro={setCiudadFiltro}
          calMinFiltro={calMinFiltro} setCalMinFiltro={setCalMinFiltro}
          chipsFiltro={chipsFiltro} toggleChipFiltro={toggleChipFiltro}
          hayFiltros={hayFiltros}
          onLimpiar={limpiarFiltros}
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

/**
 * Perfil a pantalla completa (como Tinder / TikTok). Ocupa todo el espacio entre el borde de arriba
 * y la barra de navegación (que es otra parte de la pantalla: nunca se sobrepone a la foto).
 * La foto CUBRE todo el espacio (se recorta lo que sobra) y los botones flotan encima.
 */
function TarjetaUnica({ perfiles, indice, setIndice, meEncantaIds, onToggleMeEncanta, onPedirDescartar, soyVip, botonFiltros }: {
  perfiles: PerfilPublico[]; indice: number; setIndice: (i: number) => void;
  meEncantaIds: Set<string>; onToggleMeEncanta: (id: string) => void;
  onPedirDescartar: (p: PerfilPublico) => void; soyVip: boolean;
  botonFiltros: ReactNode;
}) {
  const total = perfiles.length;
  const actual = total > 0 ? ((indice % total) + total) % total : 0;
  const p = perfiles[actual];

  const [fotoIdx, setFotoIdx] = useState(0);
  const inicio = useRef<{ x: number; y: number } | null>(null);

  // Al cambiar de perfil se empieza otra vez por su primera foto.
  useEffect(() => { setFotoIdx(0); }, [p?.id]);

  if (!p) return <p className="text-sm text-vela-text-faint text-center py-8">No hay perfiles disponibles por ahora.</p>;

  const fotos = p.fotos_urls.length > 0 ? p.fotos_urls : p.foto_url ? [p.foto_url] : [];
  const idxFoto = Math.min(fotoIdx, Math.max(0, fotos.length - 1));
  const fotoActual = fotos[idxFoto] ?? null;

  // Pasa de perfil; al llegar al último vuelve al primero.
  function siguientePerfil() { setIndice((actual + 1) % total); }
  function anteriorPerfil() { setIndice((actual - 1 + total) % total); }
  function siguienteFoto() { if (idxFoto < fotos.length - 1) setFotoIdx(idxFoto + 1); }
  function anteriorFoto() { if (idxFoto > 0) setFotoIdx(idxFoto - 1); }

  function alBajar(e: React.PointerEvent<HTMLDivElement>) {
    inicio.current = { x: e.clientX, y: e.clientY };
  }
  function alSoltar(e: React.PointerEvent<HTMLDivElement>) {
    const ini = inicio.current;
    inicio.current = null;
    if (!ini) return;
    // Los botones (✕, ❤️, ojo, filtros) hacen lo suyo; no cuentan como toque en la foto.
    if ((e.target as HTMLElement).closest('button, a')) return;

    const dx = e.clientX - ini.x;
    const dy = e.clientY - ini.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // Deslizar (a los lados o hacia arriba/abajo) = pasar de perfil.
    if (Math.max(absX, absY) >= 50) {
      if (absX > absY) {
        if (dx < 0) siguientePerfil(); else anteriorPerfil();
      } else {
        if (dy < 0) siguientePerfil(); else anteriorPerfil();
      }
      return;
    }
    // Un toque quieto: lado izquierdo = foto anterior, lado derecho = foto siguiente.
    if (absX < 10 && absY < 10) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < rect.width * 0.4) anteriorFoto();
      else if (x > rect.width * 0.6) siguienteFoto();
    }
  }

  return (
    <div
      className="relative flex min-h-0 w-full flex-1 select-none flex-col justify-end overflow-hidden bg-black"
      style={{ ...(estiloAro(p.plan, soyVip) ?? {}), touchAction: 'none' }}
      onPointerDown={alBajar}
      onPointerUp={alSoltar}
      onPointerCancel={() => { inicio.current = null; }}
    >
      {fotoActual ? (
        // La foto cubre TODO el espacio (como Tinder): se recorta lo que sobra, sin franjas vacías.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fotoActual}
          alt={p.alias}
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-cover"
          style={{ objectPosition: '50% 30%' }}
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: p.avatar_color }} />
      )}
      {/* Sombras para que el texto y los botones se lean sobre cualquier foto */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />

      {/* Barritas: cuántas fotos tiene el perfil y en cuál vas */}
      {fotos.length > 1 && (
        <div className="absolute top-2 left-3 right-3 z-20 flex gap-1 pointer-events-none">
          {fotos.map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i === idxFoto ? 'bg-white' : 'bg-white/40'}`} />
          ))}
        </div>
      )}

      {/* Fila de arriba (flotando sobre la foto): posición, plan y filtros */}
      <div className="absolute top-6 left-3 right-3 z-20 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 pointer-events-none">
          <span className="text-[11px] font-bold bg-black/45 text-white rounded-full px-2.5 py-1">
            {actual + 1} / {total}
          </span>
          {p.plan === 'vip' && (
            <span className="text-[10px] font-extrabold bg-vela-amber text-black rounded-full px-2.5 py-1">★ VIP</span>
          )}
          {soyVip && p.plan !== 'vip' && colorAro(p.plan, true) && (
            <span
              className="text-[10px] font-extrabold text-black rounded-full px-2.5 py-1"
              style={{ backgroundColor: colorAro(p.plan, true) ?? undefined }}
            >
              {ETIQUETA_PLAN[p.plan]}
            </span>
          )}
        </div>
        {botonFiltros}
      </div>

      <div className="relative z-20 flex items-end justify-between gap-3 px-5 pb-3 text-white">
        <div className="min-w-0 pointer-events-none">
          <p className="text-3xl font-extrabold italic truncate drop-shadow">{p.alias}{p.edad ? `, ${p.edad}` : ''}</p>
          <LineasInfo
            p={p}
            tamIcono={18}
            claseUbicacion="text-sm opacity-95"
            claseRegalo="text-sm opacity-95"
            textoSinCiudad="Sin ciudad"
          />
        </div>
        <Link
          href={`/perfil-detalle/${p.id}`}
          aria-label={`Ver perfil completo de ${p.alias}`}
          title="Ver perfil completo"
          className="shrink-0 w-12 h-12 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center text-white"
        >
          <IconoOjo size={24} />
        </Link>
      </div>
      {/* Botones flotantes de rechazar / me gusta */}
      <div className="relative z-20 flex gap-5 justify-center pb-6 pt-1">
        <button
          type="button"
          onClick={() => onPedirDescartar(p)}
          className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-vela-safety shadow-xl"
          aria-label="Eliminar perfil"
        ><IconoCerrar size={28} stroke={2.4} /></button>
        <BotonMeEncanta
          activo={meEncantaIds.has(p.id)}
          onClick={() => onToggleMeEncanta(p.id)}
          clase="w-16 h-16 rounded-full"
          tam={28}
        />
      </div>
    </div>
  );
}

function TarjetaGrid({ p, soyVip, meEncanta, onToggleMeEncanta, onPedirDescartar }: {
  p: PerfilPublico; soyVip: boolean; meEncanta: boolean;
  onToggleMeEncanta: (id: string) => void; onPedirDescartar: (p: PerfilPublico) => void;
}) {
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

      {/* Tocar la imagen abre el perfil; los botones van por encima */}
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
          <BotonMeEncanta
            activo={meEncanta}
            onClick={() => onToggleMeEncanta(p.id)}
            clase="w-11 h-11 rounded-full"
            tam={22}
          />
        </div>
      </div>
    </div>
  );
}

function TarjetaLista({ p, soyVip, meEncanta, onToggleMeEncanta, onPedirDescartar }: {
  p: PerfilPublico; soyVip: boolean; meEncanta: boolean;
  onToggleMeEncanta: (id: string) => void; onPedirDescartar: (p: PerfilPublico) => void;
}) {
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
        <BotonMeEncanta
          activo={meEncanta}
          onClick={() => onToggleMeEncanta(p.id)}
          clase="flex-1 h-12 rounded-full"
          tam={24}
        />
      </div>
    </div>
  );
}

function ModalFiltros({
  tieneVistas, esAvanzado, onBloqueado, vista, cambiarVista, busqueda, setBusqueda,
  edadMin, edadMax, setEdadMin, setEdadMax, ciudadFiltro, setCiudadFiltro,
  calMinFiltro, setCalMinFiltro, chipsFiltro, toggleChipFiltro, hayFiltros, onLimpiar, onCerrar,
}: {
  tieneVistas: boolean;
  esAvanzado: boolean;
  onBloqueado: (f: 'vistas_extra' | 'filtros_avanzados') => void;
  vista: Vista; cambiarVista: (v: Vista) => void;
  busqueda: string; setBusqueda: (s: string) => void;
  edadMin: number; edadMax: number; setEdadMin: (n: number) => void; setEdadMax: (n: number) => void;
  ciudadFiltro: string; setCiudadFiltro: (s: string) => void;
  calMinFiltro: number; setCalMinFiltro: (n: number) => void;
  chipsFiltro: string[]; toggleChipFiltro: (c: string) => void;
  hayFiltros: boolean;
  onLimpiar: () => void;
  onCerrar: () => void;
}) {
  const OPCIONES_VISTA: { id: Vista; texto: string }[] = [
    { id: 'tarjeta', texto: 'Tarjeta' },
    { id: 'cuadricula', texto: 'Cuadrícula' },
    { id: 'lista', texto: 'Lista' },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50">
      <div className="bg-vela-bg border border-vela-line rounded-t-[28px] sm:rounded-[28px] max-w-md w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-vela-line">
          <h2 className="text-xl font-bold text-vela-text">Filtros</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="w-11 h-11 rounded-full bg-vela-surface-2 flex items-center justify-center text-vela-text-dim"><IconoCerrar size={20} stroke={2.2} /></button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          <div>
            <label className="text-xs font-semibold text-vela-text-faint">Buscar por alias</label>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Escribe un alias..."
              className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none focus:border-vela-public/60"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-vela-text-faint mb-2">Cómo ver los perfiles</p>
            <div className="flex gap-1 bg-vela-surface-2 rounded-2xl p-1">
              {OPCIONES_VISTA.map((o) => {
                const bloqueada = !tieneVistas && o.id !== 'tarjeta';
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => cambiarVista(o.id)}
                    className={`flex-1 h-11 rounded-xl text-sm font-semibold ${
                      vista === o.id ? 'bg-vela-public text-white' : 'text-vela-text-faint'
                    }`}
                  >
                    {bloqueada && <span aria-hidden="true">🔒 </span>}
                    {o.texto}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-vela-text-faint mb-2">Rango de edad: {edadMin} – {edadMax}</p>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-[11px] text-vela-text-faint mb-1">Desde {edadMin} años</p>
                <input
                  type="range" min={EDAD_MINIMA} max={EDAD_TOPE} value={edadMin}
                  onChange={(e) => setEdadMin(Number(e.target.value))}
                  className="w-full accent-vela-public"
                />
              </div>
              <div>
                <p className="text-[11px] text-vela-text-faint mb-1">Hasta {edadMax} años</p>
                <input
                  type="range" min={EDAD_MINIMA} max={EDAD_TOPE} value={edadMax}
                  onChange={(e) => setEdadMax(Number(e.target.value))}
                  className="w-full accent-vela-public"
                />
              </div>
            </div>
          </div>

          {/* Filtros avanzados: se ven siempre; sin el plan, al tocarlos sube la ventana de planes. */}
          <div className="relative">
            <div
              className={`flex flex-col gap-5 ${esAvanzado ? '' : 'pointer-events-none select-none opacity-50'}`}
              aria-hidden={!esAvanzado}
            >
              <div>
                <label className="text-xs font-semibold text-vela-text-faint">Ciudad</label>
                <input
                  value={ciudadFiltro}
                  onChange={(e) => setCiudadFiltro(e.target.value)}
                  placeholder="Ej. San Salvador"
                  tabIndex={esAvanzado ? 0 : -1}
                  className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none"
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-vela-text-faint mb-2">Calificación mínima: {calMinFiltro > 0 ? `★ ${calMinFiltro}` : 'Cualquiera'}</p>
                <input
                  type="range" min={0} max={5} step={0.5} value={calMinFiltro}
                  onChange={(e) => setCalMinFiltro(Number(e.target.value))}
                  tabIndex={esAvanzado ? 0 : -1}
                  className="w-full accent-vela-public"
                />
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
                            tabIndex={esAvanzado ? 0 : -1}
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
            </div>

            {!esAvanzado && (
              <button
                type="button"
                onClick={() => onBloqueado('filtros_avanzados')}
                className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl"
                aria-label="Filtros avanzados: disponibles en Gold y VIP"
              >
                <span className="rounded-full border border-vela-line bg-vela-bg px-4 py-2 text-xs font-bold text-vela-text shadow-lg">
                  🔒 Gold y VIP · Toca para desbloquear
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-vela-line flex gap-3">
          {hayFiltros && (
            <button
              type="button"
              onClick={onLimpiar}
              className="h-14 px-5 rounded-full bg-vela-surface-2 border border-vela-line text-vela-text-dim font-bold text-sm"
            >
              Limpiar
            </button>
          )}
          <button onClick={onCerrar} className="flex-1 h-14 rounded-full bg-vela-public text-white font-bold text-base flex items-center justify-center gap-2">
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
  plan: string | null;
  avatar_color: string;
  foto_url: string | null;
  fecha: string;
  hora: string;
  duracion: string;
  lugar: string;
  tipo: string;
  mensaje: string;
};

/** Nombre bonito del plan de quien envía la solicitud: Básico, Premium, Gold o VIP. */
function etiquetaPlan(plan: string | null): string | null {
  if (!plan) return null;
  return (CAPACIDADES as Record<string, { label: string }>)[plan]?.label ?? plan;
}

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
      const { data: clientes } = await supabase.from('perfiles_publicos').select('id, alias, avatar_color, fotos, plan').in('id', clienteIds);
      clientesMap = Object.fromEntries((clientes ?? []).map((c: any) => [
        c.id,
        { ...c, foto_url: c.fotos && c.fotos.length > 0 ? resolverFotoUrl(supabase, c.fotos[0]) : null },
      ]));
    }

    setSolicitudes((data ?? []).map((s: any) => ({
      id: s.id,
      cliente_id: s.cliente_id,
      alias: clientesMap[s.cliente_id]?.alias ?? 'Perfil',
      plan: clientesMap[s.cliente_id]?.plan ?? null,
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
            .select('id, alias, avatar_color, fotos, plan')
            .eq('id', fila.cliente_id)
            .maybeSingle();
          if (!cliente) return;

          setSolicitudes((prev) => [
            {
              id: fila.id,
              cliente_id: fila.cliente_id,
              alias: cliente.alias ?? 'Perfil',
              plan: cliente.plan ?? null,
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
            {perfil?.plan === 'vip' ? '100%' : perfil?.plan === 'gold' ? '75%' : perfil?.plan === 'premium' ? '50%' : '25%'}
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
                <div className="min-w-0">
                  <p className="text-lg font-bold text-vela-text italic truncate">{s.alias}</p>
                  {etiquetaPlan(s.plan) && (
                    <p
                      className="text-xs font-extrabold tracking-wide"
                      style={{ color: (s.plan && colorAro(s.plan, true)) || undefined }}
                    >
                      Plan {etiquetaPlan(s.plan)}
                    </p>
                  )}
                </div>
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