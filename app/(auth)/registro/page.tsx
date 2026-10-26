'use client';

/**
 * app/(auth)/registro/page.tsx
 *
 * Flujo (4 pasos): 1 qué buscas + términos (-> cómo funciona) -> 2 tu cuenta (crea la cuenta y envía
 * el código de 6 dígitos al correo; luego verifica el código + activa la ubicación) ->
 * 3 tu perfil (residencia, estatura, ocupación, idiomas, disponibilidad y fotos) ->
 * 4 preferencias (solo "ser descubierta") + verificación de identidad.
 *
 * La cuenta se crea al final del paso 2, pero la sesión solo existe cuando el correo se verifica
 * (requiere "Confirm email" activo en Supabase). Desde el paso 3 ya hay sesión y userId reales,
 * necesarios para las rutas de Storage (cada archivo vive en una carpeta con el ID del usuario).
 *
 * El alias NO se pide: lo genera la base de datos (INICIALES-0001) al guardar primer nombre y
 * primer apellido al verificar el correo.
 *
 * Fotos y documentos: cámara del celular, cámara web de la computadora o galería. Solo JPG y PNG.
 *
 * Correo y teléfono se validan antes de poder continuar. El código del correo muestra su vigencia,
 * se verifica solo al escribir el sexto dígito y se puede reenviar (espera de 60 s entre envíos).
 *
 * Todos los guardados en la base se revisan: si alguno falla se muestra el error y se puede
 * reintentar sin duplicar datos.
 *
 * UX: barra de progreso con el nombre del paso, botón principal grande fijo abajo con aviso de lo que
 * falta, mostrar/ocultar contraseña, autocompletado del navegador y fecha máxima (18 años).
 * Disponibilidad: "Siempre disponible" es excluyente con las demás opciones.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { CATEGORIAS_CHIPS } from '@/lib/chips/chipsPreferencia';
import { PAISES, type Pais } from '@/lib/paises/paises';
import { DEPARTAMENTOS_SV, NOMBRES_DEPARTAMENTOS_SV } from '@/lib/paises/departamentosSV';
import { CAPACIDADES } from '@/lib/planes/capacidades';
import { formatearEstatura, estaturaValida } from '@/lib/utils/estatura';
import { prepararImagen, FORMATOS_TEXTO } from '@/lib/utils/imagenes';
import SelectorIdiomas from '@/components/SelectorIdiomas';
import BotonesFoto from '@/components/BotonesFoto';
import { esCorreoValido, telefonoValidoPara } from '@/lib/utils/validaciones';

type Rol = 'cliente' | 'proveedor';
type Paso = 1 | 1.5 | 2 | 2.5 | 3 | 4;
type EstadoUbicacion = 'idle' | 'pidiendo' | 'activa' | 'denegada' | 'error' | 'no-soportada';

const OCUPACIONES = [
  'Empresario/a', 'Profesional independiente', 'Empleado/a privado',
  'Empleado/a público', 'Estudiante', 'Artista / Creativo/a',
  'Área de salud', 'Docente', 'Comerciante', 'Sector tecnológico',
  'Gastronomía', 'Entretenimiento', 'Bienes raíces', 'Finanzas',
  'Deportista', 'Ama/o de casa', 'Jubilado/a', 'Prefiero no decir', 'Otro',
];

const SIEMPRE_DISPONIBLE = 'Siempre disponible';
const DISPONIBILIDAD_OPCIONES = ['Mañanas', 'Tardes', 'Noches', 'Fines de semana', SIEMPRE_DISPONIBLE];
const OTRAS_DISPONIBILIDADES = DISPONIBILIDAD_OPCIONES.filter((o) => o !== SIEMPRE_DISPONIBLE);
const TOTAL_PASOS = 4;
const COLOR_CLIENTE = '#3B82F6';
const COLOR_PROVEEDOR = '#D91F3A';
const TITULOS_PASO: Record<string, string> = {
  '1': 'Qué buscas',
  '1.5': 'Cómo funciona',
  '2': 'Tu cuenta',
  '2.5': 'Verifica tu correo',
  '3': 'Tu perfil',
  '4': 'Preferencias y verificación',
};

/** Fecha más reciente permitida para nacer (hoy hace 18 años), en formato yyyy-mm-dd. */
function fechaMaximaNacimiento(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dia}`;
}
const AVATAR_COLORES = ['#D91F3A', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#000000'];
const FOTO_MIN = 2;
// Al registrarse el plan es "básico": se respeta su límite de fotos para que el perfil sea consistente.
const MAX_FOTOS = Math.max(FOTO_MIN, CAPACIDADES.basico.maxFotos);
// Tiempo (segundos) que se muestra como vigencia del código y espera mínima entre reenvíos.
// La vigencia REAL la define Supabase (Authentication > Sign In / Providers > Email > OTP expiry).
const CODIGO_VIGENCIA_SEG = 600;
const REENVIO_ESPERA_SEG = 60;

function formatearTiempo(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Quita números y símbolos de un nombre/apellido (deja letras, tildes, espacios, guion y apóstrofe). */
function limpiarNombre(v: string): string {
  return v
    .replace(/[0-9_!@#$%^&*()+=<>?\/\\|{}[\]~`"]/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 40);
}

