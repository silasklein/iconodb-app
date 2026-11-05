import type { MouseEvent } from 'react'
import { CATEGORIAS, ROTULO_DA_CATEGORIA, totalDeSugestoes, type Sugestao, type Sugestoes, type Trecho } from '../busca/sugestoes'
import { caminhoDaBusca } from '../busca/url'
import { Icon } from './Icon'
import { MiniaturaDoObjeto } from '../imagens-usuario/MiniaturaDoObjeto'
import { RE_NUMERO_DIGITADO } from '../objetos-skc/numeracao'
import './ListaDeSugestoes.css'

/**
 * A lista de sugestões (decisão 32; BuscaSugestoes e PC-BuscaSugestoes): o `listbox` das sugestões agrupadas por
 * categoria, com a parte digitada em negrito, e o das buscas recentes. É só desenho: quem usa (o campo de busca, o
 * autocompletar de `[[`) guarda a opção ativa e o foco (ARIA combobox: o foco fica no campo e `aria-activedescendant`
 * aponta para a opção ativa) e decide o que fazer ao escolher.
 */

/** O texto com os trechos que casam em negrito. */
export function Trechos({ trechos }: { trechos: readonly Trecho[] }) {
  return (
    <>
      {trechos.map((t, i) =>
        t.forte ? (
          <span key={i} className="forte">
            {t.texto}
          </span>
        ) : (
          t.texto
        ),
      )}
    </>
  )
}

/** Uma opção da lista plana, na ordem em que aparece (a base de ↑ ↓ e de `aria-activedescendant`). */
export type Opcao = { tipo: 'sugestao'; sugestao: Sugestao } | { tipo: 'todos' } | { tipo: 'recente'; texto: string }

/** As opções das sugestões na ordem da tela: por categoria e, no fim, "Ver todos os resultados". */
export function opcoesDasSugestoes(sugestoes: Sugestoes, verTodos = true): Opcao[] {
  const opcoes: Opcao[] = CATEGORIAS.flatMap((c) => (sugestoes[c] ?? []).map((sugestao): Opcao => ({ tipo: 'sugestao', sugestao })))
  return verTodos ? [...opcoes, { tipo: 'todos' }] : opcoes
}

export const opcoesDasRecentes = (recentes: readonly string[]): Opcao[] => recentes.map((texto): Opcao => ({ tipo: 'recente', texto }))

/** O id (DOM) da opção `indice` da lista `id`. */
export const idDaOpcao = (id: string, indice: number): string => `${id}-op-${indice}`

/** "9 sugestões em 4 categorias", para o leitor de tela. */
export function resumoDasSugestoes(sugestoes: Sugestoes): string {
  const total = totalDeSugestoes(sugestoes)
  if (total === 0) return 'Nenhuma sugestão'
  const categorias = CATEGORIAS.filter((c) => (sugestoes[c]?.length ?? 0) > 0).length
  return `${total} ${total === 1 ? 'sugestão' : 'sugestões'} em ${categorias} ${categorias === 1 ? 'categoria' : 'categorias'}`
}

/** Não tira o foco do campo ao apertar (mouse e toque): a opção escolhida age no clique. */
export const manterFoco = (e: MouseEvent) => e.preventDefault()

const comoLink = (caminho: string) => `#${caminho}`
const pareceNumero = (texto: string) => RE_NUMERO_DIGITADO.test(texto.trim())

interface PropsDasSugestoes {
  /** O id do `listbox`. */
  id: string
  /** O que o campo digitou (para o nome da lista e o "Ver todos"). */
  digitado: string
  sugestoes: Sugestoes
  /** O índice da opção ativa na lista plana (`opcoesDasSugestoes`), ou -1. */
  ativo: number
  aoEscolher: (opcao: Opcao) => void
  /** Mostrar "Ver todos os resultados para «…»" no fim (padrão). */
  verTodos?: boolean
}

function LinhaDaSugestao({ s, id, ativa, aoEscolher }: { s: Sugestao; id: string; ativa: boolean; aoEscolher: () => void }) {
  const miniatura = s.categoria === 'objetos' && !s.skc
  const marca = s.skc ? 'SKC' : s.id
  return (
    <a
      id={id}
      className={`sugestao${miniatura ? ' sugestao-com-miniatura' : ''}${ativa ? ' sugestao-ativa' : ''}`}
      role="option"
      aria-selected={ativa}
      href={comoLink(s.destino)}
      tabIndex={-1}
      onClick={(e) => {
        e.preventDefault()
        aoEscolher()
      }}
    >
      {s.categoria === 'objetos' && (
        <span className="sugestao-miniatura" aria-hidden="true">
          {s.miniatura && <MiniaturaDoObjeto numero={s.ref} caminho={s.miniatura} alt="" />}
        </span>
      )}
      <span className="sugestao-texto">
        <span className="sugestao-principal">
          {s.codigo && (
            <>
              <span className="sugestao-codigo codigo">
                <Trechos trechos={s.codigoTrechos} />
              </span>
              {' · '}
            </>
          )}
          <Trechos trechos={s.trechos} />
        </span>
        {s.complemento && (
          <span className="sugestao-complemento">
            <Trechos trechos={s.complementoTrechos} />
          </span>
        )}
      </span>
      {marca && <span className="sugestao-marca codigo">{marca}</span>}
      {ativa && (
        <kbd className="sugestao-enter" aria-hidden="true">
          Enter
        </kbd>
      )}
    </a>
  )
}

