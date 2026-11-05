import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react'
import { useSugestoes } from '../busca/useSugestoes'
import type { Sugestao } from '../busca/sugestoes'
import { idDaOpcao, ListaDeSugestoes, manterFoco, opcoesDasSugestoes, resumoDasSugestoes, type Opcao } from '../ui/ListaDeSugestoes'
import { montarLink } from './links'
import type { Rascunho } from './rascunho'

/** O que o campo precisa de quem guarda o texto: a nota (Rascunho) ou um campo de registro (a leitura SKC, Tarefa 9). */
export type FonteDoCampo = Pick<Rascunho, 'texto' | 'mudar' | 'descarregar'>
import './Notas.css'

export interface ManejoDoCampo {
  /** Põe `[[` no cursor (ou onde o texto selecionado está), foca o campo e prepara as sugestões. */
  inserirLink(): void
  focar(): void
}

interface Props {
  /** O id do textarea (o rótulo aponta para ele com `for`). */
  id: string
  rascunho: FonteDoCampo
  /** O que a pessoa digitou ao salvar com Ctrl/⌘+Enter. */
  aoSalvar?: () => void
  /** Esc com a lista fechada: fechar o editor, guardando o rascunho. */
  aoFechar?: () => void
  autoFoco?: boolean
  /** Chamado a cada mudança do texto (a tela tira o erro "escreva a nota"). */
  aoDigitar?: () => void
  /** Ids (separados por espaço) de quem descreve o campo: a ajuda e o erro. */
  descritoPor?: string
  invalido?: boolean
  /** Letras maiores, para a tela de uma nota só. */
  grande?: boolean
  /** O campo perdeu o foco (já gravou o rascunho): quem manda decide se volta à leitura. */
  aoPerderFoco?: (e: FocusEvent<HTMLTextAreaElement>) => void
}

/**
 * O `[[` aberto antes do cursor: onde começa e o que já foi digitado depois dele. Com o cursor DENTRO de um link já escrito
 * (o texto depois dele segue até um `]]` sem outro `[[` no caminho) não há gatilho: é a edição de um link, não um link novo.
 */
export function gatilhoDeLink(texto: string, cursor: number): { inicio: number; consulta: string } | null {
  const m = /\[\[([^[\]|\n\r]{0,60})$/.exec(texto.slice(0, cursor))
  if (!m) return null
  if (/^[^[\]\n\r]*\]\]/.test(texto.slice(cursor))) return null
  return { inicio: m.index, consulta: m[1]! }
}

/** O que vai entre `|` e `]]`: o número do objeto não precisa de rótulo (ele mesmo é o rótulo). */
const rotuloDeInsercao = (s: Sugestao): string => (s.alvoTipo === 'objeto' ? '' : s.rotulo)

/**
 * O campo de uma nota: um textarea de verdade (teclado do celular, correção, IME), ligado ao rascunho (cada tecla vai ao
 * IndexedDB, ver rascunho.ts) e com o autocompletar de `[[`: digitar `[[` e duas letras abre as sugestões de verbetes,
 * objetos, obras e sítios (as mesmas da busca, `sugerir`); Enter (ou o toque) troca o `[[…` por `[[ref|rótulo]]`.
 *
 * Teclas: ↓ ↑ escolhem; Enter insere; Esc fecha a lista (e, sem lista, fecha o editor); Ctrl/⌘+Enter salva. Enter e Esc
 * não valem durante uma composição (IME). ARIA: o campo aponta para a lista (`aria-controls`, `aria-activedescendant`).
 * Sair do campo (blur) grava o que falta.
 */
