import { useEffect, useId, useRef, useState, useSyncExternalStore, type FocusEvent, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { estadoAtual } from '../usuario/estado'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import type { Ancora } from './ancora'
import { CampoDaNota, type ManejoDoCampo } from './CampoDaNota'
import { LeituraDaNota } from './LeituraDaNota'
import type { NotaVista, TipoDeAlvo } from './indiceDeNotas'
import type { Dependencias } from './rascunho'
import { useRascunho, useSituacaoDoRascunho } from './useRascunho'
import './Notas.css'

interface Props {
  /** A nota que se edita; sem ela, o primeiro texto cria uma nota nova no `alvo`. */
  nota?: NotaVista | null
  /** Onde a nota nova é criada. Sem ele só se edita uma nota que já existe. */
  alvo?: { tipo: TipoDeAlvo; ref: string }
  /** O rótulo visível do campo: "Nota [2] · 01/11/2026". */
  rotulo: string
  ancorar?: () => Promise<Ancora[]>
  /** "Salvar nota" (ou Ctrl/⌘+Enter) deu certo; o id da nota. */
  aoSalvar?: (reg: string) => void
  /** Esc na leitura (o primeiro Esc, no campo, só volta à leitura): fechar o editor; o rascunho já está guardado. */
  aoFechar?: () => void
  /** A nota foi excluída (reversível). */
  aoExcluir?: (reg: string) => void
  /** O id da nota nova foi reservado (a primeira gravação está a caminho): a lista pode parar de mostrá-la. */
  aoCriar?: (reg: string) => void
  autoFoco?: boolean
  /**
   * Abrir lendo (o texto como no quadro, sem o código dos links) em vez de no campo: uma nota que já existe aberta para
   * ver. Uma nota nova abre sempre no campo.
   */
  iniciarLendo?: boolean
  /** O campo grande, sem moldura (a tela da nota, no celular). */
  grande?: boolean
  /** O que fica logo abaixo do rótulo (o lugar da nota: "em CA00023 · Peça de teste"). */
  abaixoDoRotulo?: ReactNode
  /**
   * As ações (inserir link, excluir, salvar) vão para este elemento, por exemplo a barra de cima da tela da nota.
   * `null`: a barra ainda não existe (as ações aparecem quando ela existir); sem a propriedade, ficam sob o campo.
   */
  acoesEm?: HTMLElement | null
  /** Só para os testes: a espera entre gravações (padrão 1 s) e o gravador. */
  espera?: number
  dependencias?: Dependencias
}

/**
 * O editor de nota no lugar (PC-ItemNota.dc.html): rótulo visível, o campo com `[[`, a ajuda de teclas e as ações
 * (inserir link, excluir, Salvar nota). Os erros aparecem ao lado do campo: "Salvar" nunca fica apagado.
 */
export function EditorDeNota({ nota = null, alvo, rotulo, ancorar, aoSalvar, aoFechar, aoExcluir, aoCriar, autoFoco = false, iniciarLendo = false, grande = false, abaixoDoRotulo, acoesEm, espera, dependencias }: Props) {
  const id = useId()
  const raiz = useRef<HTMLDivElement>(null)
  const leitura = useRef<HTMLDivElement>(null)
  // Lendo ou escrevendo. Sair do campo (Esc, outro lugar, Salvar) volta à leitura; o rascunho é gravado como sempre.
  const [lendo, setLendo] = useState(iniciarLendo && !!nota)
  const [entrouNoCampo, setEntrouNoCampo] = useState(false)
  const focarLeitura = useRef(autoFoco && iniciarLendo && !!nota)
  // O lugar da nota que já existe também entra (a rede de segurança precisa dele para guardar uma cópia, se for o caso).
  const lugar = alvo ?? (nota?.alvoTipo && nota.alvo ? { tipo: nota.alvoTipo, ref: nota.alvo } : undefined)
  const rascunho = useRascunho({ reg: nota?.id ?? null, texto: nota?.texto, rascunho: nota?.rascunho, alvo: lugar, baseHlc: nota ? hlcDoTexto(nota.id) : null, ancorar, espera, dependencias })
  const { estado, erro } = useSituacaoDoRascunho(rascunho)
  const campo = useRef<ManejoDoCampo>(null)
  const reservado = useSyncExternalStore(
    (fn) => rascunho.assinar(fn),
    () => rascunho.reg,
  )
  useEffect(() => {
    if (reservado && !nota) aoCriar?.(reservado)
  }, [reservado]) // eslint-disable-line react-hooks/exhaustive-deps
  const [vazia, setVazia] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [salva, setSalva] = useState(false)

  useEffect(() => {
    if (lendo && focarLeitura.current) {
      focarLeitura.current = false
      leitura.current?.focus()
    }
  }, [lendo])
  const editar = () => {
    // A leitura mostrou a nota de agora; o campo parte dela, não do que havia ao abrir (outra aba ou aparelho pode ter mudado).
    if (nota) rascunho.semear(nota.texto, hlcDoTexto(nota.id))
    setEntrouNoCampo(true)
    setLendo(false)
  }
  const voltarALer = () => {
    focarLeitura.current = true
    setLendo(true)
  }
  /** O foco saiu do campo para fora do editor (e a janela continua em foco): volta a ler. Botões do editor não contam. */
  const perdeuFoco = (e: FocusEvent<HTMLTextAreaElement>) => {
    const para = e.relatedTarget as Node | null
    if (para && (raiz.current?.contains(para) || acoesEm?.contains(para))) return
    // Trocar de aba ou de janela também dispara o blur, mas sem destino e com o campo ainda como elemento ativo: continua escrevendo.
    if (!para && document.activeElement === e.currentTarget) return
    setLendo(true)
  }
  /** Clicar nos botões de ação não tira o foco do campo (o campo não pisca nem desmonta antes do clique). */
  const manterFocoNoCampo = (e: MouseEvent) => {
    if (!lendo && (e.target as HTMLElement).closest('button')) e.preventDefault()
  }

  const salvar = async () => {
    if (salvando) return
    setSalvando(true)
    try {
      const reg = await rascunho.salvar()
      if (reg === null) {
        setVazia(true)
        if (lendo) editar()
        else campo.current?.focar()
      } else {
        setVazia(false)
        setSalva(true)
        if (raiz.current?.contains(document.activeElement)) focarLeitura.current = true
        setLendo(true)
        aoSalvar?.(reg)
      }
    } catch {
      // A mensagem da falha já aparece (estado "erro" do rascunho); o texto continua no campo.
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async () => {
    try {
      await rascunho.excluir()
      if (rascunho.reg) aoExcluir?.(rascunho.reg)
    } catch {
      /* idem */
    }
  }

  const acoes = (
    <div className="editor-nota-acoes-grupo" onMouseDown={manterFocoNoCampo}>
      {lendo ? (
        <button type="button" className="nota-editar" onClick={editar}>
          <Icon name="escrever" size={20} />
          Editar
        </button>
      ) : (
        <IconButton icon="vincular" label="Inserir link para objeto, verbete ou obra" onClick={() => campo.current?.inserirLink()} />
      )}
      {(nota || reservado) && <IconButton icon="excluir" label="Excluir nota" onClick={() => void excluir()} />}
      <button type="button" className="nota-botao" aria-keyshortcuts="Control+Enter Meta+Enter" onClick={() => void salvar()}>
        Salvar nota
      </button>
    </div>
  )
  const idDaAjuda = `${id}-ajuda`
  const idDoErro = `${id}-erro`
  const emCurso = estado === 'gravando' || estado === 'pendente'
  // O leitor de tela só ouve o estado assentado (as pausas na digitação), nunca "salvando…" a cada segundo: esse aviso é só visual.
  const assentada = estado !== 'limpo' || !rascunho.reg ? '' : rascunho.rascunho ? 'rascunho salvo' : salva ? 'nota salva' : ''
  return (
    <div className="editor-nota" ref={raiz}>
      <div className="editor-nota-cabeca">
        <label className="editor-nota-rotulo codigo" htmlFor={lendo ? undefined : `${id}-campo`} id={`${id}-rotulo`}>
          {rotulo}
        </label>
        <span className="editor-nota-situacao">
          {emCurso && <span aria-hidden="true">salvando…</span>}
          <span role="status">{assentada}</span>
        </span>
      </div>
      {abaixoDoRotulo}
      {lendo ? (
        <LeituraDaNota ref={leitura} texto={nota && !rascunho.porGravar ? nota.texto : rascunho.texto} rotuloId={`${id}-rotulo`} aoEditar={editar} aoFechar={aoFechar} grande={grande} descritoPor={`${id}-dica-leitura`} />
      ) : (
        <CampoDaNota
          ref={campo}
          id={`${id}-campo`}
          rascunho={rascunho}
          autoFoco={autoFoco || entrouNoCampo}
          aoSalvar={() => void salvar()}
          aoFechar={voltarALer}
          aoPerderFoco={perdeuFoco}
          aoDigitar={() => {
            setVazia(false)
            setSalva(false)
          }}
          grande={grande}
          descritoPor={`${idDaAjuda}${vazia ? ` ${idDoErro}` : ''}`}
          invalido={vazia}
        />
      )}
      {vazia && (
        <p className="editor-nota-erro" id={idDoErro} role="alert">
          Escreva a nota antes de salvar.
        </p>
      )}
      {estado === 'erro' && (
        <p className="editor-nota-erro" role="alert">
          Não foi possível gravar a nota neste aparelho ({erro}). O texto continua na tela e o app tenta de novo; se não passar, copie o texto antes de sair.
        </p>
      )}
      <div className="editor-nota-rodape">
        {lendo ? (
          <span className="editor-nota-ajuda" id={`${id}-dica-leitura`}>
            Toque no texto, ou use <kbd>Enter</kbd> ou <kbd>E</kbd>, para editar · <kbd>Esc</kbd> fecha
          </span>
        ) : (
          <span className="editor-nota-ajuda" id={idDaAjuda}>
            <kbd>[[</kbd> liga a objetos, verbetes, obras e sítios · <kbd>Ctrl/⌘ + Enter</kbd> salva · <kbd>Esc</kbd> volta à leitura e guarda o rascunho
          </span>
        )}
        {acoesEm === undefined && <span className="editor-nota-acoes">{acoes}</span>}
      </div>
      {acoesEm && createPortal(acoes, acoesEm)}
    </div>
  )
}

/** O hlc da escrita que vale agora no `texto` da nota: a base de que o rascunho parte. */
const hlcDoTexto = (reg: string): string | null => estadoAtual().hlcDoCampo('nota', reg, 'texto')
