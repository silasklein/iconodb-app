import { useId, useState } from 'react'
import { usePosicao } from './doUsuario'
import { POSICOES, ROTULO_DA_POSICAO, type Posicao } from './modelo'
import { escolherPosicao } from './operacoes'
import { Segmentos } from './Segmentos'
import { TextoEditavel } from './TextoEditavel'
import './Hipoteses.css'

const OPCOES = POSICOES.map((p) => ({ valor: p, rotulo: ROTULO_DA_POSICAO[p] }))

/**
 * "Sua posição" sobre uma hipótese dos livros (spec §4, camada 3): concordo, discordo ou em aberto, com justificativa
 * opcional (lida limpa, editada com `[[`; decisão 37). No painel da hipótese, depois dos dados. A primeira escolha cria o
 * registro `posicao` (reg = o id da hipótese); "Tirar a posição" grava null.
 */
export function PosicaoNaHipotese({ hipotese }: { hipotese: string }) {
  const p = usePosicao(hipotese)
  const [falhou, setFalhou] = useState(false)
  const idRotulo = useId()
  const escolher = (v: Posicao | null) => {
    setFalhou(false)
    escolherPosicao(hipotese, v).catch(() => setFalhou(true))
  }
  return (
    <section className="posicao" aria-labelledby={idRotulo}>
      <h3 id={idRotulo} className="posicao-titulo">
        Sua posição <span className="marca-skc">SKC</span>
      </h3>
      <Segmentos rotulo="Sua posição" opcoes={OPCOES} valor={p?.posicao ?? null} aoEscolher={escolher} />
      {falhou && (
        <p className="hipoteses-erro" role="alert">
          Não foi possível guardar a posição; tente de novo.
        </p>
      )}
      {p && (
        <TextoEditavel tipo="posicao" reg={hipotese} campo="justificativa" valor={p.justificativa} rotulo="Justificativa da posição" oQue="a justificativa" vazio="Justificativa opcional." />
      )}
      {p?.posicao && (
        <button type="button" className="texto-editavel-botao posicao-tirar" onClick={() => escolher(null)}>
          Tirar a posição
        </button>
      )}
    </section>
  )
}
