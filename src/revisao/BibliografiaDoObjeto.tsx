/**
 * A seção «Bibliografia» do objeto com as ações das ligações (Parte 2C, bloco 3, Tarefa 11): «Desligar esta citação» (a
 * exceção nula, só esta ocorrência), com um aviso que tem «Desfazer» (volta a obra de antes: a citação ligada pela própria
 * ocorrência, como a sem autor, não tem outra volta), e «Religar» (tira a exceção; a chave volta a ligá-la). Uma gravação que
 * falha avisa (`role="alert"`) e não perde nada; depois de cada ação o foco fica na linha da citação.
 */
import { useEffect, useRef, useState } from 'react'
import { Bibliografia } from '../item/Secoes'
import { estadoAtual, registrarVarios } from '../usuario/estado'
import { fotografia, pedidosDeVoltar, type Antes } from './citacoes'
import { excluirLigacao, ligar } from './ligacoes'
import type { ReferenciaNoObjeto } from './referencias'

const ERRO_AO_GUARDAR = 'Não foi possível guardar; tente de novo. Nada foi perdido.'

export function BibliografiaDoObjeto({ referencias }: { referencias: readonly ReferenciaNoObjeto[] }) {
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; antes: Antes[]; ref: string } | null>(null)
  const raiz = useRef<HTMLDivElement>(null)
  /** A linha (`<sigla>:<id>`) que recebe o foco depois da ação: o botão que ficou nela, senão a citação. */
  const focarEm = useRef<string | null>(null)

  useEffect(() => {
    const ref = focarEm.current
    if (!ref) return
    const li = [...(raiz.current?.querySelectorAll<HTMLElement>('[data-ref]') ?? [])].find((e) => e.dataset.ref === ref)
    const el = li?.querySelector<HTMLElement>('.bibliografia-acao') ?? li?.querySelector<HTMLElement>('.bibliografia-citacao')
    if (!el) return
    el.focus()
    focarEm.current = null
  }, [referencias, aviso])

  const chave = (r: ReferenciaNoObjeto) => `${r.sigla}:${r.id}`
  const desligar = async (ocorrencia: string, r: ReferenciaNoObjeto) => {
    setErro(null)
    const antes = [fotografia(estadoAtual(), ocorrencia)]
    try {
      await ligar(ocorrencia, null)
      setAviso({ texto: `«${r.bruto}»: desligada. Volta à fila da Revisão.`, antes, ref: chave(r) })
      focarEm.current = chave(r)
    } catch {
      setErro(ERRO_AO_GUARDAR)
    }
  }
  const religar = async (excecao: string, r: ReferenciaNoObjeto) => {
    setErro(null)
    try {
      await excluirLigacao(excecao)
      setAviso(null)
      focarEm.current = chave(r)
    } catch {
      setErro(ERRO_AO_GUARDAR)
    }
  }
  const desfazer = async () => {
    if (!aviso) return
    setErro(null)
    try {
      await registrarVarios(pedidosDeVoltar(estadoAtual(), aviso.antes))
      focarEm.current = aviso.ref
      setAviso(null)
    } catch {
      setErro(ERRO_AO_GUARDAR)
    }
  }

  return (
    <div ref={raiz}>
      {erro && (
        <p className="bibliografia-erro" role="alert">
          {erro}
        </p>
      )}
      <Bibliografia referencias={referencias} aoDesligar={(o, r) => void desligar(o, r as ReferenciaNoObjeto)} aoReligar={(x, r) => void religar(x, r as ReferenciaNoObjeto)} />
      <p className="bibliografia-aviso" role="status" aria-live="polite">
        {aviso && (
          <>
            <span>{aviso.texto}</span>
            <button type="button" className="bibliografia-acao" onClick={() => void desfazer()}>
              Desfazer
            </button>
          </>
        )}
      </p>
    </div>
  )
}
