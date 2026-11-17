'use client';

/**
 * app/(app)/explorar/page.tsx
 * Se comporta distinto segun el rol:
 * - cliente: explora los perfiles que le asigna la base de datos (lote de 24 horas).
 *   Pantalla principal: perfil a PANTALLA COMPLETA (como Tinder / TikTok).
 *     · la foto CUBRE toda la pantalla; los botones flotan encima
 *     · tocar el lado izquierdo/derecho de la foto = pasar de foto
 *     · deslizar hacia los LADOS = pasar de perfil (el gesto vertical queda libre para refrescar)
 *     · icono de ojo = abrir el perfil completo
 *     · corazon = SOLO da/quita "me gusta"
 *     · estrella (junto al filtro) = mi plan; al tocarla suben los planes disponibles
 *   La pantalla recuerda filtros y el perfil donde ibas.
 * - proveedor: ve las solicitudes recibidas (components/SolicitudesRecibidas.tsx).
 * Los filtros viven en components/ModalFiltrosExplorar.tsx.
 */
import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { CAPACIDADES } from '@/lib/planes/capacidades';
import { useAccesoPlan } from '@/lib/planes/accesoPlan';
import { resolverFotoUrl } from '@/lib/perfiles/resolverFoto';
import { descartarPerfil } from '@/lib/perfiles/descartarPerfil';
import FotoAjustada from '@/components/FotoAjustada';
import ModalDescartarPerfil from '@/components/ModalDescartarPerfil';
import SolicitudesRecibidas from '@/components/SolicitudesRecibidas';
import ModalFiltros, { EDAD_MINIMA, type Vista } from '@/components/ModalFiltrosExplorar';
import {
  IconoUbicacion,
  IconoEstatura,
  IconoRegalo,
  IconoCerrar,
  IconoCorazon,
} from '@/components/iconos';
import { notificarMeEncanta } from '@/lib/notificaciones/meEncanta';
import { colorAro } from '@/lib/planes/colorPlan';

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

const EDAD_MAXIMA_DEFECTO = 60;
const CLAVE_VISTA = 'vela:vista-explorar';
const CLAVE_ESTADO = 'vela:explorar-estado';

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

