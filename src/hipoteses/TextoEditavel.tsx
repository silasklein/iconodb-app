import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useCliqueParaEditar } from './cliqueParaEditar'
import { CampoDaNota, type FonteDoCampo, type ManejoDoCampo } from '../notas/CampoDaNota'
import { TextoDaNota } from '../notas/TextoDaNota'
import { Icon } from '../ui/Icon'
import { useCampoSalvo } from '../usuario/campoSalvo'
import type { Tipo } from '../usuario/eventos'
import './Hipoteses.css'

interface Props {
  tipo: Tipo
  /** O registro (que já existe: `useCampoSalvo` não cria registros). */
  reg: string
  campo: string
  valor: string
  /** O nome do campo para o leitor de tela e o rótulo do editor ("Justificativa"). */
  rotulo: string
  /** "a justificativa": os botões dizem "Editar a justificativa" / "Escrever a justificativa". */
  oQue: string
  vazio?: string
}

/**
 * Um texto do usuário num registro que já existe (a justificativa de uma hipótese SKC ou de uma posição), com a decisão 37:
 * lê-se limpo (`TextoDaNota`: `[[…]]` sublinhado e as citações da decisão 40); "Editar", Enter/E no bloco ou tocar no
 * texto abrem o campo com o código e o `[[` das notas. O campo grava sozinho (`useCampoSalvo`). O mesmo padrão da
 * leitura SKC (LeituraSkc, Tarefa 9).
 */
export function TextoEditavel({ tipo, reg, campo: nome, valor, rotulo, oQue, vazio }: Props) {
  const campo = useCampoSalvo({ tipo, reg, campo: nome, valor })
  const [editando, setEditando] = useState(false)
  const manejo = useRef<ManejoDoCampo>(null)
  const bloco = useRef<HTMLDivElement>(null)
  const idRotulo = useId()
  const idCampo = useId()
  const ref = useRef(campo)
  ref.current = campo
  const fonte = useMemo<FonteDoCampo>(
    () => ({
      get texto() {
        return ref.current.texto
      },
      mudar: (t: string) => ref.current.setTexto(t),
      descarregar: () => ref.current.gravarAgora(),
    }),
    [],
  )
  const editar = () => {
    setEditando(true)
    campo.aoFocar()
  }
  const sair = () => {
    void campo.aoDesfocar()
    setEditando(false)
    requestAnimationFrame(() => bloco.current?.focus())
  }
  // O duplo clique seleciona uma palavra (para uma hipótese), não abre o editor (revisão 1 da Tarefa 10, I8).
  const clicou = useCliqueParaEditar(editar)
  const teclou = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
      e.preventDefault()
      e.stopPropagation()
      editar()
    }
  }
  const texto = editando ? campo.texto : valor
  if (editando) {
    return (
      <div className="texto-editavel texto-editavel-edicao">
        <label htmlFor={idCampo} className="texto-editavel-rotulo">
          {rotulo}
        </label>
        <CampoDaNota
          ref={manejo}
          id={idCampo}
          rascunho={fonte}
          autoFoco
          aoFechar={sair}
          aoSalvar={sair}
          descritoPor={`${idCampo}-ajuda`}
          aoPerderFoco={(e) => {
            const para = e.relatedTarget as HTMLElement | null
            if (para && e.currentTarget.closest('.texto-editavel')?.contains(para)) return
            if (!para && document.activeElement === e.currentTarget) return
            void campo.aoDesfocar()
            setEditando(false)
          }}
        />
        <span id={`${idCampo}-ajuda`} className="texto-editavel-ajuda">
          Use [[ para ligar a objetos, verbetes e obras. Esc ou «Pronto» voltam à leitura; o texto se grava sozinho.
        </span>
        <span className="texto-editavel-acoes">
          <button type="button" className="texto-editavel-botao" onMouseDown={(e) => e.preventDefault()} onClick={() => manejo.current?.inserirLink()}>
            <Icon name="vincular" size={16} />
            Inserir link
          </button>
          <button type="button" className="texto-editavel-botao" onClick={sair}>
            Pronto
          </button>
        </span>
      </div>
    )
  }
  return (
    <div className="texto-editavel">
      <span id={idRotulo} className="so-leitor">
        {rotulo}
      </span>
      {texto.trim() ? (
        <div ref={bloco} className="texto-editavel-bloco" role="group" tabIndex={0} aria-labelledby={idRotulo} onClick={clicou} onKeyDown={teclou}>
          <TextoDaNota texto={texto} />
        </div>
      ) : (
        vazio && <p className="texto-editavel-vazio">{vazio}</p>
      )}
      <span className="texto-editavel-acoes">
        <button type="button" className="texto-editavel-botao" onClick={editar}>
          <Icon name="escrever" size={16} />
          {texto.trim() ? `Editar ${oQue}` : `Escrever ${oQue}`}
        </button>
      </span>
    </div>
  )
}