/** As sugestões por categoria e, no fim, "Ver todos os resultados". */
export function ListaDeSugestoes({ id, digitado, sugestoes, ativo, aoEscolher, verTodos = true }: PropsDasSugestoes) {
  const opcoes = opcoesDasSugestoes(sugestoes, verTodos)
  let indice = 0
  const vazia = totalDeSugestoes(sugestoes) === 0
  return (
    <div id={id} className="sugestoes-lista" role="listbox" aria-label={`Sugestões para «${digitado.trim()}»`}>
      {CATEGORIAS.filter((c) => (sugestoes[c]?.length ?? 0) > 0).map((c) => (
        <div key={c} className="sugestoes-grupo" role="group" aria-label={ROTULO_DA_CATEGORIA[c]}>
          <span className="sugestoes-grupo-rotulo" aria-hidden="true">
            {ROTULO_DA_CATEGORIA[c]}
          </span>
          <div className="sugestoes-linhas">
            {sugestoes[c]!.map((s) => {
              const i = indice++
              return <LinhaDaSugestao key={s.chave} s={s} id={idDaOpcao(id, i)} ativa={i === ativo} aoEscolher={() => aoEscolher(opcoes[i]!)} />
            })}
          </div>
        </div>
      ))}
      {vazia && <p className="sugestoes-vazia">Nenhuma sugestão. Enter mostra todos os resultados.</p>}
      {verTodos && (
        <a
          id={idDaOpcao(id, indice)}
          className={`sugestoes-todos${indice === ativo ? ' sugestao-ativa' : ''}`}
          role="option"
          aria-selected={indice === ativo}
          href={comoLink(caminhoDaBusca(digitado.trim()))}
          tabIndex={-1}
          onClick={(e) => {
            e.preventDefault()
            aoEscolher({ tipo: 'todos' })
          }}
        >
          <span>Ver todos os resultados para «{digitado.trim()}»</span>
          <Icon name="proximo" size={18} />
        </a>
      )}
    </div>
  )
}

interface PropsDasRecentes {
  /** O id do `listbox`. */
  id: string
  recentes: readonly string[]
  ativo: number
  aoEscolher: (opcao: Opcao) => void
  aoRemover: (texto: string) => void
  aoLimpar: () => void
}

/** As buscas recentes (campo vazio em foco): cada uma com o × que a remove, e "Limpar" para todas. */
export function ListaDeRecentes({ id, recentes, ativo, aoEscolher, aoRemover, aoLimpar }: PropsDasRecentes) {
  return (
    <section className="recentes" aria-labelledby={`${id}-titulo`}>
      <div className="recentes-cabeca">
        <h2 id={`${id}-titulo`}>Buscas recentes</h2>
        <button type="button" className="recentes-limpar" onClick={aoLimpar}>
          Limpar
        </button>
      </div>
      {/* O listbox só tem opções (um botão dentro de um listbox não é permitido em ARIA): os × ficam numa coluna ao lado,
          cada um na altura da sua linha (--linha-recente), e o teclado os alcança por Shift+Delete. */}
      <div className="recentes-corpo">
        <div id={id} className="recentes-lista" role="listbox" aria-labelledby={`${id}-titulo`}>
          {recentes.map((texto, i) => (
            <a
              key={texto}
              id={idDaOpcao(id, i)}
              className={`recente-busca${i === ativo ? ' sugestao-ativa' : ''}`}
              role="option"
              aria-selected={i === ativo}
              href={comoLink(caminhoDaBusca(texto))}
              tabIndex={-1}
              onClick={(e) => {
                e.preventDefault()
                aoEscolher({ tipo: 'recente', texto })
              }}
            >
              <Icon name="recentes" size={18} />
              <span className={pareceNumero(texto) ? 'codigo' : undefined}>{texto}</span>
            </a>
          ))}
        </div>
        <div className="recentes-remover" role="group" aria-label="Remover das buscas recentes">
          {recentes.map((texto) => (
            <button
              key={texto}
              type="button"
              className="recente-remover hit tip-start"
              aria-label={`Remover «${texto}» das buscas recentes`}
              data-tip="Remover das recentes"
              onClick={() => aoRemover(texto)}
            >
              <Icon name="fechar" size={16} />
            </button>
          ))}
        </div>
      </div>
      <p className="recentes-nota">As buscas recentes ficam só neste aparelho. Ao digitar, as sugestões substituem esta lista.</p>
    </section>
  )
}
