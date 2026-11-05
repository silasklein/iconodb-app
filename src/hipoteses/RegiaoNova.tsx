import { useEffect, useId, useRef, useState } from 'react'
import type { PontoRelativo } from '../imagem/desenhar'
import { useAtalhos } from '../app/useAtalhos'
import { Icon } from '../ui/Icon'
import type { ElementoParaEscolher } from './NovaHipotese'
import { salvarRegiao } from './operacoes'
import '../imagem/Desenho.css'

interface Props {
  objeto: string
  imagem: string
  pontos: readonly PontoRelativo[]
  /** Os elementos do objeto (do livro e SKC): a região pode ser mais uma de um deles, e "Pertence a". */
  elementos: readonly ElementoParaEscolher[]
  /** Um elemento do livro a que a região se destina (a Revisão, «Regiões a desenhar»): já vem escolhido em «Ou é mais uma região de». */
  elementoInicial?: string | null
  /**
   * Depois de gravar: `destino` diz o que fazer com a hipótese. "so-a-regiao": "Salvar a região". "nova": "Salvar e
   * registrar hipótese" (uma hipótese nova sobre a região). "em-preparo": a região entra na hipótese em preparo.
   */
  aoSalva: (r: { id: string; elementoId: string; rotulo: string }, destino: DestinoDaRegiao) => void
  aoDescartar: () => void
  /**
   * A hipótese em preparo neste objeto, lida na hora do clique (revisão 3, M5): perguntar antes de trocá-la. `substitui`
   * é o "Sobre" que ela já tem e que a região tomaria (revisão 4, m4), ou null (o objeto inteiro).
   */
  emPreparo?: () => { substitui: string | null } | null
}

export type DestinoDaRegiao = 'so-a-regiao' | 'nova' | 'em-preparo'

/**
 * O fim da marcação de uma região fora da nova hipótese (PC-Imagem.dc.html: "Nomear o elemento da região nova",
 * "Pertence a", "Concluir e registrar hipótese"): a região vira um elemento novo (com nome) ou mais uma região de um
 * elemento que já existe. "Salvar a região" grava; "Salvar e registrar hipótese" grava e abre a nova hipótese sobre ela.
 * Com uma hipótese em preparo no objeto, pergunta antes ("Pôr a região nela" / "Começar outra" / "Voltar"; M5).
 */
