'use client';

/**
 * lib/session/SessionProvider.tsx
 * Equivalente seguro a SESSION + hidratarSession (Expo). Vive
 * SOLAMENTE en el navegador (por eso 'use client' arriba) — cada
 * pestaña de cada persona tiene su propia instancia de este Context,
 * nunca se comparte entre usuarios ni entre peticiones del servidor.
 *
 * Recordar el bug real que corregimos en la version de Expo: alli el
 * problema era una CARRERA DE TIEMPOS (se liberaba la pantalla antes
 * de que SESSION terminara de llenarse). Aqui ese riesgo desaparece
 * por diseño: "cargando" empieza en true y solo pasa a false DESPUES
 * de que "perfil" ya tiene los datos reales — nunca antes.
 */
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Plan } from '@/lib/planes/capacidades';

export type Rol = 'cliente' | 'proveedor';

export type PerfilSesion = {
  id: string;
  alias: string;
  rol: Rol;
  plan: Plan;
  avatarColor: string;
  fotos: string[];
  calificacionProm: number;
  perfilActivo: boolean;
  verificado: boolean;
  regalo: string;
  estatura: string;
  ciudad: string;
  hobbies: string[];
  esAdmin: boolean;
};

type SessionContextType = {
  perfil: PerfilSesion | null;
  cargando: boolean;
  refrescar: () => Promise<void>;
  cerrarSesion: () => Promise<void>;
};

const SessionContext = createContext<SessionContextType | null>(null);

async function cargarPerfilReal(): Promise<PerfilSesion | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return null;

  const { data: p, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !p) {
    console.error('Error cargando perfil de sesión:', error);
    return null;
  }

  const { data: hobbiesData } = await supabase
    .from('perfil_hobbies')
    .select('hobbies(label)')
    .eq('perfil_id', userId);

  const hobbies = (hobbiesData ?? [])
    .map((h: any) => h.hobbies?.label)
    .filter((l: any): l is string => !!l);

  return {
    id: p.id,
    alias: p.alias,
    rol: p.rol,
    plan: p.plan ?? 'basico',
    avatarColor: p.avatar_color,
    fotos: p.fotos ?? [],
    calificacionProm: p.calificacion_prom ?? 5,
    perfilActivo: p.perfil_activo ?? true,
    verificado: p.estado_verificacion === 'aprobado',
    regalo: p.regalo ?? '',
    estatura: p.estatura ?? '',
    ciudad: p.ciudad ?? '',
    hobbies,
    esAdmin: !!p.es_admin,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<PerfilSesion | null>(null);
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(async () => {
    setCargando(true);
    const nuevoPerfil = await cargarPerfilReal();
    setPerfil(nuevoPerfil);
    setCargando(false);
  }, []);

  useEffect(() => {
    refrescar();

    // Si la sesion cambia (login, logout, refresco de token) en
    // cualquier parte de la app, este Context se entera y se
    // actualiza solo — asi no hace falta refrescar la pagina a mano.
    const supabase = createClient();
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      refrescar();
    });
    return () => listener.subscription.unsubscribe();
  }, [refrescar]);

  const cerrarSesion = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setPerfil(null);
  }, []);

  return (
    <SessionContext.Provider value={{ perfil, cargando, refrescar, cerrarSesion }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextType {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de <SessionProvider>');
  return ctx;
}
