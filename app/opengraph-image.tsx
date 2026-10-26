import { ImageResponse } from 'next/og';

export const alt = 'Vela — Conexiones verificadas y seguras en El Salvador';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #0D0D0D 0%, #1F1F23 100%)',
          color: '#FAFAFA',
        }}
      >
        <div style={{ fontSize: 190, fontStyle: 'italic', fontWeight: 800, color: '#D91F3A', display: 'flex' }}>
          Vela
        </div>
        <div style={{ fontSize: 46, marginTop: 10, color: '#FAFAFA', display: 'flex' }}>
          Conexiones verificadas y seguras
        </div>
        <div style={{ fontSize: 30, marginTop: 24, color: '#8A8A93', display: 'flex' }}>
          Verificación de identidad · Seguridad en cada encuentro · El Salvador
        </div>
      </div>
    ),
    { ...size },
  );
}