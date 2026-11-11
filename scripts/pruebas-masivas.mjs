// scripts/pruebas-masivas.mjs
// Pruebas masivas de Vela con las 40 cuentas de prueba (@test.com, clave 0000).
//
// Uso (desde C:\dev\vela-next):
//   node scripts/pruebas-masivas.mjs            -> corre los escenarios
//   node scripts/pruebas-masivas.mjs --limpiar  -> borra las solicitudes que creó la última corrida
//
// Lee la URL y la clave pública de Supabase de .env.local (nunca las imprime).
// Si Supabase limita los inicios de sesión, el script espera y reintenta solo.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CLAVE_PRUEBA = '0000';
const ARCHIVO_CORRIDA = 'scripts/.ultima-corrida.json';
const PAUSA_MS = 250; // pausa entre inicios de sesión
const ESPERA_LIMITE_MS = 65_000; // espera cuando Supabase dice "rate limit"
const MAX_REINTENTOS = 8;

const CLIENTES = [
  ['eduardo1', 'gold'], ['eduardo2', 'basico'], ['eduardo3', 'basico'], ['eduardo4', 'basico'], ['eduardo5', 'basico'],
  ['andres6', 'premium'], ['andres7', 'premium'], ['andres8', 'premium'], ['andres9', 'premium'], ['andres10', 'premium'],
  ['galeano11', 'gold'], ['galeano12', 'gold'], ['galeano13', 'gold'], ['galeano14', 'gold'], ['galeano15', 'gold'],
  ['flores16', 'vip'], ['flores17', 'vip'], ['flores18', 'vip'], ['flores19', 'vip'], ['flores20', 'vip'],
].map(([u, plan]) => ({ email: `${u}@test.com`, plan, rol: 'cliente' }));

const PROVEEDORAS = [
  ['flor1', 'basico'], ['flor2', 'basico'], ['flor3', 'basico'], ['flor4', 'basico'], ['flor5', 'basico'],
  ['rosita6', 'premium'], ['rosita7', 'premium'], ['rosita8', 'premium'], ['rosita9', 'premium'], ['rosita10', 'premium'],
  ['ross11', 'gold'], ['ross12', 'gold'], ['ross13', 'gold'], ['ross14', 'gold'], ['ross15', 'gold'],
  ['rous16', 'vip'], ['rous17', 'vip'], ['rous18', 'vip'], ['rous19', 'vip'], ['rous20', 'vip'],
].map(([u, plan]) => ({ email: `${u}@test.com`, plan, rol: 'proveedor' }));

const LIMITE_POR_PLAN = { basico: 10, premium: 25, gold: 45, vip: 99 };

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

function barajar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let fallos = 0;
let aciertos = 0;

function chequeo(ok, texto, detalle = '') {
  if (ok) { aciertos++; console.log(`  ✓ ${texto}`); }
  else { fallos++; console.log(`  ✗ ${texto}${detalle ? ` — ${detalle}` : ''}`); }
}

async function entrar(env, usuario) {
  const cli = createClient(env.url, env.clave, { auth: { persistSession: false, autoRefreshToken: false } });
  for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
    const { data, error } = await cli.auth.signInWithPassword({ email: usuario.email, password: CLAVE_PRUEBA });
    if (!error && data.user) return { ...usuario, id: data.user.id, cli };
    const limitado = /rate limit/i.test(error?.message ?? '');
    if (limitado && intento < MAX_REINTENTOS) {
      console.log(`  … Supabase limitó los inicios de sesión; espero ${ESPERA_LIMITE_MS / 1000} s (${usuario.email})`);
      await dormir(ESPERA_LIMITE_MS);
      continue;
    }
    return { ...usuario, error: error?.message ?? 'sin usuario' };
  }
  return { ...usuario, error: 'sin usuario' };
}

async function entrarTodos(env, lista) {
  const salida = [];
  for (const u of lista) {
    salida.push(await entrar(env, u));
    await dormir(PAUSA_MS);
  }
  return salida;
}

