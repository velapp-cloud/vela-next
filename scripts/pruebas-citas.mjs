// scripts/pruebas-citas.mjs
// Pruebas del ciclo de citas de Vela con cuentas de prueba (@test.com, clave 0000).
// Usa solo 6 cuentas: flores16, flores17, flores18, flores19, rous20 y rosita6.
//
// Uso (desde C:\dev\vela-next):   node scripts\pruebas-citas.mjs
//
// Tarda unos 2 minutos: espera al aviso automático de "tu cita empieza en X min".
// Al final cancela las citas que creó y oculta sus chats.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

const CLAVE_PRUEBA = '0000';
const ESPERA_LIMITE_MS = 65_000;
const MAX_REINTENTOS = 8;
const ESPERA_RECORDATORIO_MS = 110_000; // el aviso lo manda un proceso que corre cada minuto

// ---------- utilidades ----------
function leerEnv() {
  if (!existsSync('.env.local')) {
    console.error('No encuentro .env.local. Corre este comando desde C:\\dev\\vela-next.');
    process.exit(1);
  }
  const mapa = {};
  for (const linea of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(linea);
    if (!m) continue;
    mapa[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const kUrl = Object.keys(mapa).find((k) => /SUPABASE_URL/.test(k));
  const kClave = Object.keys(mapa).find((k) => /(ANON_KEY|PUBLISHABLE)/.test(k));
  if (!kUrl || !kClave) {
    console.error('En .env.local no encontré la URL de Supabase o la clave pública (anon/publishable).');
    process.exit(1);
  }
  return { url: mapa[kUrl], clave: mapa[kClave] };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let fallos = 0;
let aciertos = 0;

function chequeo(ok, texto, detalle = '') {
  if (ok) { aciertos++; console.log(`  ✓ ${texto}`); }
  else { fallos++; console.log(`  ✗ ${texto}${detalle ? ` — ${detalle}` : ''}`); }
}

async function entrar(env, correo) {
  const cli = createClient(env.url, env.clave, { auth: { persistSession: false, autoRefreshToken: false } });
  for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
    const { data, error } = await cli.auth.signInWithPassword({ email: correo, password: CLAVE_PRUEBA });
    if (!error && data.user) return { email: correo, id: data.user.id, cli };
    if (/rate limit/i.test(error?.message ?? '') && intento < MAX_REINTENTOS) {
      console.log(`  … límite de inicios de sesión; espero ${ESPERA_LIMITE_MS / 1000} s`);
      await dormir(ESPERA_LIMITE_MS);
      continue;
    }
    return { email: correo, error: error?.message ?? 'sin usuario' };
  }
  return { email: correo, error: 'sin usuario' };
}

// Mismas reglas que lib/citas/confirmar.ts
function combinarFechaHora(fecha, hora) {
  return new Date(`${fecha}T${hora}:00`).toISOString();
}
function duracionAHoras(duracion) {
  const texto = duracion.toLowerCase().replace(',', '.');
  const h = texto.match(/(\d+(?:\.\d+)?)\s*h/);
  const m = texto.match(/(\d+(?:\.\d+)?)\s*m/);
  let horas = 0;
  if (h) horas += parseFloat(h[1]);
  if (m) horas += parseFloat(m[1]) / 60;
  if (horas > 0) return horas;
  const suelto = parseFloat(texto.replace(/[^\d.]/g, ''));
  return Number.isFinite(suelto) && suelto > 0 ? suelto : 1;
}

const dosDigitos = (n) => String(n).padStart(2, '0');
const fechaLocal = (d) => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
const horaLocal = (d) => `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;

async function contarNotis(u, patron) {
  const { count } = await u.cli
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .eq('para_usuario_id', u.id)
    .ilike('mensaje', patron);
  return count ?? 0;
}

const creados = { citas: [], chats: new Set(), solicitudes: [] };

/** Crea (o reabre) el chat del par y deja una cita pendiente, igual que la app. */
async function chatYCita(prov, cliente, ficha) {
  const { data: existente } = await prov.cli
    .from('chats').select('id').eq('cliente_id', cliente.id).eq('proveedora_id', prov.id).maybeSingle();
  const camposFicha = {
    requiere_nueva_solicitud: false, oculto_cliente: false, oculto_proveedora: false,
    ficha_fecha: ficha.fecha, ficha_hora: ficha.hora, ficha_duracion: ficha.duracion,
    ficha_lugar: ficha.lugar, ficha_tipo: ficha.tipo, ficha_mensaje: ficha.mensaje ?? '',
  };
  let chatId = existente?.id ?? null;
  if (chatId) {
    const { error } = await prov.cli.from('chats').update(camposFicha).eq('id', chatId);
    if (error) return { error: `chat: ${error.message}` };
  } else {
    const { data, error } = await prov.cli
      .from('chats')
      .insert({ cliente_id: cliente.id, proveedora_id: prov.id, ...camposFicha })
      .select('id').single();
    if (error) return { error: `chat: ${error.message}` };
    chatId = data.id;
  }
  creados.chats.add(chatId);

  const { data: cita, error: errCita } = await prov.cli
    .from('citas')
    .insert({
      chat_id: chatId, cliente_id: cliente.id, proveedora_id: prov.id,
      lugar: ficha.lugar, direccion: ficha.lugar,
      hora_acordada: combinarFechaHora(ficha.fecha, ficha.hora),
      duracion_horas: duracionAHoras(ficha.duracion),
      tipo_encuentro: ficha.tipo, mensaje: ficha.mensaje ?? '',
      cliente_inicio: false, proveedora_inicio: false,
      cliente_confirmo: false, proveedora_confirmo: false,
      cliente_califico: false, proveedora_califico: false,
      en_emergencia: false,
    })
    .select('id').single();
  if (errCita) return { error: `cita: ${errCita.message}` };
  creados.citas.push({ id: cita.id, proveedoraId: prov.id, prov });
  return { chatId, citaId: cita.id };
}

/** Misma secuencia que "Aceptar" en la app: solicitud -> revisar choque -> chat y cita -> borrar solicitud. */
async function aceptarComoApp(prov, cliente, ficha) {
  const { data: sol, error: errSol } = await cliente.cli
    .from('solicitudes')
    .insert({
      cliente_id: cliente.id, proveedora_id: prov.id,
      fecha: ficha.fecha, hora: ficha.hora, duracion: ficha.duracion,
      lugar: ficha.lugar, tipo: ficha.tipo, mensaje: ficha.mensaje ?? '',
    })
    .select('id').single();
  if (errSol) return { error: `solicitud: ${errSol.message}` };
  creados.solicitudes.push({ id: sol.id, cli: cliente.cli });

  const { data: rev, error: errRev } = await prov.cli.rpc('revisar_choque_solicitud', {
    p_cliente: cliente.id,
    p_inicio: combinarFechaHora(ficha.fecha, ficha.hora),
    p_horas: duracionAHoras(ficha.duracion),
  });
  if (errRev) return { error: `revisar_choque: ${errRev.message}` };
  if (rev?.choque) {
    await cliente.cli.from('solicitudes').delete().eq('id', sol.id);
    return { choque: true, quien: rev.quien };
  }

  const r = await chatYCita(prov, cliente, ficha);
  if (r.error) return r;
  await prov.cli.from('solicitudes').delete().eq('id', sol.id);
  return { ok: true, ...r };
}

/** Solo pregunta si hay choque (sin crear nada) para un horario dado. */
async function hayChoque(prov, cliente, fecha, hora, duracion = '1 hora') {
  const { data, error } = await prov.cli.rpc('revisar_choque_solicitud', {
    p_cliente: cliente.id,
    p_inicio: combinarFechaHora(fecha, hora),
    p_horas: duracionAHoras(duracion),
  });
  if (error) return { error: error.message };
  return { choque: !!data?.choque };
}

// ---------- limpieza ----------
async function limpiar() {
  console.log('\n== Limpieza ==');
  let canceladas = 0;
  for (const c of creados.citas) {
    const { error } = await c.prov.cli
      .from('citas')
      .update({ estado_manual: 'cancelada', motivo_cancelacion: 'Prueba automática', cancelado_por: c.proveedoraId })
      .eq('id', c.id);
    if (!error) canceladas++;
  }
  for (const s of creados.solicitudes) {
    await s.cli.from('solicitudes').delete().eq('id', s.id);
  }
  console.log(`  Citas de prueba canceladas: ${canceladas}/${creados.citas.length}`);
}

// ---------- escenarios ----------
async function main() {
  const env = leerEnv();

  console.log('\n== 0. Inicio de sesión (6 cuentas) ==');
  const cuentas = {};
  for (const [clave, correo] of Object.entries({
    c1: 'flores16@test.com', c2: 'flores17@test.com', c3: 'flores18@test.com', c4: 'flores19@test.com',
    p1: 'rous20@test.com', p2: 'rosita6@test.com',
  })) {
    const u = await entrar(env, correo);
    if (u.error) { chequeo(false, `Entrar como ${correo}`, u.error); process.exit(1); }
    cuentas[clave] = u;
    await dormir(250);
  }
  chequeo(true, 'Las 6 cuentas entraron');
  const { c1, c2, c3, c4, p1, p2 } = cuentas;

  const dia = new Date(Date.now() + 10 * 24 * 3600 * 1000);
  const D = fechaLocal(dia);
  const base = { duracion: '1 hora', lugar: 'Restaurante · Prueba automática', tipo: 'Cena', mensaje: 'Prueba automática' };

  try {
    console.log(`\n== 1. Aceptar una solicitud y crear la cita (${D} 19:00, 1 hora) ==`);
    const a1 = await aceptarComoApp(p1, c1, { ...base, fecha: D, hora: '19:00' });
    chequeo(!!a1.ok, 'La proveedora acepta y se crean el chat y la cita', a1.error ?? (a1.choque ? 'dio choque' : ''));
    if (!a1.ok) throw new Error('Sin la primera cita no se puede seguir.');

    const { data: cita1 } = await c1.cli.from('citas')
      .select('id, cliente_confirmo, proveedora_confirmo, iniciada_en, estado_manual').eq('id', a1.citaId).single();
    chequeo(cita1 && !cita1.cliente_confirmo && !cita1.proveedora_confirmo, 'La cita nace sin confirmar por nadie');

    console.log('\n== 2. Confirmar las dos partes ==');
    const { data: conf1, error: e1 } = await c1.cli.rpc('confirmar_mi_parte', { p_cita_id: a1.citaId });
    chequeo(!e1 && conf1?.ok === true && conf1?.ambos === false, 'El cliente confirma (todavía falta la proveedora)', e1?.message ?? JSON.stringify(conf1));
    const { data: conf2, error: e2 } = await p1.cli.rpc('confirmar_mi_parte', { p_cita_id: a1.citaId });
    chequeo(!e2 && conf2?.ok === true && conf2?.ambos === true, 'La proveedora confirma y la cita queda confirmada por las dos', e2?.message ?? JSON.stringify(conf2));

    console.log('\n== 3. Margen de 20 minutos entre citas (cita existente 19:00 a 20:00) ==');
    const antes20 = await contarNotis(p1, '%20 minutos%');
    const casos = [
      ['20:10', true, 'empieza 10 min después de terminar'],
      ['20:19', true, 'empieza 19 min después de terminar'],
      ['20:20', false, 'empieza justo 20 min después de terminar'],
      ['21:00', false, 'empieza 1 hora después de terminar'],
      ['19:30', true, 'se traslapa con la cita'],
      ['17:41', true, 'termina 19 min antes de la cita'],
      ['17:40', false, 'termina justo 20 min antes de la cita'],
    ];
    for (const [hora, esperado, desc] of casos) {
      const r = await hayChoque(p1, c2, D, hora);
      chequeo(!r.error && r.choque === esperado, `${hora} ${esperado ? 'debe chocar' : 'debe poder agendarse'}: ${desc}`, r.error ?? `dio choque=${r.choque}`);
    }
    const despues20 = await contarNotis(p1, '%20 minutos%');
    chequeo(despues20 > antes20, 'El aviso de choque le recuerda a la proveedora los 20 minutos', `antes ${antes20}, después ${despues20}`);

    console.log('\n== 4. Aceptar una solicitud que choca debe bloquearse ==');
    const a2 = await aceptarComoApp(p1, c2, { ...base, fecha: D, hora: '20:10' });
    chequeo(a2.choque === true && a2.quien === 'proveedora', 'La solicitud de las 20:10 se rechaza por choque (de la proveedora)', a2.error ?? JSON.stringify(a2));

    console.log('\n== 5. Confirmar una cita que choca también se bloquea ==');
    // Se crea la cita saltándose la revisión, para probar la segunda barrera (confirmar).
    const forz = await chatYCita(p1, c2, { ...base, fecha: D, hora: '20:10' });
    chequeo(!!forz.citaId, 'Se prepara una segunda cita a las 20:10 (sin confirmar)', forz.error);
    if (forz.citaId) {
      const antesMsg = await contarNotis(c2, '%20 minutos%');
      const { data: conf, error } = await c2.cli.rpc('confirmar_mi_parte', { p_cita_id: forz.citaId });
      chequeo(!error && conf?.ok === false && conf?.error === 'choque', 'Confirmar la cita de las 20:10 da "choque"', error?.message ?? JSON.stringify(conf));
      const despuesMsg = await contarNotis(c2, '%20 minutos%');
      chequeo(despuesMsg > antesMsg, 'El mensaje de choque menciona los 20 minutos', `antes ${antesMsg}, después ${despuesMsg}`);
    }

    console.log('\n== 6. Avisos rápidos ("voy tarde", "ya casi llego", "cambio de planes") ==');
    const antesTarde = await contarNotis(p1, '%Voy tarde%');
    const { data: av1, error: ea1 } = await c1.cli.rpc('avisar_cita', { p_cita_id: a1.citaId, p_tipo: 'tarde' });
    chequeo(!ea1 && av1?.ok === true, 'El cliente avisa "Voy tarde, espérame"', ea1?.message ?? JSON.stringify(av1));
    const despuesTarde = await contarNotis(p1, '%Voy tarde%');
    chequeo(despuesTarde > antesTarde, 'A la proveedora le llega la notificación', `antes ${antesTarde}, después ${despuesTarde}`);

    const { data: av2 } = await p1.cli.rpc('avisar_cita', { p_cita_id: a1.citaId, p_tipo: 'casi' });
    chequeo(av2?.ok === true, 'La proveedora avisa "Ya casi llego"');
    const { data: av3 } = await c1.cli.rpc('avisar_cita', { p_cita_id: a1.citaId, p_tipo: 'cancelar' });
    chequeo(av3?.ok === true, 'El cliente avisa "Cambio de planes, cancela la cita"');
    const { data: av4 } = await c1.cli.rpc('avisar_cita', { p_cita_id: a1.citaId, p_tipo: 'inventado' });
    chequeo(av4?.ok === false, 'Un tipo de aviso inventado se rechaza');
    const { data: av5 } = await c3.cli.rpc('avisar_cita', { p_cita_id: a1.citaId, p_tipo: 'tarde' });
    chequeo(av5?.ok === false, 'Una persona ajena a la cita NO puede mandar avisos', JSON.stringify(av5));

    console.log('\n== 7. Aviso automático 15 minutos antes de la cita ==');
    const en10 = new Date(Date.now() + 10 * 60 * 1000);
    const r7 = await chatYCita(p2, c4, { ...base, fecha: fechaLocal(en10), hora: horaLocal(en10) });
    chequeo(!!r7.citaId, `Se crea una cita para dentro de unos 10 min (${horaLocal(en10)})`, r7.error);
    if (r7.citaId) {
      const { data: k1 } = await c4.cli.rpc('confirmar_mi_parte', { p_cita_id: r7.citaId });
      const { data: k2 } = await p2.cli.rpc('confirmar_mi_parte', { p_cita_id: r7.citaId });
      chequeo(k1?.ok === true && k2?.ok === true && k2?.ambos === true, 'Las dos personas confirman la cita',
        `cliente: ${JSON.stringify(k1)} · proveedora: ${JSON.stringify(k2)}`);
      const antesC = await contarNotis(c4, '%empieza en%');
      const antesP = await contarNotis(p2, '%empieza en%');
      console.log('  … espero hasta ~2 minutos a que el servidor mande el aviso');
      const limite = Date.now() + ESPERA_RECORDATORIO_MS;
      let llegoC = false;
      let llegoP = false;
      while (Date.now() < limite && !(llegoC && llegoP)) {
        await dormir(10_000);
        llegoC = (await contarNotis(c4, '%empieza en%')) > antesC;
        llegoP = (await contarNotis(p2, '%empieza en%')) > antesP;
      }
      chequeo(llegoC, 'Al cliente le llega "tu cita empieza en X min"');
      chequeo(llegoP, 'A la proveedora le llega "tu cita empieza en X min"');
    }
  } catch (e) {
    chequeo(false, 'La prueba se interrumpió', e?.message ?? String(e));
  } finally {
    await limpiar();
  }

  console.log(`\nResumen: ${aciertos} ✓ · ${fallos} ✗`);
  if (fallos > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('Error inesperado:', e?.message ?? e);
  process.exit(1);
});