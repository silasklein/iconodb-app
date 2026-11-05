import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react'
import { useAtalhos } from '../app/useAtalhos'
import { adicionarRecente, lerRecentes, limparRecentes, removerRecente } from '../busca/recentes'
import { totalDeSugestoes } from '../busca/sugestoes'
import { useSugestoes } from '../busca/useSugestoes'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { useBreakpoint } from '../ui/useBreakpoint'
import {
  ListaDeRecentes,
  ListaDeSugestoes,
  idDaOpcao,
  manterFoco,
  opcoesDasRecentes,
  opcoesDasSugestoes,
  resumoDasSugestoes,
  type Opcao,
} from '../ui/ListaDeSugestoes'
import './CampoDeBusca.css'

interface Props {
  id: string
  valor: string
  aoMudar: (texto: string) => void
  aoEnviar: (texto: string) => void
  /**
   * Liga as sugestões e as buscas recentes (decisão 32): com o campo vazio em foco, as recentes; ao digitar, as
   * sugestões por categoria. Escolher uma sugestão chama `navegar(caminho)` (por exemplo `/verbete/GL-900006`). Sem
   * esta propriedade o campo é um campo de busca simples.
   */
  navegar?: (caminho: string) => void
  /** A tecla "/" (fora de campos de texto) leva o foco a este campo. */
  atalho?: boolean
  placeholder?: string
  /**
   * "pagina" (padrão): o campo das telas de busca e do Início no celular.
   * "inicio": o campo grande do Início no computador, com o rótulo visível e a dica "/".
   * "barra": o campo da barra superior, com o rótulo "Buscar" dentro da caixa e a dica "/".
   */
  variante?: 'pagina' | 'inicio' | 'barra'
}

/**
 * O campo de busca (Busca.dc.html, Main.dc.html): rótulo "Buscar", lupa, campo, limpar.
 * É controlado; quem usa decide o que fazer ao digitar (a Busca atualiza o resultado) e ao
 * enviar (o Início vai para a Busca, com useIrParaBusca).
 *
 * Com `navegar`, é um combobox ARIA (BuscaSugestoes, PC-BuscaSugestoes): o foco fica no campo, a lista é um
 * `listbox` e `aria-activedescendant` aponta para a opção ativa. ↑ ↓ percorrem as opções (e "Ver todos os
 * resultados", a última), Enter abre a ativa (sem opção ativa, vai aos resultados), Shift+Delete tira uma busca
 * recente. Esc fecha a lista; Esc de novo limpa o texto e, com o campo vazio, sai dele (como na 2A). Tocar ou
 * clicar numa opção age na hora; clicar fora fecha. As buscas escolhidas ou enviadas vão para as recentes (8, só
 * neste aparelho).
 */
