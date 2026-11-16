import { useEffect, useId, useRef, useState } from 'react'
import type { Hipotese, Nivel } from '../banco/tipos'
import { ROTULO_DO_NIVEL } from '../item/rotulos'
import { OPCOES_DE_NIVEL } from './ConteudoSkc'
import { escolherNivel, nivelDaHipoteseDoLivro, useNiveisDaCamada, voltarAoNivelAutomatico } from './niveis'
import { Segmentos } from './Segmentos'
import './Hipoteses.css'

/**
 * O nível de uma hipótese dos livros, que a pessoa pode rever (Parte 2C, bloco 3, Tarefa 13; canvas «Bloco 3», Nivel.dc.html).
 * Só o nível muda: o trecho, o termo e a certeza continuam os do livro. O seletor é o das hipóteses SKC; com o nível revisto,
 * a nota «Nível revisto por você · o automático era <nível>» e «Voltar ao nível automático». No painel da hipótese, antes de
 * «Sua posição».
 */
export function NivelDaHipotese({ h }: { h: Pick<Hipotese, 'id' | 'nivel' | 'nivelAutomatico'> }) {
  const niveis = useNiveisDaCamada()
  const { efetivo, automatico, revisto } = nivelDaHipoteseDoLivro(niveis, h)
  const [falhou, setFalhou] = useState(false)
  const idRotulo = useId()
  const idNota = useId()
  const idAjuda = useId()
  const secao = useRef<HTMLElement>(null)
  // «Voltar» some com a nota: o foco vai para o nível escolhido no seletor, e não se perde.
  const voltando = useRef(false)
  const gravar = (p: Promise<unknown>) => {
    setFalhou(false)
    p.catch(() => {
      voltando.current = false
      setFalhou(true)
    })
  }
  useEffect(() => {
    if (revisto || !voltando.current) return
    voltando.current = false
    secao.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus()
  }, [revisto])
  return (
    <section ref={secao} className="nivel-revisto" aria-labelledby={idRotulo}>
      <h3 id={idRotulo} className="posicao-titulo">
        Nível
      </h3>
      <Segmentos
        rotulo="Nível"
        rotuloId={idRotulo}
        descricaoId={`${idNota} ${idAjuda}`}
        opcoes={OPCOES_DE_NIVEL}
        valor={efetivo}
        aoEscolher={(n: Nivel) => gravar(escolherNivel(h, n))}
      />
      {/* A nota fica sempre montada (região viva): o leitor de tela anuncia quando o texto entra, depois de um toque ou de uma seta. */}
      <p id={idNota} className="nivel-revisto-nota" role="status">
        {revisto && (
          <>
            Nível revisto por você · o automático era <b>{ROTULO_DO_NIVEL[automatico].toLowerCase()}</b>.
          </>
        )}
      </p>
      {revisto && (
        <>
          <button
            type="button"
            className="nivel-revisto-voltar"
            onClick={() => {
              voltando.current = true
              gravar(voltarAoNivelAutomatico(h))
            }}
          >
            Voltar ao nível automático
          </button>
        </>
      )}
      {falhou && (
        <p className="hipoteses-erro" role="alert">
          Não foi possível guardar o nível; tente de novo.
        </p>
      )}
      <p id={idAjuda} className="nivel-revisto-ajuda">
        Só o nível muda: o trecho, o termo e a certeza continuam os do livro. O seu nível vale no marcador do texto, nos filtros e nas contagens, e vai para os
        dados no próximo pacote.
      </p>
    </section>
  )
}