export function RegiaoNova({ objeto, imagem, pontos, elementos, elementoInicial = null, aoSalva, aoDescartar, emPreparo }: Props) {
  const [nome, setNome] = useState('')
  /** A pergunta à vista, com o "Sobre" que a região substituiria. */
  const [pergunta, setPergunta] = useState<{ substitui: string | null } | null>(null)
  const perguntando = pergunta !== null
  const forma = useRef<HTMLFormElement>(null)
  const salvarEHipotese = useRef<HTMLButtonElement>(null)
  // "Voltar" (ou Esc) fecha a pergunta e devolve o foco ao botão que a abriu; o desenho e o nome ficam (revisão 4, I1, m3).
  const devolverFoco = useRef(false)
  useEffect(() => {
    if (perguntando || !devolverFoco.current) return
    devolverFoco.current = false
    salvarEHipotese.current?.focus()
  }, [perguntando])
  const voltar = () => {
    devolverFoco.current = true
    setPergunta(null)
  }
  // Esc na pergunta é "Voltar": nunca o Esc do visualizador, que descartaria a região desenhada (revisão 4, I1).
  useAtalhos({ Escape: () => voltar() }, 'visualizador', { ativo: perguntando, raiz: () => forma.current })
  const [existente, setExistente] = useState(() => (elementoInicial && elementos.some((e) => e.id === elementoInicial) ? elementoInicial : ''))
  // O elemento vindo da Revisão (T17-B-20): se a lista de elementos só chega depois de o formulário abrir, entra quando chegar,
  // a menos que a pessoa já tenha escolhido à mão.
  const escolheuAMao = useRef(false)
  useEffect(() => {
    if (!escolheuAMao.current && elementoInicial && elementos.some((e) => e.id === elementoInicial)) setExistente(elementoInicial)
  }, [elementos, elementoInicial])
  const [pai, setPai] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const salvando = useRef(false)
  const campo = useRef<HTMLInputElement>(null)
  const id = useId()
  const botaoSalvar = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    // Com o elemento já escolhido (vindo da Revisão) o nome está travado: o foco vai a «Salvar a região».
    if (campo.current?.disabled) botaoSalvar.current?.focus()
    else campo.current?.focus()
  }, [])

  const salvar = async (destino: DestinoDaRegiao) => {
    if (salvando.current) return
    const doElemento = elementos.find((e) => e.id === existente) ?? null
    if (!doElemento && nome.trim() === '') {
      setErro('Dê um nome ao elemento novo, ou escolha de que elemento esta região é.')
      campo.current?.focus()
      return
    }
    // Uma hipótese em preparo neste objeto não é trocada sem perguntar (revisão 3, M5): nada é gravado antes da escolha.
    if (destino === 'nova' && !perguntando) {
      const atual = emPreparo?.() ?? null
      if (atual) {
        setPergunta(atual)
        return
      }
    }
    setPergunta(null)
    salvando.current = true
    try {
      const rotulo = doElemento ? doElemento.rotulo : nome.trim()
      const rid = await salvarRegiao({ imagem, objeto, pontos, elemento: rotulo, elementoId: doElemento?.id ?? null, pai: doElemento ? null : pai || null })
      aoSalva({ id: rid, elementoId: doElemento?.id ?? rid, rotulo }, destino)
    } catch {
      salvando.current = false
      setErro('Não foi possível guardar a região neste aparelho; tente de novo.')
    }
  }

  return (
    <form
      ref={forma}
      className="regiao-nova"
      aria-label="Região nova"
      onSubmit={(e) => {
        e.preventDefault()
        void salvar('so-a-regiao')
      }}
    >
      <div className="regiao-nova-campo">
        <label htmlFor={`${id}-nome`}>Nomear o elemento da região nova</label>
        <input
          ref={campo}
          id={`${id}-nome`}
          type="text"
          placeholder="ex.: focinho"
          value={nome}
          disabled={existente !== ''}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-erro` : undefined}
          onChange={(e) => {
            setNome(e.target.value)
            setErro(null)
          }}
        />
      </div>
      {elementos.length > 0 && (
        <>
          <div className="regiao-nova-campo">
            <label htmlFor={`${id}-existente`}>Ou é mais uma região de</label>
            <select
              id={`${id}-existente`}
              value={existente}
              onChange={(e) => {
                escolheuAMao.current = true
                setExistente(e.target.value)
                setErro(null)
              }}
            >
              <option value="">nenhum (elemento novo)</option>
              {elementos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.rotulo}
                </option>
              ))}
            </select>
          </div>
          {existente === '' && (
            <div className="regiao-nova-campo">
              <label htmlFor={`${id}-pai`}>Pertence a</label>
              <select id={`${id}-pai`} value={pai} onChange={(e) => setPai(e.target.value)}>
                <option value="">nenhum (elemento solto)</option>
                {elementos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.rotulo}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
      {erro && (
        <p className="regiao-nova-erro" role="alert" id={`${id}-erro`}>
          {erro}
        </p>
      )}
      {perguntando ? (
        <div className="regiao-nova-pergunta" role="group" aria-label="Já há uma hipótese em preparo neste objeto">
          <p>
            {`Já há uma hipótese em preparo neste objeto. Pôr esta região nela${pergunta.substitui ? ` (no lugar de «${pergunta.substitui}»)` : ''}, ou começar outra (a em preparo se perde)?`}
          </p>
          <div className="regiao-nova-acoes">
            <button type="button" className="regiao-nova-botao regiao-nova-botao-forte" autoFocus onClick={() => void salvar('em-preparo')}>
              Pôr a região nela
            </button>
            <button type="button" className="regiao-nova-botao" onClick={() => void salvar('nova')}>
              Começar outra
            </button>
            <button type="button" className="regiao-nova-botao" onClick={voltar}>
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <div className="regiao-nova-acoes">
          <button ref={botaoSalvar} type="submit" className="regiao-nova-botao">
            Salvar a região
          </button>
          <button ref={salvarEHipotese} type="button" className="regiao-nova-botao regiao-nova-botao-forte" onClick={() => void salvar('nova')}>
            <Icon name="confirmar" size={18} />
            Salvar e registrar hipótese
          </button>
          <button type="button" className="regiao-nova-botao" onClick={aoDescartar}>
            Descartar
          </button>
        </div>
      )}
    </form>
  )
}
