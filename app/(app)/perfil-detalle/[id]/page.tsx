'use client';

import { useState, useEffect, use as usePromise, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/lib/session/SessionProvider';
import { CHIPS_NEGATIVOS } from '@/lib/calificaciones/chipsCalificacion';
import GaleriaPerfil from '@/components/GaleriaPerfil';
import { notificarMeEncanta } from '@/lib/notificaciones/meEncanta';
import { colorAro, ETIQUETA_PLAN } from '@/lib/planes/colorPlan';
import { ESTADO_CANCELADA, ESTADO_FINALIZADA } from '@/lib/citas/estados';
import Link from 'next/link';

type PerfilPublico = {
  id: string;
  alias: string;
  avatar_color: string;
  ciudad: string | null;
  estatura: string | null;
  edad: number | null;
  idiomas: string | null;
  disponible: string | null;
  ocupacion: string | null;
  fotos: string[] | null;
  verificado: boolean;
  calificacion_prom: number | null;
  plan: string;
  regalo: string | null;
  nota_publica: string | null;
};

type ResenaRecibida = {
  id: string;
  estrellas: number;
  chips: string[];
  creado_en: string;
};

const TIPO_LUGAR = ['Hotel', 'Restaurante', 'Café', 'Centro comercial', 'Otro'];
const DURACIONES = ['30 minutos', '1 hora', '1 hora 30 min', '2 horas', '3 horas', '4 horas'];
const QUE_BUSCAS = ['Cena', 'Compañía', 'Conversación', 'Evento', 'Otro'];
const MOTIVOS_RECHAZO = [...CHIPS_NEGATIVOS, 'Otro'];

export default function PerfilDetalle({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="flex-1 flex items-center justify-center"><p className="text-sm text-vela-text-faint">Cargando...</p></main>}>
      <PerfilDetalleContenido params={params} />
    </Suspense>
  );
}

