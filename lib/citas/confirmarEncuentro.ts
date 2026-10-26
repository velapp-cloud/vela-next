import type { SupabaseClient } from '@supabase/supabase-js';
import { ESTADO_CANCELADA } from '@/lib/citas/estados';
import { confirmarCita } from '@/lib/citas/confirmar';

export type ResultadoConfirmar = {
  error: unknown | null;
  /** 'yo' = el horario ya lo tengo reservado con otro evento; 'otro' = lo tiene reservado la otra persona. */
  choque: 'yo' | 'otro' | null;
};

// Confirma mi parte de la cita. La base de datos revisa que el horario no esté
// ya reservado: quien confirma primero se queda con el espacio.
export async function confirmarMiParte(
  supabase: SupabaseClient,
  citaId: string,
  soyCliente: boolean,
): Promise<ResultadoConfirmar> {
  const { data, error } = await supabase.rpc('confirmar_mi_parte', { p_cita_id: citaId });

  if (error || !data) return { error: error ?? new Error('Sin respuesta'), choque: null };

  if (!data.ok) {
    if (data.error === 'choque') return { error: null, choque: data.yo ? 'yo' : 'otro' };
    return { error: new Error(String(data.error)), choque: null };
  }

  if (data.ambos) {
    await supabase.from('notificaciones').insert([
      { para_usuario_id: data.cliente_id, mensaje: 'Cita confirmada por los dos. Ya está en Encuentro.', chat_id: data.chat_id, ruta: '/encuentro' },
      { para_usuario_id: data.proveedora_id, mensaje: 'Cita confirmada por los dos. Ya está en Encuentro.', chat_id: data.chat_id, ruta: '/encuentro' },
    ]);
  } else {
    const otroId = soyCliente ? data.proveedora_id : data.cliente_id;
    await supabase.from('notificaciones').insert({
      para_usuario_id: otroId,
      mensaje: 'El otro perfil ya confirmó la cita. ¿Qué esperas para confirmar tú también?',
      chat_id: data.chat_id,
      ruta: `/chat/${data.chat_id}`,
    });
  }

  return { error: null, choque: null };
}

// El cliente reagenda: resetea las confirmaciones (y con eso libera el horario
// reservado). El componente que llama a esto es quien abre el formulario de
// edicion (solo el cliente puede editar la ficha).
export async function cancelarParaReagendar(supabase: SupabaseClient, citaId: string, chatId: string, otroId: string) {
  await supabase.from('citas').update({
    cliente_confirmo: false,
    proveedora_confirmo: false,
  }).eq('id', citaId);

  await supabase.from('notificaciones').insert({
    para_usuario_id: otroId,
    mensaje: 'El otro perfil pidió reagendar la cita. Revisa los nuevos detalles.',
    chat_id: chatId,
    ruta: `/chat/${chatId}`,
  });
}

// La proveedora no puede editar la ficha directo, asi que en vez de eso
// manda un mensaje de sistema al chat + notificacion al cliente con lo
// que quiere cambiar, y resetea las confirmaciones.
export async function pedirCambiosCita(supabase: SupabaseClient, params: {
  citaId: string;
  chatId: string;
  otroId: string;
  miAlias: string;
  mensaje: string;
}) {
  await supabase.from('citas').update({
    cliente_confirmo: false,
    proveedora_confirmo: false,
  }).eq('id', params.citaId);

  await supabase.from('mensajes').insert({
    chat_id: params.chatId,
    remitente_id: null,
    tipo: 'sistema',
    texto: `${params.miAlias} pidió estos cambios en la cita: "${params.mensaje}"`,
    leido: true,
    leido_cliente: true,
    leido_proveedora: true,
  });

  await supabase.from('notificaciones').insert({
    para_usuario_id: params.otroId,
    mensaje: `${params.miAlias} pidió cambios en la cita: "${params.mensaje}"`,
    chat_id: params.chatId,
    ruta: `/chat/${params.chatId}`,
  });
}

// Cuando el cliente guarda cambios en la ficha del chat, esto sincroniza
// la fila real de `citas` (antes solo se actualizaba `chats`, por eso no
// se veia reflejado), resetea las confirmaciones porque los terminos
// cambiaron, y avisa a la proveedora.
export async function aplicarEdicionFicha(supabase: SupabaseClient, params: {
  chatId: string;
  clienteId: string;
  proveedoraId: string;
  fichaFecha: string;
  fichaHora: string;
  fichaDuracion: string;
  fichaLugar: string;
  fichaTipo: string;
  fichaMensaje: string;
  otroId: string;
  miAlias: string;
}) {
  await confirmarCita(supabase, {
    chatId: params.chatId,
    clienteId: params.clienteId,
    proveedoraId: params.proveedoraId,
    fichaFecha: params.fichaFecha,
    fichaHora: params.fichaHora,
    fichaDuracion: params.fichaDuracion,
    fichaLugar: params.fichaLugar,
    fichaTipo: params.fichaTipo,
    fichaMensaje: params.fichaMensaje,
  });

  const { data: cita } = await supabase
    .from('citas')
    .select('id')
    .eq('chat_id', params.chatId)
    .maybeSingle();

  if (cita) {
    await supabase.from('citas').update({
      cliente_confirmo: false,
      proveedora_confirmo: false,
    }).eq('id', cita.id);
  }

  await supabase.from('notificaciones').insert({
    para_usuario_id: params.otroId,
    mensaje: `${params.miAlias} actualizó los detalles de la cita. Revísalos y confirma de nuevo.`,
    chat_id: params.chatId,
    ruta: `/chat/${params.chatId}`,
  });
}

export async function cancelarYBloquear(supabase: SupabaseClient, params: {
  citaId: string;
  chatId: string;
  clienteId: string;
  proveedoraId: string;
  otroId: string;
}) {
  await supabase.from('citas').update({ estado_manual: ESTADO_CANCELADA }).eq('id', params.citaId);

  await supabase.from('bloqueos').insert({
    proveedora_id: params.proveedoraId,
    cliente_id: params.clienteId,
  });

  await supabase.from('notificaciones').insert({
    para_usuario_id: params.otroId,
    mensaje: 'El otro perfil canceló la cita y terminó la conversación.',
    ruta: '/explorar',
  });
}