// ---------- limpieza ----------
async function limpiar(env) {
  if (!existsSync(ARCHIVO_CORRIDA)) {
    console.log('No hay una corrida anterior que limpiar.');
    return;
  }
  const corrida = JSON.parse(readFileSync(ARCHIVO_CORRIDA, 'utf8'));
  let borradas = 0;
  for (const [email, ids] of Object.entries(corrida.solicitudesPorCliente ?? {})) {
    if (!ids.length) continue;
    const u = await entrar(env, { email, plan: '', rol: 'cliente' });
    if (u.error) { console.log(`  ✗ No pude entrar como ${email}: ${u.error}`); continue; }
    const { error, count } = await u.cli.from('solicitudes').delete({ count: 'exact' }).in('id', ids);
    if (error) console.log(`  ✗ ${email}: ${error.message}`);
    else borradas += count ?? 0;
    await dormir(PAUSA_MS);
  }
  console.log(`Solicitudes borradas: ${borradas}`);
  writeFileSync(ARCHIVO_CORRIDA, JSON.stringify({ solicitudesPorCliente: {} }, null, 2));
}

// ---------- escenarios ----------
async function main() {
  const env = leerEnv();

  if (process.argv.includes('--limpiar')) {
    await limpiar(env);
    return;
  }

  console.log('\n== 1. Inicio de sesión de las 40 cuentas ==');
  console.log('  (si Supabase limita los inicios de sesión, el script espera y sigue; puede tardar unos minutos)');
  const clientes = await entrarTodos(env, CLIENTES);
  const proveedoras = await entrarTodos(env, PROVEEDORAS);
  for (const u of [...clientes, ...proveedoras]) {
    if (u.error) chequeo(false, `Entrar como ${u.email}`, u.error);
  }
  const okClientes = clientes.filter((c) => !c.error);
  const okProveedoras = proveedoras.filter((p) => !p.error);
  chequeo(okClientes.length === CLIENTES.length, `Clientes con sesión: ${okClientes.length}/${CLIENTES.length}`);
  chequeo(okProveedoras.length === PROVEEDORAS.length, `Proveedoras con sesión: ${okProveedoras.length}/${PROVEEDORAS.length}`);
  if (okClientes.length === 0 || okProveedoras.length === 0) {
    console.log('\nSin sesiones no se puede seguir.');
    process.exit(1);
  }

  console.log('\n== 2. Explorar: cuántos perfiles ve cada cliente ==');
  const loteDe = {};
  for (const c of okClientes) {
    const { data, error } = await c.cli.rpc('explorar_mis_perfiles');
    if (error) { chequeo(false, `${c.email} (${c.plan}) carga Explorar`, error.message); continue; }
    const ids = (data ?? []).map((f) => f.perfil_id);
    loteDe[c.email] = ids;
    const limite = LIMITE_POR_PLAN[c.plan];
    const sinRepetidos = new Set(ids).size === ids.length;
    chequeo(sinRepetidos, `${c.email} (${c.plan}) ve ${ids.length} perfiles, sin repetidos`);
    chequeo(ids.length <= limite, `${c.email} no pasa su límite de ${limite}`, `ve ${ids.length}`);
    if (c.plan === 'vip') {
      chequeo(ids.length >= PROVEEDORAS.length, `${c.email} (VIP) ve a todas las proveedoras de prueba`, `ve ${ids.length}`);
    }
  }

  console.log('\n== 3. El lote se mantiene igual al volver a entrar (24 h) ==');
  for (const c of okClientes.slice(0, 5)) {
    const { data } = await c.cli.rpc('explorar_mis_perfiles');
    const ahora = (data ?? []).map((f) => f.perfil_id).sort().join(',');
    const antes = (loteDe[c.email] ?? []).slice().sort().join(',');
    chequeo(ahora === antes, `${c.email} ve los mismos perfiles`);
  }

  console.log('\n== 4. Solicitudes: cada cliente escribe a 3 proveedoras al azar de su lote ==');
  const idsProveedoras = new Map(okProveedoras.map((p) => [p.id, p]));
  const esperadoPorProveedora = new Map(okProveedoras.map((p) => [p.id, 0]));
  const creadas = {};
  const manana = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

  let franja = 0;
  for (const c of okClientes) {
    const candidatas = barajar((loteDe[c.email] ?? []).filter((id) => idsProveedoras.has(id))).slice(0, 3);
    creadas[c.email] = [];
    for (const provId of candidatas) {
      franja++;
      const hora = `${String(8 + (franja % 12)).padStart(2, '0')}:00`;
      const { data, error } = await c.cli
        .from('solicitudes')
        .insert({
          cliente_id: c.id,
          proveedora_id: provId,
          fecha: manana,
          hora,
          duracion: '1 hora',
          lugar: 'Restaurante · Prueba masiva',
          tipo: 'Cena',
          mensaje: 'Solicitud de prueba masiva',
        })
        .select('id')
        .single();
      if (error) {
        chequeo(false, `${c.email} → ${idsProveedoras.get(provId).email}`, error.message);
      } else {
        creadas[c.email].push(data.id);
        esperadoPorProveedora.set(provId, esperadoPorProveedora.get(provId) + 1);
      }
    }
    await dormir(100);
  }
  writeFileSync(ARCHIVO_CORRIDA, JSON.stringify({ solicitudesPorCliente: creadas }, null, 2));
  const total = Object.values(creadas).reduce((a, l) => a + l.length, 0);
  chequeo(total > 0, `Solicitudes creadas: ${total}`);

  console.log('\n== 5. Cada proveedora cuenta sus solicitudes (el número del punto rojo) ==');
  for (const p of okProveedoras) {
    const { count, error } = await p.cli
      .from('solicitudes')
      .select('id', { count: 'exact', head: true })
      .eq('proveedora_id', p.id);
    if (error) { chequeo(false, `${p.email} cuenta solicitudes`, error.message); continue; }
    const esperado = esperadoPorProveedora.get(p.id) ?? 0;
    // Puede haber solicitudes de antes: el conteo nunca debe ser menor que las que acabamos de crear.
    chequeo((count ?? 0) >= esperado, `${p.email} (${p.plan}) tiene ${count} (nuevas: ${esperado})`);
  }

  console.log('\n== 6. Seguridad ==');
  const intruso = okClientes[0];
  const victima = okClientes[1] ?? okClientes[0];
  const provA = okProveedoras[0];
  const provB = okProveedoras[1] ?? okProveedoras[0];

  // 6.1 Un cliente no ve solicitudes de otros clientes.
  const { data: ajenas } = await intruso.cli.from('solicitudes').select('id').neq('cliente_id', intruso.id);
  chequeo((ajenas ?? []).length === 0, `${intruso.email} no ve solicitudes de otros clientes`, `ve ${(ajenas ?? []).length}`);

  // 6.2 Una proveedora solo ve las solicitudes dirigidas a ella.
  const { data: deOtras } = await provA.cli.from('solicitudes').select('id').neq('proveedora_id', provA.id);
  chequeo((deOtras ?? []).length === 0, `${provA.email} no ve solicitudes dirigidas a otras proveedoras`, `ve ${(deOtras ?? []).length}`);

  // 6.3 No se puede enviar una solicitud a nombre de otro cliente.
  const { data: falsa, error: errFalsa } = await intruso.cli
    .from('solicitudes')
    .insert({
      cliente_id: victima.id,
      proveedora_id: provB.id,
      fecha: manana,
      hora: '21:00',
      duracion: '1 hora',
      lugar: 'Prueba de suplantación',
      tipo: 'Cena',
      mensaje: 'No debería poder crearse',
    })
    .select('id');
  const seCreoFalsa = !errFalsa && (falsa ?? []).length > 0;
  chequeo(!seCreoFalsa, `${intruso.email} NO puede enviar una solicitud a nombre de ${victima.email}`);
  if (seCreoFalsa) {
    // Limpieza inmediata de lo que no debió crearse.
    await victima.cli.from('solicitudes').delete().in('id', falsa.map((f) => f.id));
  }

  // 6.4 No se pueden borrar las solicitudes de otro cliente.
  const idsDeLaVictima = creadas[victima.email] ?? [];
  if (idsDeLaVictima.length > 0) {
    await intruso.cli.from('solicitudes').delete().in('id', idsDeLaVictima);
    const { count: siguen } = await victima.cli
      .from('solicitudes')
      .select('id', { count: 'exact', head: true })
      .in('id', idsDeLaVictima);
    chequeo((siguen ?? 0) === idsDeLaVictima.length, `${intruso.email} NO puede borrar solicitudes de ${victima.email}`, `quedan ${siguen} de ${idsDeLaVictima.length}`);
  }

  console.log(`\nResumen: ${aciertos} ✓ · ${fallos} ✗`);
  console.log('Para borrar lo que creó esta corrida:  node scripts/pruebas-masivas.mjs --limpiar');
  if (fallos > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('Error inesperado:', e?.message ?? e);
  process.exit(1);
});