/**
 * lib/wompi/confirmarPago.ts
 * Confirma un pago consultando a Wompi y activa el plan. Lo usan el webhook y la página
 * de "gracias". Es seguro llamarlo varias veces: el pago se activa una sola vez.
 */
import { crearClienteServicio } from '@/lib/supabase/servicio';
import { consultarTransaccion } from '@/lib/wompi/cliente';

export type EstadoConfirmacion =
  | 'pagado'
  | 'no_aprobada'
  | 'monto_no_coincide'
  | 'no_existe'
  | 'no_autorizado'
  | 'error_consulta'
  | 'error_interno';

type Entrada = {
  referencia: string;
  idTransaccion: string;
  origen: 'webhook' | 'redirect';
  firmaOk?: boolean | null;
  cuerpo?: unknown;
  /** Si viene (llamada desde la página), el pago debe pertenecer a este usuario. */
  usuarioIdEsperado?: string;
};

export async function confirmarPagoPorTransaccion(
  e: Entrada,
): Promise<{ estado: EstadoConfirmacion; plan?: string }> {
  const servicio = crearClienteServicio();

  const registrar = async (resultado: string, detalle?: string) => {
    try {
      await servicio.from('wompi_eventos').insert({
        origen: e.origen,
        firma_ok: e.firmaOk ?? null,
        referencia: e.referencia,
        id_transaccion: e.idTransaccion,
        resultado,
        detalle: detalle ? detalle.slice(0, 500) : null,
        cuerpo: e.cuerpo ?? null,
      });
    } catch {
      // la bitácora nunca debe impedir confirmar un pago
    }
  };

  const { data: pago } = await servicio
    .from('pagos')
    .select('id, usuario_id, plan, monto, estado')
    .eq('referencia', e.referencia)
    .maybeSingle();

  if (!pago) {
    await registrar('no_existe');
    return { estado: 'no_existe' };
  }
  if (e.usuarioIdEsperado && pago.usuario_id !== e.usuarioIdEsperado) {
    await registrar('no_autorizado');
    return { estado: 'no_autorizado' };
  }
  if (pago.estado === 'pagado') {
    return { estado: 'pagado', plan: pago.plan };
  }

  let tx;
  try {
    tx = await consultarTransaccion(e.idTransaccion);
  } catch (err: any) {
    await registrar('error_consulta', err?.message ?? String(err));
    return { estado: 'error_consulta' };
  }

  if (!tx.esReal || !tx.esAprobada) {
    await registrar('no_aprobada', JSON.stringify(tx));
    return { estado: 'no_aprobada' };
  }

  const { data, error } = await servicio.rpc('activar_pago', {
    p_referencia: e.referencia,
    p_id_transaccion: e.idTransaccion,
    p_monto: tx.monto,
    p_resultado: 'ExitosaAprobada',
  });
  if (error) {
    await registrar('error_activar', error.message);
    return { estado: 'error_interno' };
  }

  await registrar('activar_pago:' + String(data));
  if (data === 'ok' || data === 'ya_procesado') return { estado: 'pagado', plan: pago.plan };
  if (data === 'monto_no_coincide') return { estado: 'monto_no_coincide' };
  return { estado: 'error_interno' };
}