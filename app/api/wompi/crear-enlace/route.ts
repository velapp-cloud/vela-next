/**
 * app/api/wompi/crear-enlace/route.ts
 * POST { plan } con "Authorization: Bearer <token de sesión>".
 * Crea un pago pendiente y un enlace de Wompi; responde { url } para redirigir al cliente.
 * El monto sale SIEMPRE de CAPACIDADES en el servidor (cuentas de prueba pagan $1.00).
 */
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { crearClienteServicio } from '@/lib/supabase/servicio';
import { crearEnlacePago } from '@/lib/wompi/cliente';
import { CAPACIDADES, type Plan } from '@/lib/planes/capacidades';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLANES_VALIDOS: Plan[] = ['basico', 'premium', 'gold', 'vip'];
const SITIO = process.env.SITE_URL ?? 'https://www.myvelapp.com';

// Monto que pagan las cuentas marcadas como es_cuenta_prueba (Wompi no acepta $0.01 en su pantalla de pago).
const MONTO_CUENTA_PRUEBA = 1.0;

export async function POST(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
  }

  const servicio = crearClienteServicio();
  const { data: auth, error: errorAuth } = await servicio.auth.getUser(token);
  if (errorAuth || !auth.user) {
    return NextResponse.json({ error: 'Tu sesión expiró. Entra de nuevo.' }, { status: 401 });
  }

  let plan: unknown;
  try {
    ({ plan } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }
  if (typeof plan !== 'string' || !PLANES_VALIDOS.includes(plan as Plan)) {
    return NextResponse.json({ error: 'Plan inválido.' }, { status: 400 });
  }
  const planElegido = plan as Plan;

  const { data: perfil } = await servicio
    .from('perfiles')
    .select('id, es_cuenta_prueba, cuenta_eliminada')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (!perfil || perfil.cuenta_eliminada) {
    return NextResponse.json({ error: 'Cuenta no disponible.' }, { status: 403 });
  }

  // Freno simple: máximo 5 pagos pendientes en la última hora.
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await servicio
    .from('pagos')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', perfil.id)
    .eq('estado', 'pendiente')
    .gte('creado_en', haceUnaHora);
  if ((count ?? 0) >= 5) {
    return NextResponse.json({ error: 'Demasiados intentos. Espera un momento e intenta de nuevo.' }, { status: 429 });
  }

  const cap = CAPACIDADES[planElegido];
  const monto = perfil.es_cuenta_prueba ? MONTO_CUENTA_PRUEBA : cap.precioMes;
  const referencia = 'VELA-' + randomBytes(8).toString('hex');

  const { error: errorInsert } = await servicio.from('pagos').insert({
    referencia,
    usuario_id: perfil.id,
    plan: planElegido,
    monto,
    estado: 'pendiente',
  });
  if (errorInsert) {
    console.error('[wompi] no se pudo registrar el pago:', errorInsert.message);
    return NextResponse.json({ error: 'No se pudo iniciar el pago. Intenta de nuevo.' }, { status: 500 });
  }

  try {
    const enlace = await crearEnlacePago({
      referencia,
      monto,
      nombreProducto: `Vela ${cap.label} - 30 dias`,
      urlRedirect: `${SITIO}/planes/gracias`,
      urlWebhook: `${SITIO}/api/wompi/webhook`,
    });
    await servicio
      .from('pagos')
      .update({ wompi_id_enlace: enlace.idEnlace, url_enlace: enlace.urlEnlace })
      .eq('referencia', referencia);
    return NextResponse.json({ url: enlace.urlEnlace });
  } catch (err: any) {
    console.error('[wompi] error creando enlace:', err?.message ?? err);
    await servicio.from('pagos').update({ estado: 'fallido', resultado_wompi: 'ERROR_AL_CREAR_ENLACE' }).eq('referencia', referencia);
    return NextResponse.json({ error: 'No se pudo conectar con Wompi. Intenta de nuevo.' }, { status: 502 });
  }
}