function PerfilDetalleContenido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { perfil: miPerfil } = useSession();

  const [profile, setProfile] = useState<PerfilPublico | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const [meEncantaRecibidos, setMeEncantaRecibidos] = useState(0);
  const [meEncantaDado, setMeEncantaDado] = useState(false);
  const [resenas, setResenas] = useState<ResenaRecibida[]>([]);
  const [cargando, setCargando] = useState(true);
  const [miUserId, setMiUserId] = useState<string | null>(null);
  const [solicitudPendiente, setSolicitudPendiente] = useState(false);
  const [chatVigenteId, setChatVigenteId] = useState<string | null>(null);

  const [showSolicitud, setShowSolicitud] = useState(searchParams.get('solicitud') === '1');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('19:00');
  const [horaH, setHoraH] = useState(7);
  const [horaM, setHoraM] = useState(0);
  const [horaPeriodo, setHoraPeriodo] = useState<'AM' | 'PM'>('PM');
  const [duracion, setDuracion] = useState('');
  const [tipoLugar, setTipoLugar] = useState('');
  const [direccion, setDireccion] = useState('');
  const [queBuscas, setQueBuscas] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState('');
  const [solicitudEnviada, setSolicitudEnviada] = useState(false);

  const [showRechazo, setShowRechazo] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState<string | null>(null);
  const [comentarioRechazo, setComentarioRechazo] = useState('');
  const [enviandoRechazo, setEnviandoRechazo] = useState(false);
  const [errorRechazo, setErrorRechazo] = useState('');
  const [rechazoEnviado, setRechazoEnviado] = useState(false);

  useEffect(() => {
    const h24 = horaPeriodo === 'PM' ? (horaH % 12) + 12 : horaH % 12;
    const hh = String(h24).padStart(2, '0');
    const mm = String(horaM).padStart(2, '0');
    setHora(`${hh}:${mm}`);
  }, [horaH, horaM, horaPeriodo]);

  useEffect(() => {
    (async () => {
      setCargando(true);
      const supabase = createClient();

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;
      setMiUserId(userId);

      const { data } = await supabase.from('perfiles_publicos').select('*').eq('id', id).single();
      setProfile(data);

      const { data: chipsData } = await supabase.from('perfil_chips_preferencia').select('chip').eq('perfil_id', id);
      setChips((chipsData ?? []).map((c: any) => c.chip));

      const { count } = await supabase.from('favoritos').select('*', { count: 'exact', head: true }).eq('perfil_guardado', id);
      setMeEncantaRecibidos(count ?? 0);

      if (userId) {
        const { data: favData } = await supabase
          .from('favoritos')
          .select('usuario_id')
          .eq('usuario_id', userId)
          .eq('perfil_guardado', id)
          .maybeSingle();
        setMeEncantaDado(!!favData);

        // ¿Ya hay una solicitud enviada, o una aceptada con cita todavía vigente?
        const { data: solPend } = await supabase
          .from('solicitudes')
          .select('id')
          .eq('cliente_id', userId)
          .eq('proveedora_id', id)
          .limit(1)
          .maybeSingle();
        setSolicitudPendiente(!!solPend);

        const { data: chatPar } = await supabase
          .from('chats')
          .select('id')
          .eq('cliente_id', userId)
          .eq('proveedora_id', id)
          .maybeSingle();
        let vigente: string | null = null;
        if (chatPar) {
          const { data: ultimaCita } = await supabase
            .from('citas')
            .select('estado_manual')
            .eq('chat_id', chatPar.id)
            .order('hora_acordada', { ascending: false })
            .limit(1)
            .maybeSingle();
          const cerrada = ultimaCita?.estado_manual === ESTADO_FINALIZADA || ultimaCita?.estado_manual === ESTADO_CANCELADA;
          // Chat sin cita todavía también cuenta como vigente (la cita se prepara dentro del chat).
          if (!cerrada) vigente = chatPar.id;
        }
        setChatVigenteId(vigente);
      }

      const { data: resenasData } = await supabase
        .from('resenas_publicas')
        .select('*')
        .eq('calificado_id', id);
      setResenas(
        (resenasData ?? [])
          .slice()
          .sort((a: any, b: any) => new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime())
          .map((r: any) => ({
            id: r.id,
            estrellas: r.estrellas,
            chips: r.chips ?? [],
            creado_en: r.creado_en,
          }))
      );

      setCargando(false);
    })();
  }, [id]);

  async function toggleMeEncanta() {
    if (!miUserId) return;
    const supabase = createClient();
    if (meEncantaDado) {
      await supabase.from('favoritos').delete().eq('usuario_id', miUserId).eq('perfil_guardado', id);
      setMeEncantaDado(false);
      setMeEncantaRecibidos((n) => Math.max(0, n - 1));
    } else {
      const { error } = await supabase.from('favoritos').insert({ usuario_id: miUserId, perfil_guardado: id });
      if (!error) {
        setMeEncantaDado(true);
        setMeEncantaRecibidos((n) => n + 1);
        await notificarMeEncanta(supabase, {
          paraId: id,
          paraPlan: profile?.plan,
          deAlias: miPerfil?.alias,
          dePlan: miPerfil?.plan,
        });
      }
    }
  }

  function compartirWhatsApp() {
    if (!profile) return;
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const texto = encodeURIComponent(`Mira el perfil de ${profile.alias} en Vela: ${url}`);
    window.open(`https://wa.me/?text=${texto}`, '_blank');
  }

  async function confirmarRechazo() {
    if (!miUserId || !motivoRechazo || enviandoRechazo) return;
    if (motivoRechazo === 'Otro' && !comentarioRechazo.trim()) {
      setErrorRechazo('Escribe el motivo.');
      return;
    }
    setEnviandoRechazo(true);
    setErrorRechazo('');
    const supabase = createClient();
    const motivoFinal = motivoRechazo === 'Otro' ? `Otro: ${comentarioRechazo.trim()}` : motivoRechazo;

    const { error } = await supabase.from('bloqueos').upsert(
      { proveedora_id: id, cliente_id: miUserId, motivo: motivoFinal },
      { onConflict: 'proveedora_id,cliente_id' }
    );

    setEnviandoRechazo(false);
    if (error) {
      console.error('Error bloqueando perfil:', error.message, error.details, error.hint, error.code);
      setErrorRechazo('No se pudo completar. Intenta de nuevo.');
      return;
    }

    setRechazoEnviado(true);
    setTimeout(() => router.push('/explorar'), 1400);
  }

  async function enviarSolicitud() {
    if (!fecha || !hora || !duracion || !tipoLugar || !queBuscas || enviando || solicitudPendiente || chatVigenteId) return;
    // La dirección es obligatoria para cualquier tipo de lugar.
    if (!direccion.trim()) {
      setErrorEnvio('Escribe la dirección o el nombre del lugar.');
      return;
    }
    setEnviando(true);
    setErrorEnvio('');
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) { setEnviando(false); return; }

    // Verificamos que esta proveedora no haya bloqueado a este cliente
    // antes de permitir enviar la solicitud (por si llegó directo a la
    // URL del perfil sin pasar por la lista filtrada de Explorar).
    const { data: bloqueo } = await supabase
      .from('bloqueos')
      .select('id')
      .eq('proveedora_id', id)
      .eq('cliente_id', userId)
      .maybeSingle();

    if (bloqueo) {
      setEnviando(false);
      setErrorEnvio('No puedes enviar solicitudes a este perfil.');
      return;
    }

    const lugarCombinado = tipoLugar === 'Otro' ? direccion.trim() : `${tipoLugar} · ${direccion.trim()}`;

    const { data: nuevaSolicitud, error } = await supabase.from('solicitudes').insert({
      cliente_id: userId,
      proveedora_id: id,
      fecha,
      hora,
      duracion,
      lugar: lugarCombinado,
      tipo: queBuscas,
      mensaje: mensaje.trim(),
    }).select().single();

    setEnviando(false);
    if (error) {
      console.error('Error enviando solicitud:', error.message, error.details, error.hint, error.code);
      setErrorEnvio('No se pudo enviar la solicitud. Intenta de nuevo.');
      return;
    }

    // Notificacion para quien recibe la solicitud.
    const { error: notifError } = await supabase.from('notificaciones').insert({
      para_usuario_id: id,
      mensaje: `${miPerfil?.alias ?? 'Alguien'} te envió una solicitud de encuentro.`,
      ruta: '/explorar',
    });
    if (notifError) {
      console.error('Error creando notificación:', notifError.message, notifError.details, notifError.hint, notifError.code);
      // No bloqueamos el flujo por esto — la solicitud ya se envio
      // bien, la notificacion es un extra.
    }

    setSolicitudEnviada(true);
  }

  if (cargando || !profile) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-vela-text-faint">Cargando...</p>
      </main>
    );
  }

  const fotos = profile.fotos ?? [];
  const soyVip = miPerfil?.plan === 'vip';
  const aro = colorAro(profile.plan, soyVip);
  const bloqueaNueva = solicitudPendiente || !!chatVigenteId;

  return (
    <main className="flex-1 flex flex-col max-w-md mx-auto w-full">
      <div className="relative aspect-[4/5] bg-vela-surface overflow-hidden">
        <GaleriaPerfil fotos={fotos} colorFondo={profile.avatar_color} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
        {aro && (
          <div className="absolute inset-0 z-10 pointer-events-none border-4" style={{ borderColor: aro }} />
        )}
        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 z-20 w-11 h-11 rounded-full bg-black/40 text-white flex items-center justify-center"
        >←</button>

        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          <button
            onClick={compartirWhatsApp}
            className="w-11 h-11 rounded-full bg-black/40 text-white flex items-center justify-center text-sm"
            title="Compartir por WhatsApp"
          >↗</button>
          <button
            onClick={toggleMeEncanta}
            className={`w-11 h-11 rounded-full flex items-center justify-center text-sm ${meEncantaDado ? 'bg-vela-safety text-white' : 'bg-black/40 text-white'}`}
            title="Me encanta"
          >{meEncantaDado ? '❤️' : '🤍'}</button>
          {profile.plan === 'vip' && (
            <span className="text-xs font-extrabold bg-vela-amber text-black rounded-full px-3 py-1">★ VIP</span>
          )}
          {aro && (
            <span className="text-xs font-extrabold text-black rounded-full px-3 py-1" style={{ backgroundColor: aro }}>
              {ETIQUETA_PLAN[profile.plan]}
            </span>
          )}
        </div>

        <div className="absolute bottom-4 left-4 right-4 text-white pointer-events-none">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold italic">{profile.alias}{profile.edad ? `, ${profile.edad}` : ''}</h1>
            {profile.verificado && <span className="text-vela-verified">✓</span>}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-vela-amber text-sm">★ {(profile.calificacion_prom ?? 0).toFixed(1)}</span>
            {meEncantaRecibidos > 0 && <span className="text-sm opacity-90">❤️ {meEncantaRecibidos}</span>}
          </div>
          <p className="text-sm opacity-80 mt-1">📍 {profile.ciudad || 'Sin ciudad'} · 🏃 {profile.estatura || '—'}</p>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Dato label="Idiomas" valor={profile.idiomas} />
          <Dato label="Disponible" valor={profile.disponible} />
          <Dato label="Ocupación" valor={profile.ocupacion} clase="col-span-2" />
        </div>

        {/* Regalo resaltado: lo que le gustaría recibir */}
        <div className="rounded-3xl border-2 border-vela-amber bg-vela-amber/10 p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-vela-amber/20 flex items-center justify-center text-3xl flex-shrink-0">🎁</div>
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold text-vela-amber tracking-wide">REGALO QUE LE GUSTARÍA RECIBIR</p>
            <p className="text-lg font-bold text-vela-text leading-snug break-words">{profile.regalo || 'Sin especificar'}</p>
          </div>
        </div>

        {profile.nota_publica && (
          <div>
            <p className="text-xs font-bold text-vela-text-faint mb-1 tracking-wide">SOBRE MÍ</p>
            <p className="text-sm text-vela-text leading-relaxed bg-vela-surface border border-vela-line rounded-2xl p-4">
              {profile.nota_publica}
            </p>
          </div>
        )}

        {chips.length > 0 && (
          <div>
            <p className="text-xs font-bold text-vela-text-faint mb-2 tracking-wide">PREFERENCIAS</p>
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <span key={c} className="text-sm bg-vela-public-soft border border-vela-public/30 text-vela-public rounded-full px-4 py-2">{c}</span>
              ))}
            </div>
          </div>
        )}

        {resenas.length > 0 && (
          <div>
            <p className="text-xs font-bold text-vela-text-faint mb-2 tracking-wide">RESEÑAS ({resenas.length})</p>
            <div className="flex flex-col gap-2">
              {resenas.slice(0, 5).map((r) => (
                <div key={r.id} className="bg-vela-surface border border-vela-line rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-vela-text-faint">
                      {new Date(r.creado_en).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="text-vela-amber text-xs">{'★'.repeat(r.estrellas)}{'☆'.repeat(5 - r.estrellas)}</span>
                  </div>
                  {r.chips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {r.chips.map((c) => (
                        <span key={c} className="text-[11px] bg-vela-surface-2 border border-vela-line text-vela-text-faint rounded-full px-2 py-0.5">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {solicitudPendiente && !solicitudEnviada && (
          <div className="bg-vela-surface-2 border border-vela-line rounded-2xl p-5 text-center">
            <p className="text-sm font-bold text-vela-text">⏳ Solicitud enviada</p>
            <p className="text-xs text-vela-text-faint mt-1">Ya enviaste una solicitud a {profile.alias}. Te avisaremos cuando responda.</p>
          </div>
        )}

        {!solicitudPendiente && chatVigenteId && !solicitudEnviada && (
          <div className="bg-vela-public-soft border border-vela-public rounded-2xl p-5 text-center">
            <p className="text-sm font-bold text-vela-text">✓ {profile.alias} aceptó tu solicitud</p>
            <p className="text-xs text-vela-text-faint mt-1">Entra al chat para confirmar el encuentro y reservar el horario.</p>
            <Link
              href={`/chat/${chatVigenteId}`}
              className="mt-3 inline-flex items-center justify-center h-12 px-6 rounded-full bg-vela-public text-white text-sm font-bold"
            >
              Ir al chat y confirmar →
            </Link>
          </div>
        )}

        {rechazoEnviado && (
          <div className="bg-vela-surface-2 border border-vela-line rounded-2xl p-5 text-center">
            <p className="text-sm font-bold text-vela-text">Perfil rechazado</p>
            <p className="text-xs text-vela-text-faint mt-1">Ya no lo verás en tu búsqueda.</p>
          </div>
        )}

        {!showSolicitud && !solicitudEnviada && !rechazoEnviado && !showRechazo && !bloqueaNueva && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setShowSolicitud(true)}
              className="flex-1 h-14 rounded-full bg-vela-public text-white font-bold text-base flex items-center justify-center gap-2"
            >
              Enviar solicitud de encuentro
              <IconoFlecha />
            </button>
            <button
              onClick={() => setShowRechazo(true)}
              className="w-14 h-14 rounded-full bg-vela-surface-2 border border-vela-line text-vela-text-faint font-bold text-base flex items-center justify-center"
              title="No me interesa este perfil"
            >
              ✕
            </button>
          </div>
        )}

        {showRechazo && !rechazoEnviado && (
          <div className="bg-vela-surface border border-vela-line rounded-3xl p-5 flex flex-col gap-4 mt-2">
            <h3 className="text-lg font-bold text-vela-text">¿Por qué rechazas este perfil?</h3>
            <div className="flex flex-wrap gap-2">
              {MOTIVOS_RECHAZO.map((m) => (
                <ChipSel key={m} texto={m} activo={motivoRechazo === m} onClick={() => setMotivoRechazo(m)} />
              ))}
            </div>
            {motivoRechazo === 'Otro' && (
              <textarea
                value={comentarioRechazo}
                onChange={(e) => setComentarioRechazo(e.target.value)}
                placeholder="Cuéntanos por qué"
                rows={3}
                className="w-full bg-vela-surface-2 border border-vela-line rounded-2xl px-4 py-3 text-base text-vela-text outline-none resize-none"
              />
            )}
            {errorRechazo && <p className="text-xs text-vela-safety">{errorRechazo}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowRechazo(false); setMotivoRechazo(null); setComentarioRechazo(''); setErrorRechazo(''); }}
                className="flex-1 h-14 rounded-full bg-vela-surface-2 border border-vela-line text-vela-text font-bold text-base"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarRechazo}
                disabled={!motivoRechazo || enviandoRechazo}
                className="flex-1 h-14 rounded-full bg-vela-safety text-white font-bold text-base disabled:opacity-50"
              >
                {enviandoRechazo ? 'Enviando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}

        {solicitudEnviada && (
          <div className="bg-vela-verified-soft border border-vela-verified rounded-2xl p-5 text-center">
            <p className="text-sm font-bold text-vela-text">✓ Solicitud enviada</p>
            <p className="text-xs text-vela-text-faint mt-1">Te avisaremos cuando {profile.alias} responda.</p>
          </div>
        )}

        {showSolicitud && !solicitudEnviada && !bloqueaNueva && (
          <div className="bg-vela-surface border border-vela-line rounded-3xl p-5 flex flex-col gap-4 mt-2">
            <h3 className="text-lg font-bold text-vela-text">Detalles del encuentro</h3>

            <div>
              <label className="text-xs font-semibold text-vela-text-faint">Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none [color-scheme:dark]" />
            </div>
            <div>
              <label className="text-xs font-semibold text-vela-text-faint">Hora</label>
              <div className="flex gap-2 mt-1">
                <select
                  value={horaH}
                  onChange={(e) => setHoraH(Number(e.target.value))}
                  className="flex-1 bg-vela-surface-2 border border-vela-line rounded-2xl px-3 h-14 text-base text-vela-text outline-none [color-scheme:dark]"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <select
                  value={horaM}
                  onChange={(e) => setHoraM(Number(e.target.value))}
                  className="flex-1 bg-vela-surface-2 border border-vela-line rounded-2xl px-3 h-14 text-base text-vela-text outline-none [color-scheme:dark]"
                >
                  {[0, 15, 30, 45].map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                  ))}
                </select>
                <select
                  value={horaPeriodo}
                  onChange={(e) => setHoraPeriodo(e.target.value as 'AM' | 'PM')}
                  className="flex-1 bg-vela-surface-2 border border-vela-line rounded-2xl px-3 h-14 text-base text-vela-text outline-none [color-scheme:dark]"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-vela-text-faint">Duración</label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {DURACIONES.map((d) => (
                  <ChipSel key={d} texto={d} activo={duracion === d} onClick={() => setDuracion(d)} />
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-vela-text-faint">Tipo de lugar</label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {TIPO_LUGAR.map((t) => (
                  <ChipSel key={t} texto={t} activo={tipoLugar === t} onClick={() => setTipoLugar(t)} />
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-vela-text-faint">Dirección (obligatoria)</label>
              <input
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Nombre o dirección del lugar"
                required
                className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-vela-text-faint">¿Qué buscas?</label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {QUE_BUSCAS.map((q) => (
                  <ChipSel key={q} texto={q} activo={queBuscas === q} onClick={() => setQueBuscas(q)} />
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-vela-text-faint">Mensaje {queBuscas === 'Otro' ? '' : '(opcional)'}</label>
              <textarea
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                rows={3}
                className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 py-3 text-base text-vela-text outline-none resize-none"
              />
            </div>

            {errorEnvio && <p className="text-xs text-vela-safety">{errorEnvio}</p>}

            <button
              onClick={enviarSolicitud}
              disabled={!fecha || !hora || !duracion || !tipoLugar || !direccion.trim() || !queBuscas || enviando}
              className="w-full h-14 rounded-full bg-vela-public text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 mt-1"
            >
              {enviando ? 'Enviando...' : 'Enviar solicitud'}
              <IconoFlecha />
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function Dato({ label, valor, clase = '' }: { label: string; valor: string | null; clase?: string }) {
  return (
    <div className={`bg-vela-surface border border-vela-line rounded-2xl p-3.5 ${clase}`}>
      <p className="text-xs text-vela-text-faint">{label}</p>
      <p className="text-vela-text font-semibold">{valor || '—'}</p>
    </div>
  );
}

function ChipSel({ texto, activo, onClick }: { texto: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 rounded-full text-sm font-medium border ${
        activo ? 'bg-vela-public-soft border-vela-public text-vela-public' : 'bg-vela-surface-2 border-vela-line text-vela-text-faint'
      }`}
    >
      {texto}
    </button>
  );
}

/** Flecha de los botones principales (solo diseño). */
function IconoFlecha() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}