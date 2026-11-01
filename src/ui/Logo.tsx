/**
 * Logo SKC na grade 19 x 11 (docs/design/logo/skc-grade-19x11.svg).
 * Só escalas inteiras, para cada quadrado cair em pixel inteiro (decisão 21):
 * nunca width:auto nem escala fracionária.
 */
export type LogoScale = 1 | 2 | 3 | 4
export type LogoTone = 'light' | 'dark' | 'atual'

interface LogoProps {
  scale: LogoScale
  /** "light": logo escuro sobre fundo claro. "dark": logo claro sobre fundo escuro. "atual": a cor do tema da tela (barra superior). */
  tone: LogoTone
}

const LARGURA = 19
const ALTURA = 11

export function Logo({ scale, tone }: LogoProps) {
  return (
    <svg
      role="img"
      aria-label="Logo SKC"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      width={LARGURA * scale}
      height={ALTURA * scale}
      shapeRendering="crispEdges"
      fill="currentColor"
      style={{
        display: 'block',
        flexShrink: 0,
        color: tone === 'light' ? 'var(--texto-consulta)' : tone === 'dark' ? 'var(--texto-item)' : 'var(--texto)',
      }}
    >
      <rect x="0" y="0" width="7" height="3" />
      <rect x="3" y="4" width="4" height="3" />
      <rect x="0" y="8" width="7" height="3" />
      <rect x="8" y="0" width="3" height="11" />
      <rect x="12" y="0" width="7" height="3" />
      <rect x="12" y="4" width="4" height="3" />
      <rect x="12" y="8" width="7" height="3" />
    </svg>
  )
}
