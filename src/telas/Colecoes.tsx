import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { grupos, type Grupo } from '../banco/consultas'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { Miniatura } from '../ui/Miniatura'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { numeroPtBr } from '../ui/usePendencias'
import { chaveDaObra, rotuloDaObra } from './obras'
import './Colecoes.css'

export const MSG_SKC_VAZIA = 'Crie coleções na próxima versão'
const SEM_PERIODO = 'Sem período'

interface Obra {
  chave: string
  rotulo: string
  grupos: Grupo[]
}

/** As obras do pacote (uma aba cada), na ordem em que os grupos vêm. */
function obrasDosGrupos(todos: Grupo[]): Obra[] {
  const obras = new Map<string, Obra>()
  for (const g of todos) {
    const chave = chaveDaObra(g.publicacao, g.volume)
    const obra = obras.get(chave) ?? { chave, rotulo: rotuloDaObra(g.publicacao, g.volume), grupos: [] }
    obra.grupos.push(g)
    obras.set(chave, obra)
  }
  return [...obras.values()]
}

/** Os grupos da obra por período, na ordem do livro. */
function porPeriodo(lista: Grupo[]): { periodo: string; grupos: Grupo[] }[] {
  const secoes = new Map<string, Grupo[]>()
  for (const g of lista) {
    const periodo = g.periodo ?? SEM_PERIODO
    secoes.set(periodo, [...(secoes.get(periodo) ?? []), g])
  }
  return [...secoes].map(([periodo, grupos]) => ({ periodo, grupos }))
}

const plural = (n: number, um: string, varios: string) => `${numeroPtBr(n)} ${n === 1 ? um : varios}`

/**
 * Coleções (Colecoes.dc.html e Grupos.dc.html no celular, PC-Grupos.dc.html no computador).
 * A aba SKC vem primeiro: são as coleções do usuário (a 2B as cria); depois, uma aba por obra do
 * pacote, com os grupos da autora por período. A aba escolhida fica no endereço (?obra=…).
 */
export function Colecoes() {
  const [params] = useSearchParams()
  const computador = useBreakpoint() === 'computador'
  const carga = useCarregar(() => grupos())
  const obras = useMemo(() => (carga.fase === 'ok' ? obrasDosGrupos(carga.dados) : []), [carga])
  const aba = obras.find((o) => o.chave === params.get('obra')) ?? null

  return (
    <div className="colecoes">
      <TopoDoCelular voltar={{ href: '#/' }} />

      <div className="colecoes-cabecalho">
        <h1>Coleções</h1>
        <span className="colecoes-apoio">
          {computador ? 'As suas coleções e os grupos de cada obra, na ordem da autora' : aba ? 'Por obra, com os grupos da autora na ordem dela' : 'Por obra; em SKC, as minhas coleções'}
        </span>
      </div>

      <nav aria-label="Obras" className="colecoes-abas">
        <Link className="hit" to="/colecoes" replace aria-current={aba === null ? 'page' : undefined}>
          SKC
        </Link>
        {obras.map((o) => (
          <Link key={o.chave} className="hit" to={`/colecoes?obra=${encodeURIComponent(o.chave)}`} replace aria-current={aba?.chave === o.chave ? 'page' : undefined}>
            {o.rotulo}
          </Link>
        ))}
      </nav>

      {carga.fase === 'erro' && <AvisoDeErro erro={carga.erro} />}

      {aba === null ? (
        carga.fase !== 'erro' && (
          <section className="colecoes-corpo" aria-label="Minhas coleções">
            <div className="colecoes-secao-titulo">
              <h2>Minhas coleções</h2>
              <span className="codigo">SKC</span>
            </div>
            <p className="colecoes-vazio">{MSG_SKC_VAZIA}</p>
          </section>
        )
      ) : (
        <section className="colecoes-corpo" aria-label={`Grupos de ${aba.rotulo}`}>
          {computador && (
            <div className="colecoes-resumo">
              <span>{aba.rotulo} · Grupos da autora</span>
              <span className="codigo">
                {plural(aba.grupos.length, 'grupo', 'grupos')} · {plural(aba.grupos.reduce((s, g) => s + g.objetos, 0), 'objeto', 'objetos')}
              </span>
            </div>
          )}
          <div className="colecoes-periodos">
            {porPeriodo(aba.grupos).map((p) => (
              <section key={p.periodo} className="colecoes-periodo">
                <div className="colecoes-secao-titulo">
                  <h2>{p.periodo}</h2>
                </div>
                {p.grupos.map((g) => (
                  <Link key={g.id} className="colecoes-grupo" to={`/grupo/${encodeURIComponent(g.id)}`}>
                    {computador && (
                      <span className="colecoes-miniatura">
                        <Miniatura caminho={g.capa?.miniatura ?? null} alt="" />
                      </span>
                    )}
                    <span className="colecoes-grupo-texto">
                      <span className="colecoes-grupo-nome">{g.titulo}</span>
                      <span className="colecoes-grupo-n codigo">
                        {numeroPtBr(g.objetos)}
                        {computador && <span className="colecoes-unidade"> {g.objetos === 1 ? 'objeto' : 'objetos'}</span>}
                      </span>
                    </span>
                  </Link>
                ))}
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
