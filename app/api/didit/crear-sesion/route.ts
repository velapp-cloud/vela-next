import { NextResponse } from 'next/server';
import { crearClienteServicio } from '@/lib/supabase/servicio';
import { crearSesionDidit } from '@/lib/didit/cliente';

export async function POST(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 });

  const servicio = crearClienteServicio();
  const { data: userData } = await servicio.auth.getUser(token);
  const user = userData?.user;
  if (!user) return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 });

  const { data: perfil } = await servicio
    .from('perfiles')
    .select('id, registro_completo, estado_verificacion')
    .eq('id', user.id)
    .single();

  if (!perfil || !perfil.registro_completo) {
    return NextResponse.json({ ok: false, error: 'Termina tu registro primero.' }, { status: 400 });
  }
  if (perfil.estado_verificacion === 'aprobado') {
    return NextResponse.json({ ok: false, error: 'Tu cuenta ya está verificada.' }, { status: 409 });
  }

  // Límite: máximo 5 sesiones de Didit en 24 horas por persona.
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await servicio
    .from('verificaciones_identidad')
    .select('id', { count: 'exact', head: true })
    .eq('perfil_id', user.id)
    .eq('proveedor', 'didit')
    .gte('creado_en', desde);
  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      { ok: false, error: 'Demasiados intentos hoy. Intenta de nuevo mañana o usa la verificación manual.' },
      { status: 429 },
    );
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '');

  try {
    const sesion = await crearSesionDidit(user.id, `${base}/pendiente`);

    const { data: existente } = await servicio
      .from('verificaciones_identidad')
      .select('id')
      .eq('didit_session_id', sesion.sessionId)
      .maybeSingle();

    if (!existente) {
      const { error: errIns } = await servicio.from('verificaciones_identidad').insert({
        perfil_id: user.id,
        proveedor: 'didit',
        didit_session_id: sesion.sessionId,
        didit_estado: 'Not Started',
      });
      if (errIns) {
        console.error('Didit: no se pudo guardar la sesión', errIns.message);
        return NextResponse.json({ ok: false, error: 'No se pudo iniciar la verificación.' }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, url: sesion.url });
  } catch (e: any) {
    console.error('Didit: error creando sesión', e?.message);
    return NextResponse.json(
      { ok: false, error: 'No se pudo iniciar la verificación. Intenta de nuevo o usa la verificación manual.' },
      { status: 502 },
    );
  }
}