export default function Registro() {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>(1);
  const [error, setError] = useState('');

  const [rol, setRol] = useState<Rol | null>(null);
  const [aceptaTerminos, setAceptaTerminos] = useState(false);

  const [primerNombre, setPrimerNombre] = useState('');
  const [segundoNombre, setSegundoNombre] = useState('');
  const [primerApellido, setPrimerApellido] = useState('');
  const [segundoApellido, setSegundoApellido] = useState('');
  const [nombreLibre, setNombreLibre] = useState('');
  const [nombrePorPartes, setNombrePorPartes] = useState(false);
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [correo, setCorreo] = useState('');
  const [paisTelefono, setPaisTelefono] = useState<Pais>(PAISES[0]);
  const [showPaisPicker, setShowPaisPicker] = useState(false);
  const [busquedaPais, setBusquedaPais] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [creandoCuenta, setCreandoCuenta] = useState(false);
  const [verPassword, setVerPassword] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);

  // Paso 2.5: verificación del correo y ubicación
  const [codigo, setCodigo] = useState('');
  const [verificandoCodigo, setVerificandoCodigo] = useState(false);
  const [reenviarEn, setReenviarEn] = useState(0);
  const [codigoVenceEn, setCodigoVenceEn] = useState(0);
  const [reenviando, setReenviando] = useState(false);
  const [infoCodigo, setInfoCodigo] = useState('');
  const [ubicacion, setUbicacion] = useState<EstadoUbicacion>('idle');
  // Cuando el código ya se verificó se queda en esta pantalla hasta activar la ubicación (obligatoria).
  const [correoVerificado, setCorreoVerificado] = useState(false);

  useEffect(() => {
    if (reenviarEn <= 0) return;
    const t = setTimeout(() => setReenviarEn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [reenviarEn]);

  useEffect(() => {
    if (codigoVenceEn <= 0) return;
    const t = setTimeout(() => setCodigoVenceEn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [codigoVenceEn]);

  // Si el navegador ya tiene el permiso de ubicación concedido, se marca como activa; también reacciona
  // si la persona lo cambia desde el candado de la barra de direcciones.
  useEffect(() => {
    if (!correoVerificado) return;
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    let vivo = true;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((r) => {
        if (!vivo) return;
        if (r.state === 'granted') setUbicacion('activa');
        r.onchange = () => {
          if (!vivo) return;
          if (r.state === 'granted') setUbicacion('activa');
          else if (r.state === 'denied') setUbicacion('denegada');
        };
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [correoVerificado]);

  /** Escribe el nombre completo en un solo campo y lo reparte en nombres y apellidos (patrón latino:
   *  2 palabras = nombre + apellido; 3 = nombre + 2 apellidos; 4 o más = 2 nombres + apellidos). */
  function aplicarNombreCompleto(v: string) {
    const limpio = limpiarNombre(v);
    setNombreLibre(limpio);
    const p = limpio.trim().split(/\s+/).filter(Boolean);
    setPrimerNombre(p[0] ?? '');
    if (p.length >= 4) {
      setSegundoNombre(p[1]);
      setPrimerApellido(p[2]);
      setSegundoApellido(p.slice(3).join(' '));
    } else if (p.length === 3) {
      setSegundoNombre('');
      setPrimerApellido(p[1]);
      setSegundoApellido(p[2]);
    } else {
      setSegundoNombre('');
      setPrimerApellido(p[1] ?? '');
      setSegundoApellido('');
    }
  }

  const nombreCompleto = [primerNombre, segundoNombre, primerApellido, segundoApellido]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(' ');

  const colorRol = rol === 'cliente' ? COLOR_CLIENTE : COLOR_PROVEEDOR;
  const paso1Valido = rol !== null && aceptaTerminos;
  const faltanPaso1 = [
    rol === null && 'elegir qué buscas',
    !aceptaTerminos && 'aceptar los términos',
  ].filter(Boolean) as string[];

  const passLargoOk = password.length >= 8;
  const passMayus = /[A-Z]/.test(password);
  const passMinus = /[a-z]/.test(password);
  const passNumero = /[0-9]/.test(password);
  const passSimbolo = /[!@#$%^&*(),.?":{}|<>_\-+=/\\[\];'`~]/.test(password);
  const passwordValid = passLargoOk && passMayus && passMinus && passNumero && passSimbolo;
  const passwordsCoinciden = password.length > 0 && password === confirmPassword;

  const edadValida = (() => {
    if (!fechaNacimiento) return false;
    const [y, m, d] = fechaNacimiento.split('-').map(Number);
    const hoy = new Date();
    let edad = hoy.getFullYear() - y;
    const antesDeCumplir = (hoy.getMonth() + 1) < m || ((hoy.getMonth() + 1) === m && hoy.getDate() < d);
    if (antesDeCumplir) edad--;
    return edad >= 18;
  })();

  const correoValido = esCorreoValido(correo);
  const telefonoValido = telefonoValidoPara(paisTelefono.dial, telefono);

  const paso2Valido =
    primerNombre.trim().length >= 2 &&
    primerApellido.trim().length >= 2 &&
    edadValida &&
    correoValido &&
    telefonoValido &&
    passwordValid &&
    passwordsCoinciden;

  const faltanPaso2 = [
    primerNombre.trim().length < 2 && 'primer nombre',
    primerApellido.trim().length < 2 && 'primer apellido',
    !edadValida && 'fecha de nacimiento (mayor de 18)',
    !correoValido && 'correo válido',
    !telefonoValido && 'teléfono válido',
    !passwordValid && 'contraseña segura',
    passwordValid && !passwordsCoinciden && 'confirmar la contraseña',
  ].filter(Boolean) as string[];

  const paisesFiltrados = PAISES.filter((p) => p.nombre.toLowerCase().includes(busquedaPais.trim().toLowerCase()));

  const [paisResidencia, setPaisResidencia] = useState<Pais>(PAISES[0]);
  const [showPaisResidenciaPicker, setShowPaisResidenciaPicker] = useState(false);
  const [busquedaPaisResidencia, setBusquedaPaisResidencia] = useState('');
  const [departamentoSV, setDepartamentoSV] = useState('');
  const [ciudadSV, setCiudadSV] = useState('');
  const [ciudadLibre, setCiudadLibre] = useState('');
  const [estatura, setEstatura] = useState('');
  const [ocupacion, setOcupacion] = useState('');
  const [idiomas, setIdiomas] = useState('');
  const [disponibilidad, setDisponibilidad] = useState<string[]>([]);

  const [fotos, setFotos] = useState<string[]>([]);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const esElSalvador = paisResidencia.codigo === 'SV';
  const ciudadFinal = esElSalvador ? ciudadSV : ciudadLibre;
  const estaturaOk = estaturaValida(estatura);
  const faltanFotos = Math.max(0, FOTO_MIN - fotos.length);
  const paso3Valido = ciudadFinal.trim() !== '' && estaturaOk && faltanFotos === 0;
  const faltanPaso3 = [
    ciudadFinal.trim() === '' && 'ciudad',
    !estaturaOk && 'estatura válida',
    faltanFotos > 0 && `${faltanFotos} ${faltanFotos === 1 ? 'foto' : 'fotos'}`,
  ].filter(Boolean) as string[];
  const paisesResidenciaFiltrados = PAISES.filter((p) => p.nombre.toLowerCase().includes(busquedaPaisResidencia.trim().toLowerCase()));

  const [regalo, setRegalo] = useState('');
  const [chipsSel, setChipsSel] = useState<string[]>([]);

  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [documentoUrl, setDocumentoUrl] = useState<string | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [documentoPreview, setDocumentoPreview] = useState<string | null>(null);
  const [subiendoVerificacion, setSubiendoVerificacion] = useState<'selfie' | 'documento' | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  // Evita duplicar la solicitud de verificación si hay que reintentar "Finalizar".
  const [verifGuardada, setVerifGuardada] = useState(false);
  const paso4Valido = !!selfieUrl && !!documentoUrl;
  const faltanPaso4 = [
    !selfieUrl && 'selfie con tu documento',
    !documentoUrl && 'foto de tu documento',
  ].filter(Boolean) as string[];

  // 1 y 1.5 se muestran como paso 1; 2 y 2.5 (código del correo) como paso 2.
  const pasoMostrado = Math.floor(paso);

  async function subirArchivo(bucket: string, file: File, carpeta: string): Promise<string | null> {
    const supabase = createClient();
    const path = `${carpeta}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file);
    if (uploadError) {
      console.error(`Error subiendo a ${bucket}:`, uploadError);
      return null;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async function subirArchivoPrivado(bucket: string, file: File, carpeta: string): Promise<string | null> {
    const supabase = createClient();
    const path = `${carpeta}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file);
    if (uploadError) {
      console.error(`Error subiendo a ${bucket}:`, uploadError);
      return null;
    }
    return path;
  }

  async function handleAgregarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userId || fotos.length >= MAX_FOTOS) return;
    setSubiendoFoto(true);
    setError('');

    const r = await prepararImagen(file, 'perfil');
    if (!r.ok) {
      setError(r.error);
      setSubiendoFoto(false);
      return;
    }

    const url = await subirArchivo('fotos-perfil', r.archivo, userId);
    URL.revokeObjectURL(r.vistaPrevia);
    setSubiendoFoto(false);
    if (url) setFotos((prev) => [...prev, url]);
    else setError('No se pudo subir la foto. Intenta de nuevo.');
  }

  async function handleSubirVerificacion(tipo: 'selfie' | 'documento', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userId) return;
    setSubiendoVerificacion(tipo);
    setError('');

    const r = await prepararImagen(file, 'documento');
    if (!r.ok) {
      setError(r.error);
      setSubiendoVerificacion(null);
      return;
    }

    const path = await subirArchivoPrivado('documentos-verificacion', r.archivo, userId);
    setSubiendoVerificacion(null);
    if (path) {
      if (tipo === 'selfie') {
        setSelfieUrl(path);
        setSelfiePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return r.vistaPrevia; });
      } else {
        setDocumentoUrl(path);
        setDocumentoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return r.vistaPrevia; });
      }
    } else {
      URL.revokeObjectURL(r.vistaPrevia);
      setError('No se pudo subir el archivo. Intenta de nuevo.');
    }
  }

  function toggleDisponibilidad(op: string) {
    setDisponibilidad((prev) => {
      // "Siempre disponible" reemplaza a todas las demás (y al tocarla otra vez se quita).
      if (op === SIEMPRE_DISPONIBLE) return prev.includes(op) ? [] : [op];
      // Elegir cualquier otra quita "Siempre disponible" y permite elegir varias.
      const sinSiempre = prev.filter((x) => x !== SIEMPRE_DISPONIBLE);
      return sinSiempre.includes(op) ? sinSiempre.filter((x) => x !== op) : [...sinSiempre, op];
    });
  }
  function toggleChip(chip: string) {
    setChipsSel((prev) => (prev.includes(chip) ? prev.filter((x) => x !== chip) : [...prev, chip]));
  }

  const avatarColor = AVATAR_COLORES[Math.floor(Math.random() * AVATAR_COLORES.length)];

  /** Paso 2: crea la cuenta y Supabase envía el código de 6 dígitos al correo. */
  async function handleCrearCuenta() {
    if (!paso2Valido || creandoCuenta) return;
    setCreandoCuenta(true);
    setError('');
    const supabase = createClient();

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: correo.trim(),
        password,
      });

      if (signUpError || !signUpData.user) {
        setError(traducirErrorRegistro(signUpError?.message));
        setCreandoCuenta(false);
        return;
      }

      // Con confirmación de correo activa, un correo ya registrado devuelve un usuario "vacío" sin identidades.
      if (signUpData.user.identities && signUpData.user.identities.length === 0) {
        setError('Ya existe una cuenta con ese correo.');
        setCreandoCuenta(false);
        return;
      }

      // Si llegó una sesión, Supabase NO está exigiendo el código (falta activar "Confirm email").
      if (signUpData.session) {
        await supabase.auth.signOut();
        setError('Falta activar "Confirm email" en Supabase (Authentication > Sign In / Providers > Email) para exigir el código. Avisa al administrador del sistema.');
        setCreandoCuenta(false);
        return;
      }

      setCodigo('');
      setInfoCodigo('');
      setReenviarEn(REENVIO_ESPERA_SEG);
      setCodigoVenceEn(CODIGO_VIGENCIA_SEG);
      setCreandoCuenta(false);
      setPaso(2.5);
    } catch (err) {
      console.error('Excepción creando cuenta:', err);
      setError('No se pudo crear la cuenta. Intenta de nuevo.');
      setCreandoCuenta(false);
    }
  }

  /** Paso 2.5: verifica el código; con eso ya hay sesión real y se guardan los datos del perfil. */
  async function handleVerificarCodigo(codigoManual?: string) {
    const codigoIngresado = (codigoManual ?? codigo).trim();
    if (codigoIngresado.length !== 6 || verificandoCodigo) return;
    setVerificandoCodigo(true);
    setError('');
    const supabase = createClient();

    try {
      // Si el código ya se verificó en un intento anterior (y falló el guardado), se reutiliza el usuario.
      let uid = userId;

      if (!uid) {
        const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
          email: correo.trim(),
          token: codigoIngresado,
          type: 'signup',
        });

        if (otpError || !otpData.user) {
          setError(traducirErrorCodigo(otpError?.message));
          setVerificandoCodigo(false);
          return;
        }

        uid = otpData.user.id;
        setUserId(uid);
      }

      // OJO: no se envía "alias". Lo genera la base de datos (INICIALES-0001) a partir del nombre y apellido.
      const { error: perfilError } = await supabase
        .from('perfiles')
        .update({
          primer_nombre: primerNombre.trim(),
          segundo_nombre: segundoNombre.trim() || null,
          primer_apellido: primerApellido.trim(),
          segundo_apellido: segundoApellido.trim() || null,
          nombre_completo: nombreCompleto,
          correo: correo.trim(),
          telefono: `${paisTelefono.dial}${telefono}`,
          fecha_nacimiento: fechaNacimiento,
          rol,
          avatar_color: avatarColor,
          plan: 'basico',
          estado_verificacion: 'pendiente',
          verificacion_notificada: false,
          perfil_activo: true,
          registro_completo: false,
          terminos_aceptados: true,
          terminos_aceptados_en: new Date().toISOString(),
        })
        .eq('id', uid);

      if (perfilError) {
        console.error(
          `Error guardando datos del perfil: ${perfilError.message ?? ''} | code: ${perfilError.code ?? ''} | details: ${perfilError.details ?? ''} | hint: ${perfilError.hint ?? ''}`,
        );
        setError(`Tu correo se verificó, pero no se pudieron guardar tus datos (${perfilError.message || 'error desconocido'}). Toca el botón otra vez para reintentar.`);
        setVerificandoCodigo(false);
        return;
      }

      // El correo quedó verificado: se queda en esta pantalla para exigir la ubicación antes de seguir.
      setVerificandoCodigo(false);
      setCorreoVerificado(true);
    } catch (err) {
      console.error('Excepción verificando el código:', err);
      setError('No se pudo verificar el código. Intenta de nuevo.');
      setVerificandoCodigo(false);
    }
  }

  async function handleReenviarCodigo() {
    if (reenviarEn > 0 || reenviando) return;
    setReenviando(true);
    setError('');
    setInfoCodigo('');
    const supabase = createClient();
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: correo.trim() });
      if (resendError) {
        setError(traducirErrorCodigo(resendError.message));
        // Si Supabase pide esperar, se respeta la espera para no frustrar a la persona.
        setReenviarEn(REENVIO_ESPERA_SEG);
        setReenviando(false);
        return;
      }
      setCodigo('');
      setReenviarEn(REENVIO_ESPERA_SEG);
      setCodigoVenceEn(CODIGO_VIGENCIA_SEG);
      setInfoCodigo(`Te enviamos un código nuevo a ${correo.trim()}. El anterior ya no sirve.`);
    } catch (err) {
      console.error('Excepción reenviando el código:', err);
      setError('No se pudo reenviar el código. Intenta de nuevo.');
    }
    setReenviando(false);
  }

  /** Solo pide el permiso del navegador. No se guardan coordenadas: se usa en las alertas de seguridad. */
  function pedirUbicacion() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setUbicacion('no-soportada');
      return;
    }
    setUbicacion('pidiendo');
    navigator.geolocation.getCurrentPosition(
      () => setUbicacion('activa'),
      (err) => setUbicacion(err.code === 1 ? 'denegada' : 'error'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function handleFinalizarRegistro() {
    if (!userId || finalizando) return;
    setFinalizando(true);
    setError('');
    const supabase = createClient();

    try {
      // 1) Solicitud de verificación (lo más importante: sin esto el admin no puede revisar).
      if (!verifGuardada) {
        const { error: verifError } = await supabase.from('verificaciones_identidad').insert({
          perfil_id: userId,
          selfie_url: selfieUrl,
          documento_url: documentoUrl,
        });

        if (verifError) {
          console.error('Error guardando verificación de identidad:', {
            message: verifError.message,
            details: verifError.details,
            hint: verifError.hint,
            code: verifError.code,
          });
          setError('No se pudieron guardar tus documentos de verificación. Intenta de nuevo.');
          setFinalizando(false);
          return;
        }
        setVerifGuardada(true);
      }

      // 2) Preferencias (solo "quiero ser descubierta"). Se borran y reinsertan para poder reintentar sin duplicar.
      if (rol === 'proveedor') {
        const { error: delChipsError } = await supabase
          .from('perfil_chips_preferencia')
          .delete()
          .eq('perfil_id', userId);

        if (delChipsError) {
          console.error('Error limpiando preferencias:', delChipsError);
          setError('No se pudieron guardar tus preferencias. Intenta de nuevo.');
          setFinalizando(false);
          return;
        }

        if (chipsSel.length > 0) {
          const { error: chipsError } = await supabase
            .from('perfil_chips_preferencia')
            .insert(chipsSel.map((chip) => ({ perfil_id: userId, chip })));

          if (chipsError) {
            console.error('Error guardando preferencias:', chipsError);
            setError('No se pudieron guardar tus preferencias. Intenta de nuevo.');
            setFinalizando(false);
            return;
          }
        }
      }

      // 3) Al final se marca el registro como completo.
      const { error: updateError } = await supabase
        .from('perfiles')
        .update({
          ciudad: ciudadFinal.trim(),
          estatura: `${estatura}m`,
          ocupacion,
          idiomas: idiomas.trim(),
          disponible: disponibilidad.join(', '),
          fotos,
          registro_completo: true,
          ...(rol === 'proveedor' ? { regalo: regalo.trim() || null } : {}),
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Error guardando datos de perfil:', {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code,
        });
        setError('Hubo un problema guardando tus datos. Intenta de nuevo o contacta a soporte.');
        setFinalizando(false);
        return;
      }

      router.replace('/pendiente');
    } catch (err) {
      console.error('Excepción finalizando registro:', err);
      setError('No se pudo completar el registro. Intenta de nuevo.');
      setFinalizando(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col px-6 py-8 max-w-md mx-auto w-full">
      <button
        onClick={() => {
          if (paso === 1) { router.back(); return; }
          if (paso === 1.5) { setPaso(1); return; }
          if (paso === 2.5) { if (userId) return; setError(''); setPaso(2); return; }
          if (paso === 3 && userId) return;
          setError('');
          setPaso((p) => (p - 1) as Paso);
        }}
        className="w-11 h-11 rounded-xl bg-vela-surface-2 flex items-center justify-center mb-5 text-vela-text"
        aria-label="Volver"
      >
        ←
      </button>

      <div className="flex items-center justify-between mb-3">
        <h1 className="font-serif italic text-3xl text-vela-public leading-none">Vela</h1>
        <p className="text-xs text-vela-text-faint">Paso {pasoMostrado} de {TOTAL_PASOS}</p>
      </div>
      <div className="mb-6">
        <div
          className="flex gap-1.5 mb-2"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={TOTAL_PASOS}
          aria-valuenow={pasoMostrado}
        >
          {Array.from({ length: TOTAL_PASOS }, (_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i < pasoMostrado ? 'bg-vela-public' : 'bg-vela-surface-2'}`}
            />
          ))}
        </div>
        <p className="text-xs text-vela-text-dim font-semibold">{paso === 4 && rol !== 'proveedor' ? 'Verificación de identidad' : TITULOS_PASO[String(paso)]}</p>
      </div>

      {/* ───────── Paso 1: qué buscas + términos ───────── */}
      {paso === 1 && (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-2xl font-extrabold text-vela-text">¿Qué buscas en Vela?</h2>
            <p className="text-sm text-vela-text-faint mt-1">Siempre con identidad verificada.</p>
          </div>

          <div className="flex flex-col gap-3">
            <TarjetaRol
              icono="🔍"
              titulo="Quiero conocer"
              texto="Explora perfiles verificados y envía solicitudes de encuentro."
              color={COLOR_CLIENTE}
              activo={rol === 'cliente'}
              onClick={() => setRol('cliente')}
            />
            <TarjetaRol
              icono="⭐"
              titulo="Quiero ser descubierta"
              texto="Recibe solicitudes de encuentro de perfiles verificados."
              color={COLOR_PROVEEDOR}
              activo={rol === 'proveedor'}
              onClick={() => setRol('proveedor')}
            />
          </div>

          <label className="flex items-start gap-3 bg-vela-surface border border-vela-line rounded-2xl p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={aceptaTerminos}
              onChange={(e) => setAceptaTerminos(e.target.checked)}
              className="mt-0.5 w-5 h-5 flex-shrink-0"
              style={{ accentColor: colorRol }}
            />
            <span className="text-sm text-vela-text-dim leading-relaxed">
              He leído y acepto los{' '}
              <Link href="/terminos" target="_blank" className="text-vela-public font-semibold underline">
                Términos y Condiciones
              </Link>{' '}
              de Vela, y confirmo que soy mayor de 18 años.
              <span className="text-[#D91F3A] font-bold ml-0.5" aria-hidden="true">*</span>
            </span>
          </label>

          <Pie ayuda={!paso1Valido ? `Falta: ${faltanPaso1.join(' y ')}.` : ''}>
            <BotonPrincipal disabled={!paso1Valido} color={colorRol} onClick={() => setPaso(1.5)}>
              Continuar
            </BotonPrincipal>
            <p className="text-sm text-center mt-3">
              <span className="text-vela-text-faint">¿Ya tienes cuenta? </span>
              <Link href="/login" className="text-vela-public font-semibold">Inicia sesión</Link>
            </p>
          </Pie>
        </div>
      )}

      {paso === 1.5 && rol && <ComoFuncionaVela rol={rol} onContinuar={() => setPaso(2)} />}

      {/* ───────── Paso 2: tu cuenta ───────── */}
      {paso === 2 && (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-2xl font-extrabold text-vela-text">Crea tu cuenta</h2>
            <p className="text-sm text-vela-text-faint mt-1">Un par de minutos y listo.</p>
          </div>
          <NotaObligatorio />

          {!nombrePorPartes ? (
            <div>
              <Campo
                label="Nombre completo"
                requerido
                value={nombreLibre}
                onChange={aplicarNombreCompleto}
                placeholder="Ej. María Pérez López"
                autoComplete="name"
              />
              <p className="text-[11px] text-vela-text-faint mt-1.5 leading-relaxed">
                Escríbelo como aparece en tu documento de identidad. Tu alias en Vela se genera solo, a partir de tus iniciales.
              </p>
              {primerNombre !== '' && primerApellido !== '' && (
                <p className="text-[11px] text-vela-text-dim mt-1">
                  Te registraremos como: {primerNombre}{segundoNombre ? ` ${segundoNombre}` : ''} · {primerApellido}{segundoApellido ? ` ${segundoApellido}` : ''}.{' '}
                  <button type="button" onClick={() => setNombrePorPartes(true)} className="text-vela-public font-semibold underline">
                    ¿No es correcto? Edítalo por partes
                  </button>
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Primer nombre" requerido value={primerNombre} onChange={(v) => setPrimerNombre(limpiarNombre(v))} placeholder="Ej. María" autoComplete="given-name" />
                <Campo label="Segundo nombre" value={segundoNombre} onChange={(v) => setSegundoNombre(limpiarNombre(v))} placeholder="Opcional" />
                <Campo label="Primer apellido" requerido value={primerApellido} onChange={(v) => setPrimerApellido(limpiarNombre(v))} placeholder="Ej. Pérez" autoComplete="family-name" />
                <Campo label="Segundo apellido" value={segundoApellido} onChange={(v) => setSegundoApellido(limpiarNombre(v))} placeholder="Opcional" />
              </div>
              <button
                type="button"
                onClick={() => { setNombreLibre(nombreCompleto); setNombrePorPartes(false); }}
                className="self-start text-xs text-vela-public font-semibold underline"
              >
                Volver a un solo campo
              </button>
            </div>
          )}

          <Campo label="Fecha de nacimiento" requerido value={fechaNacimiento} onChange={setFechaNacimiento} type="date" max={fechaMaximaNacimiento()} autoComplete="bday" />
          {fechaNacimiento && !edadValida && (
            <p className="text-xs text-vela-safety -mt-2">Debes ser mayor de 18 años para registrarte.</p>
          )}
          <Campo label="Correo electrónico" requerido value={correo} onChange={(v) => setCorreo(v.replace(/\s/g, ''))} type="email" placeholder="tucorreo@ejemplo.com" autoComplete="email" />
          {correo.length > 0 && !correoValido && (
            <p className="text-xs text-vela-safety -mt-2">Escribe un correo válido, por ejemplo nombre@dominio.com.</p>
          )}

          <div>
            <Etiqueta texto="Teléfono" requerido />
            <div className="flex gap-2 mt-1.5 relative">
              <button
                type="button"
                onClick={() => { setShowPaisPicker((v) => !v); setBusquedaPais(''); }}
                className="bg-vela-surface-2 border border-vela-line rounded-2xl px-3.5 h-14 text-base font-bold text-vela-text whitespace-nowrap"
              >
                {paisTelefono.codigo} {paisTelefono.dial} ▾
              </button>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value.replace(/\D/g, '').slice(0, paisTelefono.dial === '+503' ? 8 : 12))}
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="Número"
                className="flex-1 min-w-0 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none focus:border-vela-public/60"
              />
              {showPaisPicker && (
                <div className="absolute top-16 left-0 right-0 bg-vela-surface border border-vela-line rounded-2xl z-10 max-h-64 overflow-hidden flex flex-col shadow-lg">
                  <input
                    value={busquedaPais}
                    onChange={(e) => setBusquedaPais(e.target.value)}
                    placeholder="Buscar país..."
                    autoFocus
                    className="px-3 py-2.5 text-sm bg-vela-surface-2 border-b border-vela-line outline-none text-vela-text"
                  />
                  <div className="overflow-y-auto">
                    {paisesFiltrados.map((p) => (
                      <button
                        key={p.codigo}
                        type="button"
                        onClick={() => { setPaisTelefono(p); setShowPaisPicker(false); }}
                        className="w-full text-left px-3 py-2.5 text-sm text-vela-text hover:bg-vela-surface-2 flex justify-between border-b border-vela-line last:border-b-0"
                      >
                        <span>{p.nombre}</span>
                        <span className="text-vela-text-faint">{p.dial}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {telefono.length > 0 && !telefonoValido && (
            <p className="text-xs text-vela-safety -mt-2">
              {paisTelefono.dial === '+503' ? 'El teléfono de El Salvador debe tener 8 dígitos.' : 'Escribe un número de teléfono válido.'}
            </p>
          )}

          <div>
            <Etiqueta texto="Contraseña" requerido />
            <div className="relative mt-1.5">
              <input
                type={verPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                autoComplete="new-password"
                className="w-full bg-vela-surface-2 border border-vela-line rounded-2xl pl-4 pr-24 h-14 text-base text-vela-text outline-none focus:border-vela-public/60"
              />
              <button
                type="button"
                onClick={() => setVerPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-9 px-3 rounded-xl bg-vela-surface-3 text-xs font-bold text-vela-text"
                aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {verPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {password.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <ReglaPassword ok={passLargoOk} texto="8 caracteres" />
                <ReglaPassword ok={passMayus} texto="Mayúscula" />
                <ReglaPassword ok={passMinus} texto="Minúscula" />
                <ReglaPassword ok={passNumero} texto="Número" />
                <ReglaPassword ok={passSimbolo} texto="Símbolo (! @ #)" />
              </div>
            )}
          </div>

          <div>
            <Etiqueta texto="Confirmar contraseña" requerido />
            <input
              type={verPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Escribe tu contraseña otra vez"
              autoComplete="new-password"
              className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none focus:border-vela-public/60"
            />
            {confirmPassword.length > 0 && !passwordsCoinciden && (
              <p className="text-xs text-vela-safety mt-1.5">Las contraseñas no coinciden.</p>
            )}
          </div>

          {error !== '' && <p className="text-sm text-vela-safety">{error}</p>}

          <Pie
            ayuda={
              !paso2Valido
                ? `Falta: ${faltanPaso2.join(', ')}.`
                : 'Al continuar te enviamos un código de 6 dígitos a tu correo.'
            }
          >
            <BotonPrincipal disabled={!paso2Valido || creandoCuenta} onClick={handleCrearCuenta}>
              {creandoCuenta ? 'Enviando código...' : 'Continuar'}
            </BotonPrincipal>
          </Pie>
        </div>
      )}

      {/* ───────── Paso 2 (cont.): verificar el código del correo y activar la ubicación (obligatoria) ───────── */}
      {paso === 2.5 && (
        <div className="flex flex-col gap-4">
          {!correoVerificado ? (
            <>
              <div>
                <h2 className="text-2xl font-extrabold text-vela-text">Revisa tu correo</h2>
                <p className="text-sm text-vela-text-faint mt-1">
                  Te enviamos 6 dígitos de Vela a <span className="text-vela-text font-semibold">{correo.trim()}</span>.
                </p>
              </div>

              <div>
                <Etiqueta texto="Código de verificación" requerido />
                <input
                  value={codigo}
                  onChange={(e) => {
                    const nuevo = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setCodigo(nuevo);
                    setError('');
                    // Al escribir el sexto dígito se verifica solo.
                    if (nuevo.length === 6) handleVerificarCodigo(nuevo);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerificarCodigo()}
                  inputMode="numeric"
                  autoFocus
                  autoComplete="one-time-code"
                  placeholder="123456"
                  className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 py-4 text-2xl text-center tracking-[10px] font-bold text-vela-text outline-none focus:border-vela-public/60"
                />
                {verificandoCodigo && <p className="text-sm text-vela-verified mt-2">Verificando tu código...</p>}
                <p className={`text-xs mt-2 ${codigoVenceEn > 0 ? 'text-vela-text-faint' : 'text-vela-safety font-semibold'}`}>
                  {codigoVenceEn > 0
                    ? `El código vence en ${formatearTiempo(codigoVenceEn)}.`
                    : 'Tu código venció. Pide uno nuevo para continuar.'}
                </p>
                {infoCodigo !== '' && <p className="text-xs text-vela-verified mt-1.5">{infoCodigo}</p>}
                <div className="flex items-center justify-between mt-2">
                  <button
                    type="button"
                    onClick={handleReenviarCodigo}
                    disabled={reenviarEn > 0 || reenviando}
                    className="text-xs text-vela-public font-semibold disabled:text-vela-text-faint"
                  >
                    {reenviando
                      ? 'Enviando...'
                      : reenviarEn > 0
                        ? `Reenviar código en ${reenviarEn}s`
                        : codigoVenceEn > 0 ? '¿No te llegó? Reenviar código' : 'Enviar un código nuevo'}
                  </button>
                  {!userId && (
                    <button
                      type="button"
                      onClick={() => { setError(''); setInfoCodigo(''); setPaso(2); }}
                      className="text-xs text-vela-text-faint font-semibold"
                    >
                      Cambiar correo
                    </button>
                  )}
                </div>
              </div>

              {error !== '' && <p className="text-sm text-vela-safety">{error}</p>}

              <Pie ayuda={codigo.trim().length !== 6 ? 'Se verifica solo al escribir el sexto dígito.' : ''}>
                <BotonPrincipal disabled={codigo.trim().length !== 6 || verificandoCodigo} onClick={() => handleVerificarCodigo()}>
                  {verificandoCodigo ? 'Verificando...' : 'Verificar y continuar'}
                </BotonPrincipal>
              </Pie>
            </>
          ) : (
            <>
              <div>
                <p className="inline-flex items-center gap-1.5 text-xs font-bold text-vela-verified bg-vela-verified-soft rounded-full px-3 py-1">
                  ✓ Correo verificado
                </p>
                <h2 className="text-2xl font-extrabold text-vela-text mt-3">Activa tu ubicación</h2>
                <p className="text-sm text-vela-text-faint mt-1">
                  Es obligatoria para continuar: es la base de tus alertas de seguridad.
                </p>
              </div>

              <div className={`rounded-2xl border-2 p-4 ${ubicacion === 'activa' ? 'border-vela-verified bg-vela-verified-soft' : 'border-vela-line bg-vela-surface'}`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📍</span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-vela-text">Ubicación en tiempo real</p>
                    <p className="text-xs text-vela-text-faint mt-0.5 leading-relaxed">
                      Vela la usa solo para compartirla con tus contactos de emergencia si activas una alerta de seguridad.
                      No se muestra en tu perfil.
                    </p>
                  </div>
                </div>

                {ubicacion === 'activa' ? (
                  <p className="mt-3 text-sm font-bold text-vela-verified">✓ Ubicación activada</p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={pedirUbicacion}
                      disabled={ubicacion === 'pidiendo'}
                      className="mt-3 w-full h-12 rounded-full bg-vela-public text-white text-sm font-bold disabled:opacity-60"
                    >
                      {ubicacion === 'pidiendo'
                        ? 'Esperando permiso...'
                        : ubicacion === 'denegada' || ubicacion === 'error'
                          ? 'Intentar de nuevo'
                          : 'Activar ubicación'}
                    </button>
                    {ubicacion === 'denegada' && (
                      <p className="mt-2 text-xs text-vela-amber leading-relaxed">
                        El navegador tiene bloqueada la ubicación. Toca el candado de la barra de direcciones, elige
                        Permisos → Ubicación → Permitir, y vuelve a tocar el botón.
                      </p>
                    )}
                    {ubicacion === 'error' && (
                      <p className="mt-2 text-xs text-vela-amber">No pudimos obtener tu ubicación. Revisa que el GPS esté encendido e intenta de nuevo.</p>
                    )}
                    {ubicacion === 'no-soportada' && (
                      <p className="mt-2 text-xs text-vela-amber">Este navegador no permite usar la ubicación. Abre Vela en otro navegador para continuar.</p>
                    )}
                  </>
                )}
              </div>

              {error !== '' && <p className="text-sm text-vela-safety">{error}</p>}

              <Pie ayuda={ubicacion !== 'activa' ? 'Falta: activar tu ubicación.' : ''}>
                <BotonPrincipal disabled={ubicacion !== 'activa'} onClick={() => { setError(''); setPaso(3); }}>
                  Continuar
                </BotonPrincipal>
              </Pie>
            </>
          )}
        </div>
      )}

      {/* ───────── Paso 3: tu perfil (residencia, sobre ti, disponibilidad y fotos) ───────── */}
      {paso === 3 && (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-2xl font-extrabold text-vela-text">Tu perfil</h2>
            <p className="text-sm text-vela-text-faint mt-1">Lo que verán los demás de ti.</p>
          </div>
          <NotaObligatorio />

          <div>
            <Etiqueta texto="País de residencia" requerido />
            <div className="relative mt-1.5">
              <button
                type="button"
                onClick={() => { setShowPaisResidenciaPicker((v) => !v); setBusquedaPaisResidencia(''); }}
                className="w-full text-left bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text"
              >
                {paisResidencia.nombre} ▾
              </button>
              {showPaisResidenciaPicker && (
                <div className="absolute top-16 left-0 right-0 bg-vela-surface border border-vela-line rounded-2xl z-10 max-h-64 overflow-hidden flex flex-col shadow-lg">
                  <input
                    value={busquedaPaisResidencia}
                    onChange={(e) => setBusquedaPaisResidencia(e.target.value)}
                    placeholder="Buscar país..."
                    autoFocus
                    className="px-3 py-2.5 text-sm bg-vela-surface-2 border-b border-vela-line outline-none text-vela-text"
                  />
                  <div className="overflow-y-auto">
                    {paisesResidenciaFiltrados.map((p) => (
                      <button
                        key={p.codigo}
                        type="button"
                        onClick={() => {
                          setPaisResidencia(p);
                          setDepartamentoSV('');
                          setCiudadSV('');
                          setShowPaisResidenciaPicker(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-sm text-vela-text hover:bg-vela-surface-2 border-b border-vela-line last:border-b-0"
                      >
                        {p.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {esElSalvador ? (
            <>
              <div>
                <Etiqueta texto="Departamento" requerido />
                <select
                  value={departamentoSV}
                  onChange={(e) => { setDepartamentoSV(e.target.value); setCiudadSV(''); }}
                  className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none"
                >
                  <option value="">Selecciona un departamento</option>
                  {NOMBRES_DEPARTAMENTOS_SV.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              {departamentoSV && (
                <div>
                  <Etiqueta texto="Ciudad / Municipio" requerido />
                  <select
                    value={ciudadSV}
                    onChange={(e) => setCiudadSV(e.target.value)}
                    className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none"
                  >
                    <option value="">Selecciona una ciudad</option>
                    {DEPARTAMENTOS_SV[departamentoSV].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
            </>
          ) : (
            <Campo label="Ciudad" requerido value={ciudadLibre} onChange={setCiudadLibre} placeholder="Escribe tu ciudad" />
          )}

          <div>
            <Etiqueta texto="Estatura" requerido />
            <div className="relative mt-1.5">
              <input
                value={estatura}
                onChange={(e) => setEstatura(formatearEstatura(e.target.value))}
                inputMode="numeric"
                placeholder="1.70"
                className="w-full bg-vela-surface-2 border border-vela-line rounded-2xl pl-4 pr-10 h-14 text-base text-vela-text outline-none focus:border-vela-public/60"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-vela-text-faint">m</span>
            </div>
            <p className="text-[10px] text-vela-text-faint mt-1">Escribe solo los números, el punto se pone solo (ej. 170 → 1.70).</p>
            {estatura.length >= 4 && !estaturaOk && (
              <p className="text-xs text-vela-safety mt-1">Revisa tu estatura: debe estar entre 1.20 y 2.40 m.</p>
            )}
          </div>

          <div>
            <Etiqueta texto="A qué te dedicas" />
            <select
              value={ocupacion}
              onChange={(e) => setOcupacion(e.target.value)}
              className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none"
            >
              <option value="">Selecciona una opción</option>
              {OCUPACIONES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          <div>
            <Etiqueta texto="Idiomas" />
            <SelectorIdiomas value={idiomas} onChange={setIdiomas} />
          </div>

          <div>
            <Etiqueta texto="Disponibilidad" />
            <button
              type="button"
              onClick={() => toggleDisponibilidad(SIEMPRE_DISPONIBLE)}
              aria-pressed={disponibilidad.includes(SIEMPRE_DISPONIBLE)}
              className={`w-full mt-1.5 flex items-center gap-3 h-14 px-4 rounded-2xl border-2 text-left transition ${
                disponibilidad.includes(SIEMPRE_DISPONIBLE)
                  ? 'bg-vela-public-soft border-vela-public'
                  : 'bg-vela-surface border-vela-line-strong'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[11px] text-white flex-shrink-0 ${
                  disponibilidad.includes(SIEMPRE_DISPONIBLE) ? 'bg-vela-public border-vela-public' : 'border-vela-text-faint'
                }`}
              >
                {disponibilidad.includes(SIEMPRE_DISPONIBLE) ? '✓' : ''}
              </span>
              <span className="flex-1 text-sm font-bold text-vela-text">{SIEMPRE_DISPONIBLE}</span>
              <span className="text-[11px] text-vela-text-faint">Incluye todas</span>
            </button>
            <div className="flex flex-wrap gap-2 mt-2">
              {OTRAS_DISPONIBILIDADES.map((op) => (
                <ChipToggle key={op} texto={op} activo={disponibilidad.includes(op)} onClick={() => toggleDisponibilidad(op)} />
              ))}
            </div>
            <p className="text-[10px] text-vela-text-faint mt-1.5">Elige varias, o &quot;Siempre disponible&quot; (esta reemplaza a las demás).</p>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <Etiqueta texto="Fotos de perfil" requerido />
              <span className="text-[11px] text-vela-text-faint">Solo {FORMATOS_TEXTO} · {fotos.length}/{MAX_FOTOS}</span>
            </div>
            <p className="text-xs text-vela-text-faint mt-1 mb-3 leading-relaxed">
              Mínimo {FOTO_MIN} fotos para poder aparecer en búsquedas (máximo {MAX_FOTOS}). Puedes tomarla con la cámara o
              elegirla de tu galería; Vela la ajusta sola al formato vertical (4:5).
            </p>

            {error !== '' && (
              <p role="alert" className="text-sm text-vela-amber bg-vela-amber-soft border border-vela-amber/40 rounded-xl px-3 py-2.5 mb-3">
                {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              {fotos.map((f, i) => (
                <div key={f} className="relative aspect-[4/5]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f} alt="" className="w-full h-full object-cover rounded-2xl border border-vela-line" />
                  {i === 0 && (
                    <span className="absolute left-2 bottom-2 text-[10px] font-bold bg-black/60 text-white rounded-full px-2 py-0.5">
                      Principal
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setFotos((prev) => prev.filter((x) => x !== f))}
                    className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-vela-safety text-white text-xs flex items-center justify-center"
                    aria-label="Quitar foto"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {fotos.length < MAX_FOTOS && (
                <div className="aspect-[4/5] rounded-2xl border-2 border-dashed border-vela-line-strong flex flex-col items-center justify-center gap-2 text-vela-text-faint text-xs text-center px-2">
                  <span className="text-2xl">＋</span>
                  <span>{subiendoFoto ? 'Procesando...' : 'Agregar foto'}</span>
                  <BotonesFoto onChange={handleAgregarFoto} disabled={subiendoFoto} facing="user" compacto />
                </div>
              )}
            </div>
          </div>

          <Pie ayuda={!paso3Valido ? `Falta: ${faltanPaso3.join(', ')}.` : ''}>
            <BotonPrincipal disabled={!paso3Valido || subiendoFoto} onClick={() => { setError(''); setPaso(4); }}>
              Continuar
            </BotonPrincipal>
          </Pie>
        </div>
      )}

      {/* ───────── Paso 4: preferencias (solo "ser descubierta") + verificación de identidad ───────── */}
      {paso === 4 && (
        <div className="flex flex-col gap-6">
          {rol === 'proveedor' && (
            <section className="flex flex-col gap-4">
              <h2 className="text-lg font-bold text-vela-text">Tus preferencias</h2>
              <Campo label="¿Qué te gusta que te regalen? (opcional)" value={regalo} onChange={setRegalo} placeholder="Ej. flores, chocolates..." />
              <div>
                <Etiqueta texto="Tu tiempo es para... (opcional)" />
                <div className="flex flex-col gap-3 mt-2">
                  {CATEGORIAS_CHIPS.map((cat) => (
                    <div key={cat.id}>
                      <p className="text-xs text-vela-public font-semibold mb-1.5">{cat.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {cat.chips.map((chip) => (
                          <ChipToggle key={chip} texto={chip} activo={chipsSel.includes(chip)} onClick={() => toggleChip(chip)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-bold text-vela-text">Verifica tu identidad</h2>
              <p className="text-sm text-vela-text-faint mt-1">
                Obligatoria para poder aparecer en Vela. Un administrador la revisa manualmente.
              </p>
              <p className="text-[11px] text-vela-text-faint mt-1.5">
                Formatos permitidos: {FORMATOS_TEXTO}. Puedes usar la cámara o la galería. Asegúrate de que se lea bien y tenga buena luz.
              </p>
            </div>

            <SubidaArchivo
              label="Selfie sosteniendo tu documento"
              requerido
              facing="user"
              url={selfieUrl}
              preview={selfiePreview}
              subiendo={subiendoVerificacion === 'selfie'}
              onChange={(e) => handleSubirVerificacion('selfie', e)}
            />
            <SubidaArchivo
              label="Foto de tu documento de identidad"
              requerido
              facing="environment"
              url={documentoUrl}
              preview={documentoPreview}
              subiendo={subiendoVerificacion === 'documento'}
              onChange={(e) => handleSubirVerificacion('documento', e)}
            />
          </section>

          {error !== '' && <p className="text-sm text-vela-safety">{error}</p>}

          <Pie ayuda={!paso4Valido ? `Falta: ${faltanPaso4.join(', ')}.` : ''}>
            <BotonPrincipal disabled={!paso4Valido || finalizando || subiendoVerificacion !== null} onClick={handleFinalizarRegistro}>
              {finalizando ? 'Guardando...' : 'Finalizar registro'}
            </BotonPrincipal>
          </Pie>
        </div>
      )}
    </main>
  );
}

function ComoFuncionaVela({ rol, onContinuar }: { rol: Rol; onContinuar: () => void }) {
  const esCliente = rol === 'cliente';
  const color = esCliente ? '#3B82F6' : '#D91F3A';
  const colorSoft = esCliente ? 'rgba(59,130,246,0.12)' : 'rgba(217,31,58,0.12)';

  const puntos = esCliente
    ? [
        { icono: '🔍', titulo: 'Explora perfiles verificados', texto: 'Todos pasan por revisión de identidad antes de aparecer — nunca hablas con un perfil falso.' },
        { icono: '💌', titulo: 'Envía una solicitud formal', texto: 'Propones fecha, lugar y tipo de encuentro. La otra persona decide si acepta.' },
        { icono: '💬', titulo: 'Coordina por el chat', texto: 'Números, correos y links quedan bloqueados automáticamente — todo pasa dentro de Vela.' },
        { icono: '🛡️', titulo: 'Encuentro con seguridad activa', texto: 'Cronómetro, botón de pánico y contactos de emergencia notificados si algo se siente mal.' },
      ]
    : [
        { icono: '✅', titulo: 'Verificación obligatoria', texto: 'Tu identidad se confirma antes de que puedas aparecer — nadie te contacta sin saber que eres real.' },
        { icono: '🙅', titulo: 'Tú decides quién te contacta', texto: 'Recibes solicitudes, no mensajes directos. Aceptas o rechazas cada una.' },
        { icono: '🔒', titulo: 'Tu número nunca es visible', texto: 'Toda la comunicación pasa por el chat de Vela, con bloqueo automático de datos de contacto.' },
        { icono: '🛡️', titulo: 'Seguridad activa durante el encuentro', texto: 'Botón de pánico y contactos de emergencia notificados automáticamente si algo se siente mal.' },
      ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-extrabold text-vela-text mb-1">Cómo funciona Vela</h2>
        <p className="text-sm text-vela-text-faint">
          {esCliente ? 'Como alguien que quiere conocer' : 'Como alguien que quiere ser descubierta'}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {puntos.map((p) => (
          <div key={p.titulo} className="flex gap-3 items-start rounded-2xl p-4 border" style={{ backgroundColor: colorSoft, borderColor: color + '55' }}>
            <span className="text-2xl">{p.icono}</span>
            <div>
              <p className="font-bold text-sm text-vela-text mb-0.5">{p.titulo}</p>
              <p className="text-xs text-vela-text-faint leading-relaxed">{p.texto}</p>
            </div>
          </div>
        ))}
      </div>
      <button onClick={onContinuar} className="w-full h-14 rounded-full font-bold text-base text-white mt-2" style={{ backgroundColor: color }}>
        Entendido, continuar
      </button>
    </div>
  );
}

/** Etiqueta de un campo; si es obligatorio muestra un asterisco rojo. */
function Etiqueta({ texto, requerido }: { texto: string; requerido?: boolean }) {
  return (
    <label className="text-xs font-medium text-vela-text-faint">
      {texto}
      {requerido && (
        <span className="text-[#D91F3A] font-bold ml-0.5" aria-hidden="true">*</span>
      )}
    </label>
  );
}

function NotaObligatorio() {
  return (
    <p className="text-[11px] text-vela-text-faint">
      <span className="text-[#D91F3A] font-bold">*</span> Campo obligatorio
    </p>
  );
}

function Campo({ label, value, onChange, type = 'text', placeholder, requerido, max, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; requerido?: boolean;
  max?: string; autoComplete?: string;
}) {
  return (
    <div>
      <Etiqueta texto={label} requerido={requerido} />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        max={max}
        autoComplete={autoComplete}
        className="w-full mt-1.5 bg-vela-surface-2 border border-vela-line rounded-2xl px-4 h-14 text-base text-vela-text outline-none focus:border-vela-public/60"
      />
    </div>
  );
}

function ChipToggle({ texto, activo, onClick }: { texto: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`px-4 py-2.5 rounded-full text-sm font-medium border transition ${
        activo ? 'bg-vela-public-soft border-vela-public text-vela-public' : 'bg-vela-surface-2 border-vela-line text-vela-text-faint'
      }`}
    >
      {texto}
    </button>
  );
}

function ReglaPassword({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium ${
        ok ? 'bg-vela-verified-soft text-vela-verified' : 'bg-vela-amber-soft text-vela-amber'
      }`}
    >
      <span aria-hidden="true">{ok ? '✓' : '○'}</span>
      {texto}
    </span>
  );
}

/** Zona del botón principal: queda fija abajo y, si el botón está apagado, explica qué falta. */
function Pie({ ayuda, children }: { ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-6 px-6 pt-3 pb-4 mt-2 bg-vela-bg/95 backdrop-blur border-t border-vela-line">
      {ayuda ? <p className="text-[11px] text-vela-text-faint text-center mb-2">{ayuda}</p> : null}
      {children}
    </div>
  );
}

/** Botón principal grande, de ancho completo y con flecha. `color` (opcional) tiñe el botón. */
function BotonPrincipal({ disabled, onClick, color, children }: {
  disabled: boolean; onClick: () => void; color?: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={!disabled && color ? { backgroundColor: color } : undefined}
      className={`w-full h-14 rounded-full font-bold text-base flex items-center justify-center gap-2 transition ${
        disabled ? 'bg-vela-surface-2 text-vela-text-faint' : `${color ? '' : 'bg-vela-public '}text-white active:scale-[0.98]`
      }`}
    >
      {children}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/** Tarjeta grande para elegir una opción. Cada perfil tiene su color (azul = conocer, rojo = ser descubierta). */
function TarjetaRol({ icono, titulo, texto, activo, color, onClick }: {
  icono: string; titulo: string; texto: string; activo: boolean; color: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      style={activo ? { borderColor: color, backgroundColor: color + '1F' } : undefined}
      className={`flex items-center gap-4 text-left rounded-3xl p-5 border-2 transition ${
        activo ? '' : 'bg-vela-surface border-vela-line'
      }`}
    >
      <span
        style={activo ? { backgroundColor: color } : undefined}
        className={`w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 ${activo ? '' : 'bg-vela-surface-3'}`}
      >
        {icono}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-bold text-vela-text">{titulo}</span>
        <span className="block text-sm text-vela-text-faint mt-0.5 leading-snug">{texto}</span>
      </span>
      <span
        style={activo ? { borderColor: color } : undefined}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${activo ? '' : 'border-vela-text-faint'}`}
      >
        {activo && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />}
      </span>
    </button>
  );
}

function SubidaArchivo({ label, url, preview, subiendo, onChange, requerido, facing = 'environment' }: {
  label: string; url: string | null; preview: string | null; subiendo: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; requerido?: boolean;
  facing?: 'user' | 'environment';
}) {
  return (
    <div className="border border-dashed border-vela-line-strong rounded-xl p-4 flex flex-col gap-3 bg-vela-surface">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-vela-text-dim">
          {label}
          {requerido && (
            <span className="text-[#D91F3A] font-bold ml-0.5" aria-hidden="true">*</span>
          )}
        </span>
        <span className="text-xs text-vela-text-faint font-semibold shrink-0">
          {subiendo ? 'Procesando...' : url ? '✓ Listo' : 'Pendiente'}
        </span>
      </div>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={label} className="w-full max-h-56 object-contain rounded-lg border border-vela-line bg-black/20" />
      )}
      <BotonesFoto onChange={onChange} disabled={subiendo} facing={facing} />
    </div>
  );
}

function traducirErrorRegistro(msg?: string): string {
  if (!msg) return 'No se pudo crear la cuenta. Intenta de nuevo.';
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('already exists')) return 'Ya existe una cuenta con ese correo.';
  if (m.includes('rate limit') || m.includes('security purposes')) return 'Demasiados intentos. Espera un momento antes de volver a intentar.';
  if (m.includes('password')) return 'La contraseña no cumple los requisitos mínimos.';
  return msg;
}

function traducirErrorCodigo(msg?: string): string {
  if (!msg) return 'No se pudo verificar el código. Intenta de nuevo.';
  const m = msg.toLowerCase();
  if (m.includes('rate limit') || m.includes('security purposes')) return 'Demasiados intentos. Espera un momento antes de volver a intentar.';
  if (m.includes('expired') || m.includes('invalid')) return 'Código incorrecto o expirado. Solicita uno nuevo.';
  return msg;
}