/** Icono de estrella (mismo tamaño que el icono de filtro). */
function IconoEstrella({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6l-5.8 3.1 1.1-6.5L2.6 9.6l6.5-.9L12 2.8z" />
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

/**
 * Estrella de MI plan, junto al filtro. Va del color de mi plan (VIP dorado, los demás con el color
 * que ya tenía cada plan). Al tocarla suben los planes disponibles.
 */
function BotonPlan({ plan, etiqueta, onClick, sobreFoto }: {
  plan: string; etiqueta: string; onClick: () => void; sobreFoto: boolean;
}) {
  const colorPropio = plan === 'vip' ? null : colorAro(plan, true);
  const claseColor =
    plan === 'vip'
      ? 'text-vela-amber'
      : colorPropio
        ? ''
        : sobreFoto ? 'text-white' : 'text-vela-text-dim';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Tu plan: ${etiqueta}. Ver planes`}
      title={`Plan ${etiqueta}`}
      className={`w-10 h-10 rounded-full border flex items-center justify-center ${claseColor} ${
        sobreFoto
          ? 'bg-black/40 border-white/30 backdrop-blur-sm'
          : 'bg-vela-surface-2 border-vela-line'
      }`}
      style={colorPropio ? { color: colorPropio } : undefined}
    >
      <IconoEstrella size={18} />
    </button>
  );
}

function ExplorarCliente() {
  const { perfil } = useSession();
  const { tieneAcceso, requerir, mostrarPlanes } = useAccesoPlan();
  const cap = perfil ? CAPACIDADES[perfil.plan] : CAPACIDADES.basico;
  const miPlan = perfil?.plan ?? 'basico';

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

  const etiquetaMiPlan = cap.label;

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
          <div className="flex items-center gap-2">
            <BotonPlan plan={miPlan} etiqueta={etiquetaMiPlan} onClick={mostrarPlanes} sobreFoto={false} />
            <BotonFiltros onClick={() => setShowFiltros(true)} activo={hayFiltros} sobreFoto={false} />
          </div>
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
          botonesArriba={
            <div className="flex items-center gap-2">
              <BotonPlan plan={miPlan} etiqueta={etiquetaMiPlan} onClick={mostrarPlanes} sobreFoto />
              <BotonFiltros onClick={() => setShowFiltros(true)} activo={hayFiltros} sobreFoto />
            </div>
          }
        />
      ) : vistaActual === 'cuadricula' ? (
        <div className="grid grid-cols-2 gap-3">
          {limitados.map((p) => (
            <TarjetaGrid key={p.id} p={p} meEncanta={meEncantaIds.has(p.id)} onToggleMeEncanta={toggleMeEncanta} onPedirDescartar={pedirDescartar} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {limitados.map((p) => (
            <TarjetaLista key={p.id} p={p} meEncanta={meEncantaIds.has(p.id)} onToggleMeEncanta={toggleMeEncanta} onPedirDescartar={pedirDescartar} />
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
 *
 * Gestos: tocar los lados = foto; deslizar hacia los LADOS = perfil.
 * El gesto vertical NO se usa (touch-action: pan-y), así el navegador puede refrescar la página
 * con el jalón normal de arriba hacia abajo.
 */
function TarjetaUnica({ perfiles, indice, setIndice, meEncantaIds, onToggleMeEncanta, onPedirDescartar, botonesArriba }: {
  perfiles: PerfilPublico[]; indice: number; setIndice: (i: number) => void;
  meEncantaIds: Set<string>; onToggleMeEncanta: (id: string) => void;
  onPedirDescartar: (p: PerfilPublico) => void;
  botonesArriba: ReactNode;
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
    // Los botones (✕, ❤️, ojo, estrella, filtros) hacen lo suyo; no cuentan como toque en la foto.
    if ((e.target as HTMLElement).closest('button, a')) return;

    const dx = e.clientX - ini.x;
    const dy = e.clientY - ini.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // Deslizar hacia los lados = pasar de perfil. Hacia arriba/abajo no hace nada (queda libre para refrescar).
    if (absX >= 50 && absX > absY) {
      if (dx < 0) siguientePerfil(); else anteriorPerfil();
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
      style={{ touchAction: 'pan-y' }}
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

      {/* Fila de arriba (flotando sobre la foto): posición, estrella de mi plan y filtros */}
      <div className="absolute top-6 left-3 right-3 z-20 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 pointer-events-none">
          <span className="text-[11px] font-bold bg-black/45 text-white rounded-full px-2.5 py-1">
            {actual + 1} / {total}
          </span>
        </div>
        {botonesArriba}
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

function TarjetaGrid({ p, meEncanta, onToggleMeEncanta, onPedirDescartar }: {
  p: PerfilPublico; meEncanta: boolean;
  onToggleMeEncanta: (id: string) => void; onPedirDescartar: (p: PerfilPublico) => void;
}) {
  const foto = p.foto_url;
  return (
    <div className="relative rounded-3xl overflow-hidden border border-vela-line bg-vela-surface aspect-[3/4.4]">
      {foto ? (
        <FotoAjustada src={foto} />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: p.avatar_color }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent pointer-events-none" />

      {/* Tocar la imagen abre el perfil; los botones van por encima */}
      <Link href={`/perfil-detalle/${p.id}`} className="absolute inset-0 z-10" aria-label={`Ver perfil de ${p.alias}`} />

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

function TarjetaLista({ p, meEncanta, onToggleMeEncanta, onPedirDescartar }: {
  p: PerfilPublico; meEncanta: boolean;
  onToggleMeEncanta: (id: string) => void; onPedirDescartar: (p: PerfilPublico) => void;
}) {
  const foto = p.foto_url;
  return (
    <div className="bg-vela-surface border border-vela-line rounded-2xl p-4 flex flex-col gap-3">
      <Link href={`/perfil-detalle/${p.id}`} className="flex gap-3 items-center">
        <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: p.avatar_color }}>
          {foto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="" className="w-full h-full object-cover object-top" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-vela-text italic truncate">{p.alias}{p.edad ? `, ${p.edad}` : ''}</p>
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