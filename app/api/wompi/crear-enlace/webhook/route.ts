/**
 * app/api/wompi/webhook/route.ts
 * Wompi llama aquí cuando una transacción termina. No confiamos en el contenido del aviso:
 * se toma la referencia y el idTransaccion y se CONSULTA a Wompi el resultado real
 * (esReal + esAprobada + monto). Cada aviso queda en la tabla wompi_eventos.
 */
import { NextResponse } from 'next/server';
import { validarFirmaWebhook } from '@/lib/wompi/cliente';
import { confirmarPagoPorTransaccion } from '@/lib/wompi/confirmarPago';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const cuerpo = await req.text();
  const firma = req.headers.get('wompi_hash');
  const firmaOk = validarFirmaWebhook(cuerpo, firma);

  let datos: any;
  try {
    datos = JSON.parse(cuerpo);
  } catch {
    console.warn('[wompi] webhook con cuerpo no JSON');
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 });
  }

  const referencia = String(datos?.EnlacePago?.IdentificadorEnlaceComercio ?? '');
  const idTransaccion = String(datos?.IdTransaccion ?? '');

  console.log('[wompi] webhook recibido', {
    firmaOk,
    traeHeaderFirma: firma !== null,
    referencia,
    idTransaccion,
    resultado: datos?.ResultadoTransaccion,
  });

  if (!referencia || !idTransaccion) {
    return NextResponse.json({ error: 'datos incompletos' }, { status: 400 });
  }

  const r = await confirmarPagoPorTransaccion({
    referencia,
    idTransaccion,
    origen: 'webhook',
    firmaOk,
    cuerpo: datos,
  });

  console.log('[wompi] webhook ->', r.estado);

  // Si no pudimos consultar a Wompi o falló algo interno, se responde error para que reintente.
  if (r.estado === 'error_consulta' || r.estado === 'error_interno') {
    return NextResponse.json({ error: r.estado }, { status: 502 });
  }
  return NextResponse.json({ ok: true, estado: r.estado });
}