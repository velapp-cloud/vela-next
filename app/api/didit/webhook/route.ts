import { NextResponse } from 'next/server';
import { crearClienteServicio } from '@/lib/supabase/servicio';
import { validarFirmaDidit } from '@/lib/didit/cliente';

/** Junta las advertencias de cada módulo (ID, liveness, face match) como textos cortos. */
function reunirMotivos(decision: any): string[] {
  const motivos: string[] = [];
  const grupos = ['id_verifications', 'liveness_checks', 'face_matches'];
  for (const g of grupos) {
    for (const item of decision?.[g] ?? []) {
      if (item?.status && item.status !== 'Approved') {
        motivos.push(`${g.replace(/_/g, ' ')}: ${item.status}`);
      }
      for (const w of item?.warnings ?? []) {
        if (typeof w === 'string') motivos.push(w);
        else motivos.push(String(w?.short_description ?? w?.risk ?? JSON.stringify(w)).slice(0, 160));
      }
    }
  }
  return Array.from(new Set(motivos)).slice(0, 12);
}

function edadDesde(fechaIso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaIso);
  if (!m) return null;
  const [y, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const hoy = new Date();
  let edad = hoy.getFullYear() - y;
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < d)) edad--;
  return edad;
}

export async function POST(req: Request) {
  const cuerpoCrudo = await req.text();
  const firmaOk = validarFirmaDidit(
    cuerpoCrudo,
    req.headers.get('x-signature-v2'),
    req.headers.get('x-timestamp'),
  );
  if (!firmaOk) return NextResponse.json({ ok: false }, { status: 401 });

  let evento: any;
  try {
    evento = JSON.parse(cuerpoCrudo);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Solo nos interesan los cambios de estado; el resto se confirma sin hacer nada.
  if (evento.webhook_type !== 'status.updated') return NextResponse.json({ ok: true });

  const servicio = crearClienteServicio();
  const sessionId: string = evento.session_id;
  const estado: string = evento.status;
  const decision = evento.decision ?? null;
  const motivos = decision ? reunirMotivos(decision) : [];

  // 1) Localiza la solicitud por session_id (o por vendor_data = id del perfil).
  let { data: verif } = await servicio
    .from('verificaciones_identidad')
    .select('id, perfil_id')
    .eq('didit_session_id', sessionId)
    .maybeSingle();

  if (!verif && typeof evento.vendor_data === 'string') {
    const { data: creada } = await servicio
      .from('verificaciones_identidad')
      .insert({ perfil_id: evento.vendor_data, proveedor: 'didit', didit_session_id: sessionId })
      .select('id, perfil_id')
      .single();
    verif = creada ?? null;
  }
  if (!verif) return NextResponse.json({ ok: true });

  const { error: errVerif } = await servicio
    .from('verificaciones_identidad')
    .update({ didit_estado: estado, didit_decision: decision, didit_motivos: motivos })
    .eq('id', verif.id);
  if (errVerif) return NextResponse.json({ ok: false }, { status: 500 });

  // 2) Aprobación automática, solo si Didit aprobó y pasan las reglas propias de Vela.
  if (estado === 'Approved') {
    const { data: perfil } = await servicio
      .from('perfiles')
      .select('id, estado_verificacion, fecha_nacimiento')
      .eq('id', verif.perfil_id)
      .single();

    if (perfil && perfil.estado_verificacion === 'pendiente') {
      const idv = decision?.id_verifications?.[0] ?? {};
      const fechaDoc: string | undefined = idv.date_of_birth ?? idv.birth_date;
      const bloqueos: string[] = [];

      if (typeof fechaDoc === 'string') {
        const edad = edadDesde(fechaDoc);
        if (edad !== null && edad < 18) bloqueos.push('Según el documento, la persona es menor de 18 años.');
        if (perfil.fecha_nacimiento && fechaDoc.slice(0, 10) !== String(perfil.fecha_nacimiento).slice(0, 10)) {
          bloqueos.push('La fecha de nacimiento del documento no coincide con la registrada.');
        }
      }

      if (bloqueos.length > 0) {
        await servicio
          .from('verificaciones_identidad')
          .update({ didit_motivos: [...motivos, ...bloqueos] })
          .eq('id', verif.id);
      } else {
        const { data: aprobado, error: errAprob } = await servicio
          .from('perfiles')
          .update({ estado_verificacion: 'aprobado', verificacion_notificada: false })
          .eq('id', perfil.id)
          .eq('estado_verificacion', 'pendiente')
          .select('id');

        if (errAprob) {
          console.error('Didit: no se pudo aprobar el perfil', errAprob.message);
          return NextResponse.json({ ok: false }, { status: 500 });
        }
        if (aprobado && aprobado.length > 0) {
          await servicio
            .from('verificaciones_identidad')
            .update({ revisado_en: new Date().toISOString() })
            .eq('id', verif.id);
        }
      }
    }
  }

  // 3) Registro del evento (idempotente: Didit reutiliza event_id en los reintentos).
  if (evento.event_id) {
    await servicio
      .from('didit_eventos')
      .upsert({ event_id: evento.event_id, session_id: sessionId, estado, cuerpo: evento }, { onConflict: 'event_id' });
  }

  return NextResponse.json({ ok: true });
}