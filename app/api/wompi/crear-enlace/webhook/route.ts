/**
 * app/api/wompi/webhook/route.ts
 * Wompi llama aquí cuando una transacción termina. Es lo ÚNICO que activa un plan.
 *  1) valida la firma (header wompi_hash) sobre el cuerpo exacto
 *  2) solo procesa transacciones aprobadas
 *  3) activar_pago() compara el monto y activa el plan una sola vez
 */
import { NextResponse } from 'next/server';
import { validarFirmaWebhook } from '@/lib/wompi/cliente';
import { crearClienteServicio } from '@/lib/supabase/servicio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const cuerpo = await req.text();
  const firma = req.headers.get('wompi_hash');

  if (!validarFirmaWebhook(cuerpo, firma)) {
    console.warn('[wompi] webhook rechazado: firma inválida o ausente');
    return NextResponse.json({ error: 'firma inválida' }, { status: 401 });
  }

  let datos: any;
  try {
    datos = JSON.parse(cuerpo);
  } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 });
  }

  const resultado: string = String(datos?.ResultadoTransaccion ?? '');
  const referencia: string = String(datos?.EnlacePago?.IdentificadorEnlaceComercio ?? '');
  const idTransaccion: string = String(datos?.IdTransaccion ?? '');
  const monto = Number(datos?.Monto);

  console.log('[wompi] webhook', { resultado, referencia, idTransaccion, monto, productiva: datos?.EsProductiva });

  // Solo transacciones aprobadas y de producción.
  if (resultado !== 'ExitosaAprobada' || datos?.EsProductiva === false) {
    return NextResponse.json({ ok: true, ignorado: true });
  }
  if (!referencia || !idTransaccion || !Number.isFinite(monto)) {
    return NextResponse.json({ error: 'datos incompletos' }, { status: 400 });
  }

  const servicio = crearClienteServicio();
  const { data, error } = await servicio.rpc('activar_pago', {
    p_referencia: referencia,
    p_id_transaccion: idTransaccion,
    p_monto: monto,
    p_resultado: resultado,
  });

  if (error) {
    console.error('[wompi] error activando el pago:', error.message);
    return NextResponse.json({ error: 'error interno' }, { status: 500 });
  }

  console.log('[wompi] activar_pago ->', data);
  return NextResponse.json({ ok: true, estado: data });
}