export function CampoDeBusca({ id, valor, aoMudar, aoEnviar, navegar, atalho = false, placeholder, variante = 'pagina' }: Props) {
  const campo = useRef<HTMLInputElement>(null)
  const raiz = useRef<HTMLFormElement>(null)
  const comSugestoes = navegar !== undefined
  const listaId = `${useId()}-sugestoes`
  const [foco, setFoco] = useState(false)
  /** Esc, uma escolha ou um envio fecharam a lista; digitar ou voltar ao campo a reabre. */
  const [fechada, setFechada] = useState(false)
  const [ativo, setAtivo] = useState(-1)
  const [recentes, setRecentes] = useState<string[]>(() => (navegar ? lerRecentes() : []))

  // "/" (fora de campos de texto) leva o foco ao campo: o registro de atalhos cuida das regras comuns.
  useAtalhos(
    {
      '/': () => {
        campo.current?.focus()
        campo.current?.select()
      },
    },
    'global',
    { ativo: atalho },
  )

  const vazio = valor.trim() === ''
  const sugestoes = useSugestoes(valor, comSugestoes && foco && !vazio)
  const comResultado = sugestoes.resultado !== null && totalDeSugestoes(sugestoes.resultado) > 0
  const disponivel: 'recentes' | 'sugestoes' | null = !comSugestoes || !foco ? null : vazio ? (recentes.length > 0 ? 'recentes' : null) : comResultado ? 'sugestoes' : null
  const modo = fechada ? null : disponivel

  const opcoes = useMemo<Opcao[]>(
    () => (modo === 'recentes' ? opcoesDasRecentes(recentes) : modo === 'sugestoes' && sugestoes.resultado ? opcoesDasSugestoes(sugestoes.resultado) : []),
    [modo, recentes, sugestoes.resultado],
  )
  // A lista na tela é de um texto anterior (a nova ainda não chegou): pode ser vista, mas nenhuma opção dela vale para
  // o teclado. ↓ e ↑ não escolhem e Enter vai aos resultados do texto de agora.
  const pendente = modo === 'sugestoes' && sugestoes.para !== valor
  const opcoesDoTeclado = pendente ? [] : opcoes
  // Outra lista: nenhuma opção ativa (o foco continua no campo; Enter vai aos resultados).
  useEffect(() => setAtivo(-1), [modo, recentes, sugestoes.resultado])

  // Clicar ou tocar fora do campo e da lista fecha (no iOS tocar numa área vazia não tira o foco do campo).
  useEffect(() => {
    if (modo === null) return
    const aoApertar = (e: Event) => {
      if (!raiz.current?.contains(e.target as Node)) setFechada(true)
    }
    document.addEventListener('pointerdown', aoApertar)
    return () => document.removeEventListener('pointerdown', aoApertar)
  }, [modo])

  // No celular a lista abre sob o campo e o teclado cobre metade da tela. Com a lista aberta: a página ganha espaço no
  // fim (senão o campo não consegue subir, no Início), o campo longe do topo é levado para lá e a lista não passa da
  // parte visível (visualViewport: o teclado a encolhe), com rolagem própria para chegar a "Ver todos".
  const aberta = modo !== null
  // O espaço também fica enquanto o campo tem o foco e há texto sem sugestão: a lista some, o teclado não (a página não pula; T17-B-30).
  const digitando = comSugestoes && foco && !vazio && !fechada
  const comEspaco = aberta || digitando
  const computador = useBreakpoint() === 'computador' // girar para além de 768 px devolve o espaço
  const [alturaDaLista, setAlturaDaLista] = useState<number | null>(null)
  useEffect(() => {
    if (!comEspaco || computador || !window.matchMedia) {
      setAlturaDaLista(null)
      return // só no celular
    }
    const vv = window.visualViewport
    const visivel = () => ({ altura: vv?.height ?? window.innerHeight, topo: vv?.offsetTop ?? 0 })
    const paddingAnterior = document.body.style.paddingBottom
    document.body.style.paddingBottom = `${visivel().altura}px`
    const alto = raiz.current?.getBoundingClientRect().top ?? 0
    if (alto > 120 || alto < 0) raiz.current?.scrollIntoView?.({ block: 'start' })
    const medir = () => {
      const caixa = raiz.current?.getBoundingClientRect()
      if (!caixa) return
      const { altura, topo } = visivel()
      // Onde o campo vai estar: onde está, se já é no alto; senão, no topo (12 px de margem).
      const doCampo = caixa.top > 120 || caixa.top < 0 ? 12 : caixa.top
      setAlturaDaLista(Math.max(160, Math.floor(topo + altura - (doCampo + caixa.height) - 12)))
    }
    medir()
    vv?.addEventListener('resize', medir)
    vv?.addEventListener('scroll', medir)
    return () => {
      vv?.removeEventListener('resize', medir)
      vv?.removeEventListener('scroll', medir)
      document.body.style.paddingBottom = paddingAnterior
    }
  }, [comEspaco, computador])

  const limpar = () => {
    aoMudar('')
    setFechada(false)
    campo.current?.focus()
  }

  const enviar = (texto: string) => {
    if (comSugestoes) setRecentes(adicionarRecente(texto))
    setFechada(true)
    aoEnviar(texto)
  }

  const escolher = (opcao: Opcao) => {
    if (opcao.tipo === 'sugestao') {
      setRecentes(adicionarRecente(opcao.sugestao.recente))
      setFechada(true)
      navegar?.(opcao.sugestao.destino)
    } else if (opcao.tipo === 'todos') {
      enviar(valor)
    } else {
      if (opcao.texto !== valor) aoMudar(opcao.texto)
      enviar(opcao.texto)
    }
  }

  const remover = (texto: string) => setRecentes(removerRecente(texto))

  const aoTeclar = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!comSugestoes || e.nativeEvent.isComposing) return
    const n = opcoesDoTeclado.length
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (modo === null) {
          // Fechada pelo Esc, mas com o que mostrar: a seta reabre.
          if (fechada && disponivel !== null) {
            e.preventDefault()
            setFechada(false)
          }
          return
        }
        e.preventDefault()
        // -1 é "nenhuma": a seta passa por ela ao dar a volta.
        if (e.key === 'ArrowDown') setAtivo((a) => (a + 1 >= n ? -1 : a + 1))
        else setAtivo((a) => (a < 0 ? n - 1 : a - 1))
        return
      }
      case 'Enter': {
        const opcao = modo !== null ? opcoesDoTeclado[ativo] : undefined
        if (opcao) {
          e.preventDefault()
          escolher(opcao)
        }
        return
      }
      case 'Delete': {
        const opcao = modo === 'recentes' ? opcoesDoTeclado[ativo] : undefined
        if (e.shiftKey && opcao?.tipo === 'recente') {
          e.preventDefault()
          remover(opcao.texto)
        }
        return
      }
      case 'Escape':
        // Primeiro Esc: fecha a lista (o texto fica). Os seguintes seguem a regra comum, mais abaixo.
        if (modo !== null) {
          e.preventDefault()
          setFechada(true)
          setAtivo(-1)
        }
        return
    }
  }

  const noBotao = variante === 'barra'
  const dicaDoAtalho = variante !== 'pagina' && atalho && valor === ''
  const ativa = modo !== null && ativo >= 0 && ativo < opcoesDoTeclado.length
  return (
    <form
      ref={raiz}
      className={`campo-busca${variante === 'pagina' ? '' : ` campo-busca-${variante}`}`}
      role="search"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        if (comSugestoes) enviar(valor)
        else aoEnviar(valor)
      }}
      onBlur={(e) => {
        if (comSugestoes && !e.currentTarget.contains(e.relatedTarget as Node | null)) setFoco(false)
      }}
    >
      {!noBotao && (
        <label className="campo-busca-rotulo" htmlFor={id}>
          Buscar
        </label>
      )}
      <div className="campo-busca-caixa">
        {noBotao ? (
          <label className="campo-busca-rotulo" htmlFor={id}>
            <Icon name="buscar" size={18} />
            Buscar
          </label>
        ) : (
          <Icon name="buscar" size={20} />
        )}
        <input
          id={id}
          ref={campo}
          name="q"
          type="search"
          value={valor}
          placeholder={placeholder}
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-keyshortcuts={atalho ? '/' : undefined}
          role={comSugestoes ? 'combobox' : undefined}
          aria-autocomplete={comSugestoes ? 'list' : undefined}
          aria-expanded={comSugestoes ? modo !== null : undefined}
          aria-controls={modo !== null ? listaId : undefined}
          aria-activedescendant={ativa ? idDaOpcao(listaId, ativo) : undefined}
          onChange={(e) => {
            setFechada(false)
            setAtivo(-1)
            aoMudar(e.target.value)
          }}
          onFocus={() => {
            setFoco(true)
            setFechada(false)
          }}
          onPointerDown={() => setFechada(false)}
          onKeyDown={(e) => {
            // Método de entrada (IME): o Enter que confirma e o Esc que cancela a composição são dele, não da busca.
            if (e.nativeEvent.isComposing || e.keyCode === 229) {
              if (e.key === 'Enter') e.preventDefault() // o Safari envia o formulário no Enter que confirma
              return
            }
            aoTeclar(e)
            if (e.defaultPrevented) return
            // Esc: limpa o texto e, com o campo já vazio, sai do campo.
            if (e.key !== 'Escape') return
            e.preventDefault()
            if (valor !== '') aoMudar('')
            else e.currentTarget.blur()
          }}
        />
        {dicaDoAtalho && (
          <kbd className="campo-busca-tecla" aria-hidden="true">
            /
          </kbd>
        )}
        {valor !== '' && (
          <IconButton icon="fechar" label="Limpar a busca" shortcut="Escape" shortcutLabel="Esc" size={18} onClick={limpar} />
        )}
      </div>
      {comSugestoes && (
        <>
          <span role="status" className="so-leitor">
            {modo === 'recentes'
              ? `${recentes.length} ${recentes.length === 1 ? 'busca recente' : 'buscas recentes'}`
              : foco && !vazio && !fechada && sugestoes.resultado
                ? resumoDasSugestoes(sugestoes.resultado)
                : ''}
          </span>
          {modo !== null && (
            <div
              className="sugestoes"
              style={alturaDaLista !== null ? ({ '--sugestoes-altura': `${alturaDaLista}px` } as CSSProperties) : undefined}
              onMouseDown={manterFoco}
            >
              {modo === 'recentes' ? (
                <ListaDeRecentes
                  id={listaId}
                  recentes={recentes}
                  ativo={ativo}
                  aoEscolher={escolher}
                  aoRemover={remover}
                  aoLimpar={() => setRecentes(limparRecentes())}
                />
              ) : (
                sugestoes.resultado && <ListaDeSugestoes id={listaId} digitado={valor} sugestoes={sugestoes.resultado} ativo={pendente ? -1 : ativo} aoEscolher={escolher} />
              )}
              <div className="sugestoes-rodape" aria-hidden="true">
                <span>↑↓ navegar · Enter abrir · Esc fechar</span>
                <span>{modo === 'recentes' ? 'Só neste aparelho' : 'Enter sem seleção: todos os resultados'}</span>
              </div>
            </div>
          )}
        </>
      )}
    </form>
  )
}
