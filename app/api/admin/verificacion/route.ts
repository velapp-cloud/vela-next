import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Valor que se guarda en perfiles.estado_verificacion.
// Si tu base usa otro texto, cámbialo aquí.
const ESTADO_APROBADO = 'aprobado';
const ESTADO_RECHAZADO = 'rechazado';

function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type ResultadoCorreo = { enviado: boolean; error: string | null };

/** Envío genérico por Resend. */
async function enviarCorreo(para: string, asunto: string, html: string): Promise<ResultadoCorreo> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { enviado: false, error: 'Falta RESEND_API_KEY o EMAIL_FROM en .env.local' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
        to: [para],
        subject: asunto,
        html,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { enviado: false, error: `Resend respondió ${res.status}: ${txt.slice(0, 200)}` };
    }
    return { enviado: true, error: null };
  } catch (e: any) {
    return { enviado: false, error: e?.message ?? 'No se pudo conectar con Resend' };
  }
}

function saludo(nombre: string): string {
  return nombre ? `Hola ${escaparHtml(nombre)},` : 'Hola,';
}

function htmlRechazo(nombre: string, comentario: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h2 style="color:#D91F3A;font-style:italic">Vela</h2>
      <p>${saludo(nombre)}</p>
      <p>Revisamos los documentos que enviaste para verificar tu identidad y por ahora
      <strong>no pudimos aprobarlos</strong>.</p>
      <div style="background:#f6f6f6;border-left:4px solid #D91F3A;padding:12px 14px;border-radius:6px;margin:16px 0">
        <p style="margin:0 0 4px;font-size:12px;color:#666">Comentario del equipo de Vela</p>
        <p style="margin:0;white-space:pre-wrap">${escaparHtml(comentario)}</p>
      </div>
      <p>Inicia sesión en Vela para volver a intentarlo con las correcciones indicadas.</p>
      <p style="font-size:12px;color:#888;margin-top:24px">
        Si no creaste una cuenta en Vela, ignora este mensaje.
      </p>
    </div>`;
}

function htmlAprobado(nombre: string, alias: string, urlLogin: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h2 style="color:#D91F3A;font-style:italic">Vela</h2>
      <p>${saludo(nombre)}</p>
      <p>¡Buenas noticias! Verificamos tu identidad y tu cuenta ya está <strong>aprobada</strong>.
      Ya puedes usar Vela.</p>
      <div style="background:#f6f6f6;border-left:4px solid #16A34A;padding:12px 14px;border-radius:6px;margin:16px 0">
        <p style="margin:0 0 4px;font-size:12px;color:#666">Tu alias en Vela</p>
        <p style="margin:0;font-size:20px;font-weight:bold;letter-spacing:1px">${escaparHtml(alias)}</p>
      </div>
      <p style="margin:24px 0">
        <a href="${escaparHtml(urlLogin)}"
           style="background:#D91F3A;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px;display:inline-block">
          Entrar a Vela
        </a>
      </p>
      <p style="font-size:12px;color:#888;margin-top:24px">
        Si no creaste una cuenta en Vela, ignora este mensaje.
      </p>
    </div>`;
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 });
  }
  const adminId = userData.user.id;

  const { data: yo } = await supabase.from('perfiles').select('es_admin').eq('id', adminId).single();
  if (!yo?.es_admin) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 403 });
  }

  let body: { perfilId?: string; decision?: string; comentario?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Solicitud inválida' }, { status: 400 });
  }

  const perfilId = body.perfilId;
  const decision = body.decision;
  const comentario = (body.comentario ?? '').trim();

  if (!perfilId || (decision !== 'aprobar' && decision !== 'rechazar')) {
    return NextResponse.json({ ok: false, error: 'Datos incompletos' }, { status: 400 });
  }
  if (decision === 'rechazar' && comentario.length < 10) {
    return NextResponse.json(
      { ok: false, error: 'El comentario para la persona es obligatorio (mínimo 10 caracteres).' },
      { status: 400 },
    );
  }

  const { data: objetivo } = await supabase
    .from('perfiles')
    .select('id, alias, primer_nombre, nombre_completo, correo, estado_verificacion')
    .eq('id', perfilId)
    .single();

  if (!objetivo) {
    return NextResponse.json({ ok: false, error: 'No se encontró el perfil' }, { status: 404 });
  }
  if (objetivo.estado_verificacion !== 'pendiente') {
    return NextResponse.json(
      { ok: false, error: 'Esta solicitud ya fue revisada.' },
      { status: 409 },
    );
  }

  const nuevoEstado = decision === 'aprobar' ? ESTADO_APROBADO : ESTADO_RECHAZADO;

  const { data: actualizado, error: errPerfil } = await supabase
    .from('perfiles')
    .update({ estado_verificacion: nuevoEstado, verificacion_notificada: false })
    .eq('id', perfilId)
    .eq('estado_verificacion', 'pendiente')
    .select('id');

  if (errPerfil) {
    return NextResponse.json({ ok: false, error: `No se pudo actualizar el perfil: ${errPerfil.message}` }, { status: 500 });
  }
  if (!actualizado || actualizado.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No se actualizó ningún perfil (revisa los permisos de admin en Supabase).' },
      { status: 500 },
    );
  }

  // Guarda la decisión y el comentario en la solicitud más reciente sin revisar.
  const { data: pendientes } = await supabase
    .from('verificaciones_identidad')
    .select('id')
    .eq('perfil_id', perfilId)
    .is('revisado_en', null)
    .order('creado_en', { ascending: false })
    .limit(1);

  if (pendientes && pendientes.length > 0) {
    await supabase
      .from('verificaciones_identidad')
      .update({
        motivo_rechazo: decision === 'rechazar' ? comentario : null,
        revisado_por: adminId,
        revisado_en: new Date().toISOString(),
      })
      .eq('id', pendientes[0].id);
  }

  // Correo a la persona (aprobada o rechazada).
  let emailEnviado: boolean | null = null;
  let emailError: string | null = null;

  if (!objetivo.correo) {
    emailEnviado = false;
    emailError = 'La persona no tiene correo guardado';
  } else {
    const nombre = objetivo.primer_nombre || objetivo.nombre_completo || '';
    let r: ResultadoCorreo;

    if (decision === 'rechazar') {
      r = await enviarCorreo(
        objetivo.correo,
        'Vela: no pudimos verificar tu identidad',
        htmlRechazo(nombre, comentario),
      );
    } else {
      const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '');
      r = await enviarCorreo(
        objetivo.correo,
        'Vela: tu cuenta fue verificada',
        htmlAprobado(nombre, objetivo.alias, `${base}/login`),
      );
    }
    emailEnviado = r.enviado;
    emailError = r.error;
  }

  return NextResponse.json({ ok: true, decision, emailEnviado, emailError });
}