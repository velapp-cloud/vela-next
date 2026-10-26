/**
 * lib/emergencia/alarma.ts
 * Alarma sonora en bucle (sirena + vibración) para las alertas automáticas de
 * Gold y VIP. Suena mientras la app esté abierta; se detiene con detener().
 */
export type Alarma = {
  /** Reintenta activar el audio (los navegadores lo bloquean hasta que hay un toque). */
  desbloquear: () => void;
  detener: () => void;
};

export function iniciarAlarma(): Alarma {
  let ctx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let timerTono: ReturnType<typeof setInterval> | null = null;

  try {
    const AC: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      const c = new AC();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'square';
      o.frequency.value = 640;
      g.gain.value = 0.35;
      o.connect(g);
      g.connect(c.destination);
      o.start();
      let alto = false;
      timerTono = setInterval(() => {
        alto = !alto;
        o.frequency.setValueAtTime(alto ? 960 : 640, c.currentTime);
      }, 450);
      c.resume().catch(() => {});
      ctx = c;
      osc = o;
    }
  } catch {
    // Sin audio disponible: queda solo la vibración y la pantalla.
  }

  const vibrar = () => {
    try {
      navigator.vibrate?.([400, 200, 400]);
    } catch {
      // vibración no soportada
    }
  };
  vibrar();
  const timerVib = setInterval(vibrar, 1500);

  return {
    desbloquear: () => {
      ctx?.resume().catch(() => {});
    },
    detener: () => {
      if (timerTono) clearInterval(timerTono);
      clearInterval(timerVib);
      try { osc?.stop(); } catch { /* ya detenido */ }
      try { ctx?.close(); } catch { /* ya cerrado */ }
      try { navigator.vibrate?.(0); } catch { /* sin vibración */ }
    },
  };
}