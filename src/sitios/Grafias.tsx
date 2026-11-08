/**
 * «Outras grafias» na página do sítio (Parte 2C, bloco 2, Tarefa 13; telas aprovadas §4): as grafias de `grafiasDoSitio`
 * (src/sitios/resolucao.ts) agrupadas por tradição, na ordem da lista das tradições, depois «sem tradição» (as dos livros que
 * ainda não têm uma) e, por último, «sem origem» (as suas sem tradição). Cada grafia com a sigla e a página, se veio de um livro
 * («Tall et-Test TESTE, p. 12»), ou com «SKC» e o livro que você deu («Testheim SKC TESTE II»).
 */
import '../imagens-usuario/MarcaSkc.css'
import { chaveDaGrafia, GRUPO_DA_TRADICAO, TRADICOES } from './modelo'
import type { GrafiaVista, GrupoDaGrafia, LivroDaGrafia } from './resolucao'
import './Sitios.css'

const ORDEM: readonly GrupoDaGrafia[] = [...TRADICOES, 'sem-tradicao', 'sem-origem']
const ROTULO: Record<GrupoDaGrafia, string> = { ...GRUPO_DA_TRADICAO, 'sem-tradicao': 'sem tradição', 'sem-origem': 'sem origem' }

/** Os grupos que têm grafias, na ordem da página; dentro de cada um, a ordem de `grafiasDoSitio`. */
export function gruposDasGrafias(grafias: readonly GrafiaVista[]): { grupo: GrupoDaGrafia; rotulo: string; grafias: GrafiaVista[] }[] {
  return ORDEM.map((grupo) => ({ grupo, rotulo: ROTULO[grupo], grafias: grafias.filter((g) => g.grupo === grupo) })).filter((g) => g.grafias.length > 0)
}

/** «TESTE, p. 12»; sem página, «TESTE»; vários livros, separados por «;». */
export const textoDosLivros = (livros: readonly LivroDaGrafia[]): string => livros.map((l) => (l.pagina ? `${l.sigla}, p. ${l.pagina}` : l.sigla)).join('; ')

/**
 * O nome impresso de um sítio do livro está entre as grafias MOSTRADAS, como grafia do livro (pacote 8: com a página)? Então o
 * «como impresso: …» sob o nome sai. Num pacote 5–7 fica; e também quando o impresso só difere do nome de agora pelos
 * diacríticos (a grafia com a chave do nome de agora não é mostrada, e o impresso sumiria da página).
 */
export const nomeImpressoNasGrafias = (grafias: readonly GrafiaVista[], literal: string): boolean =>
  grafias.some((g) => !g.doUsuario && chaveDaGrafia(g.texto) === chaveDaGrafia(literal))

export function GrafiasAgrupadas({ grafias }: { grafias: readonly GrafiaVista[] }) {
  return (
    <div className="sitio-tradicoes">
      {gruposDasGrafias(grafias).map((g) => (
        <div key={g.grupo} role="group" aria-label={g.rotulo} className="sitio-tradicao">
          <span className="sitio-tradicao-rotulo" aria-hidden="true">
            {g.rotulo}
          </span>
          <ul className="sitio-grafias">
            {g.grafias.map((x) => (
              <li key={x.texto} className="sitio-grafia sitio-grafia-lida">
                {x.texto}
                {x.doUsuario && <span className="marca-skc">SKC</span>}
                {x.livros.length > 0 && <span className="sitio-grafia-livro">{textoDosLivros(x.livros)}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
