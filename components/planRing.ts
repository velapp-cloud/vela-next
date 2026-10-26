/**
 * components/planRing.ts
 * Mismos colores de anillo que usabamos en Expo (PersonHeaderCard.tsx
 * -> PLAN_RING): Basico -> morado | Premium -> gris | Gold -> dorado | VIP -> negro
 */
export const PLAN_RING: Record<'basico' | 'premium' | 'gold' | 'vip', { color: string; glow: string }> = {
  basico: { color: '#8B5CF6', glow: 'rgba(139,92,246,0.55)' },
  premium: { color: '#D4D4D8', glow: 'rgba(212,212,216,0.6)' },
  gold: { color: '#FFD700', glow: 'rgba(255,215,0,0.6)' },
  vip: { color: '#000000', glow: 'rgba(255,255,255,0.35)' },
};