export const CampoDaNota = forwardRef<ManejoDoCampo, Props>(function CampoDaNota({ id, rascunho, aoSalvar, aoFechar, autoFoco = false, aoDigitar, descritoPor, invalido = false, grande = false, aoPerderFoco }, ref) {
  const idDaLista = `${id}-sugestoes`
  const [texto, setTexto] = useState(rascunho.texto)
  const [cursor, setCursor] = useState<number | null>(null)
  const [ativo, setAtivo] = useState(0)
  /** O `[[` que a pessoa fechou com Esc: a lista não reabre por ele. */
  const [fechadoEm, setFechadoEm] = useState<number | null>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const painelDeSugestoes = useRef<HTMLDivElement>(null)
  const cursorPendente = useRef<number | null>(null)

  const gatilho = useMemo(() => (cursor === null ? null : gatilhoDeLink(texto, cursor)), [texto, cursor])
  const aberto = !!gatilho && gatilho.inicio !== fechadoEm
  const consulta = gatilho?.consulta ?? ''
  const { resultado, para } = useSugestoes(consulta, aberto)
  const opcoes = useMemo(() => (resultado ? opcoesDasSugestoes(resultado, false) : []), [resultado])
  /** A lista na tela ainda é de um texto anterior: nada é escolhido nela até a nova chegar. */
  const pendente = aberto && para !== consulta
  const listaVisivel = aberto && resultado !== null && opcoes.length > 0
  // A lista abre abaixo do campo, que num editor no lugar pode estar perto do pé da tela: traz a lista para a vista.
  useLayoutEffect(() => {
    if (listaVisivel) painelDeSugestoes.current?.scrollIntoView?.({ block: 'nearest' })
  }, [listaVisivel])
  const ativoValido = listaVisivel && !pendente && ativo < opcoes.length ? ativo : -1

  // Depois de inserir, o cursor vai para o fim do link.
  useLayoutEffect(() => {
    if (cursorPendente.current === null || !campo.current) return
    campo.current.setSelectionRange(cursorPendente.current, cursorPendente.current)
    cursorPendente.current = null
  })
  useLayoutEffect(() => {
    if (autoFoco && campo.current) {
      campo.current.focus()
      const fim = campo.current.value.length
      campo.current.setSelectionRange(fim, fim)
    }
    // só ao montar
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const aplicar = useCallback(
    (novo: string, novoCursor: number) => {
      setTexto(novo)
      rascunho.mudar(novo)
      setCursor(novoCursor)
      cursorPendente.current = novoCursor
    },
    [rascunho],
  )

  /**
   * Troca `[de, ate)` por `novo` e põe o cursor em `caret`. Pelo `execCommand('insertText')` o navegador faz a edição como
   * se fosse digitada, então Ctrl/⌘+Z desfaz a inserção; sem ele (ou se recusar), o texto é trocado direto.
   */
  const trocar = useCallback(
    (de: number, ate: number, novo: string, caret: number) => {
      const el = campo.current
      if (!el) return
      el.focus()
      el.setSelectionRange(de, ate)
      if (typeof document.execCommand === 'function' && document.execCommand('insertText', false, novo)) {
        // O navegador disparou `input`: `mudou` já guardou o texto e o rascunho. Falta só o cursor.
        el.setSelectionRange(caret, caret)
        setCursor(caret)
        return
      }
      aplicar(`${el.value.slice(0, de)}${novo}${el.value.slice(ate)}`, caret)
    },
    [aplicar],
  )

  useImperativeHandle(
    ref,
    () => ({
      focar: () => campo.current?.focus(),
      inserirLink: () => {
        const el = campo.current
        if (!el) return
        const de = el.selectionStart
        const ate = el.selectionEnd
        // O `[[` entra ANTES do texto selecionado, que fica (é a busca do link); o cursor vai para o fim dele.
        trocar(de, de, '[[', ate + 2)
        setFechadoEm(null)
        setAtivo(0)
      },
    }),
    [trocar],
  )

  const mudou = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setTexto(e.target.value)
    rascunho.mudar(e.target.value)
    setCursor(e.target.selectionStart)
    setAtivo(0)
    aoDigitar?.()
  }

  const inserir = (s: Sugestao) => {
    if (!gatilho || cursor === null) return
    const link = montarLink(s.ref, rotuloDeInsercao(s))
    trocar(gatilho.inicio, cursor, link, gatilho.inicio + link.length)
    setAtivo(0)
  }

  const escolher = (o: Opcao) => {
    if (o.tipo === 'sugestao') inserir(o.sugestao)
  }

  const teclar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Composição (IME): Enter e Esc são do método de entrada.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      aoSalvar?.()
      return
    }
    if (aberto && (listaVisivel || pendente)) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!pendente && opcoes.length > 0) setAtivo((a) => (e.key === 'ArrowDown' ? (a + 1) % opcoes.length : (a - 1 + opcoes.length) % opcoes.length))
        return
      }
      // Enter só é consumido quando há uma opção para escolher; sem ela (a lista ainda a caminho) é uma quebra de linha.
      const o = e.key === 'Enter' ? opcoes[ativoValido] : undefined
      if (o) {
        e.preventDefault()
        escolher(o)
        return
      }
    }
    if (e.key === 'Escape') {
      if (aberto) {
        // Fecha só a lista; este `[[` não a reabre.
        e.preventDefault()
        e.stopPropagation()
        setFechadoEm(gatilho!.inicio)
        return
      }
      e.preventDefault()
      void rascunho.descarregar().catch(() => undefined)
      aoFechar?.()
    }
  }

  const sair = (e: FocusEvent<HTMLTextAreaElement>) => {
    setCursor(null)
    void rascunho.descarregar().catch(() => undefined)
    aoPerderFoco?.(e)
  }

  return (
    <div className="campo-nota">
      <textarea
        ref={campo}
        id={id}
        data-campo-da-nota=""
        className={`campo-nota-texto${grande ? ' campo-nota-grande' : ''}`}
        value={texto}
        lang="pt-BR"
        spellCheck
        aria-autocomplete="list"
        aria-controls={listaVisivel ? idDaLista : undefined}
        aria-expanded={listaVisivel}
        aria-activedescendant={ativoValido >= 0 ? idDaOpcao(idDaLista, ativoValido) : undefined}
        aria-invalid={invalido || undefined}
        aria-describedby={descritoPor}
        onChange={mudou}
        onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
        onKeyDown={teclar}
        onBlur={sair}
      />
      {listaVisivel && resultado && (
        <div className="sugestoes sugestoes-na-nota" ref={painelDeSugestoes} onMouseDown={manterFoco}>
          <ListaDeSugestoes id={idDaLista} digitado={consulta} sugestoes={resultado} ativo={ativoValido} aoEscolher={escolher} verTodos={false} />
        </div>
      )}
      <span className="so-leitor" role="status">
        {listaVisivel && resultado ? resumoDasSugestoes(resultado) : ''}
      </span>
    </div>
  )
})

