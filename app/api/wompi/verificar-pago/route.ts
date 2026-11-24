/**
 * app/api/wompi/verificar-pago/route.ts
 * POST { referencia, idTransaccion } con "Authorization: Bearer <token de sesión>".
 * La página de "gracias" lo usa con los datos que Wompi agrega a la URL de regreso.
 * El servidor consulta a Wompi: el cliente no puede falsear el resultado.
 */
import { NextResponse } from 'next/server';
import { crearClienteServicio } from '@/lib/supabase/servicio';
import { confirmarPagoPorTransaccion } from '@/lib/wompi/confirmarPago';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  let referencia = '';
  let idTransaccion = '';
  try {
    const cuerpo = await req.json();
    referencia = String(cuerpo?.referencia ?? '').trim();
    idTransaccion = String(cuerpo?.idTransaccion ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }
  if (!referencia || !idTransaccion || referencia.length > 64 || idTransaccion.length > 64) {
    return NextResponse.json({ error: 'Datos incompletos.' }, { status: 400 });
  }

  const r = await confirmarPagoPorTransaccion({
    referencia,
    idTransaccion,
    origen: 'redirect',
    usuarioIdEsperado: auth.user.id,
  });

  return NextResponse.json({ estado: r.estado, plan: r.plan ?? null });
}