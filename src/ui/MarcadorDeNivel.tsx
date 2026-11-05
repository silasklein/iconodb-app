import type { Nivel } from '../banco/tipos'
import { useBreakpoint } from './useBreakpoint'
import './MarcadorDeNivel.css'

/** O nome acessível do nível (o que o leitor de tela diz no lugar dos quadrados). */
export const TEXTO_DO_NIVEL: Record<Nivel, string> = {
  pre_iconographic: 'nível pré-iconográfico',
  iconographic: 'nível iconográfico',
  iconological: 'nível iconológico',
}

const CHEIOS: Record<Nivel, number> = { pre_iconographic: 1, iconographic: 2, iconological: 3 }

/** linha: 22×6 (cada linha de hipótese); titulo: 25×7 no celular e 30×8 no computador (bloco do nível); painel: 30×8 (cabeçalho do painel e folha). */
export type TamanhoDoMarcador = 'linha' | 'titulo' | 'painel'

interface Props {
  /** Sem nível, nada é desenhado nem dito. */
  nivel: Nivel | null | undefined
  tamanho?: TamanhoDoMarcador
  /** Falso quando o nome do nível já está escrito ao lado (título do bloco, cabeçalho do painel, legenda) ou o contexto já o diz (linhas de um bloco de nível). */
  comTexto?: boolean
}

/**
 * O marcador de profundidade da decisão 35: ■□□ pré-iconográfico, ■■□ iconográfico, ■■■ iconológico. Os quadrados são
 * decorativos; quem lê ouve «nível …». O mesmo componente vale em "Hipóteses por nível", no cabeçalho do painel, na
 * folha do celular e na prévia do texto. A cor vem do contexto (--marcador-cheio, --marcador-vazio).
 */
export function MarcadorDeNivel({ nivel, tamanho = 'linha', comTexto = true }: Props) {
  if (!nivel) return null
  // Só o do título muda com a tela (25×7 / 30×8): os outros não assinam a largura, e há um por hipótese no texto.
  return tamanho === 'titulo' ? <MarcadorDoTitulo nivel={nivel} comTexto={comTexto} /> : <Quadrados nivel={nivel} lado={tamanho === 'painel' ? 8 : 6} tamanho={tamanho} comTexto={comTexto} />
}

function MarcadorDoTitulo({ nivel, comTexto }: { nivel: Nivel; comTexto: boolean }) {
  const computador = useBreakpoint() === 'computador'
  return <Quadrados nivel={nivel} lado={computador ? 8 : 7} tamanho="titulo" comTexto={comTexto} />
}

function Quadrados({ nivel, lado, tamanho, comTexto }: { nivel: Nivel; lado: number; tamanho: TamanhoDoMarcador; comTexto: boolean }) {
  const vao = lado === 8 ? 3 : 2
  const largura = lado * 3 + vao * 2
  const cheios = CHEIOS[nivel]
  return (
    <span className={`marcador-nivel marcador-nivel-${tamanho}`} data-nivel={nivel}>
      <svg aria-hidden="true" width={largura} height={lado} viewBox={`0 0 ${largura} ${lado}`} shapeRendering="crispEdges">
        {[0, 1, 2].map((i) => {
          const x = i * (lado + vao)
          return i < cheios ? (
            <rect key={i} data-cheio="true" className="marcador-cheio" x={x} y={0} width={lado} height={lado} />
          ) : (
            <rect key={i} data-cheio="false" className="marcador-vazio" x={x + 0.5} y={0.5} width={lado - 1} height={lado - 1} />
          )
        })}
      </svg>
      {comTexto && <span className="so-leitor">{TEXTO_DO_NIVEL[nivel]}</span>}
    </span>
  )
}
