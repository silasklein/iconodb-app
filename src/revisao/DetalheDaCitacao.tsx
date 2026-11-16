/**
 * O detalhe de uma «Citação não resolvida» (Parte 2C, bloco 3, Tarefa 11; quadro 1 do canvas «Bloco 3: telas»): onde ela
 * aparece, com a citação marcada, e «Abrir o objeto N»; a busca de obras e as parecidas (o sobrenome e o ano da chave), cada
 * uma com «Ligar» (o botão diz quantas iguais liga); «Nova obra com esta citação», que abre a Nova obra e volta; e «Marcar
 * como resolvida sem ligar». Ligada no app, ela diz a obra e se desfaz.
 *
 * A busca de obras usa `useObrasParaLigar()`: as obras dos livros e as do usuário, juntas (Tarefa 10), sem a obra dos livros
 * que sai no build seguinte (`obraPublicadaSai`; revisão final, M1).
 */
import { useId, useMemo, useState, type ReactNode, type Ref } from 'react'
import { Link } from 'react-router'
import { LinkComOrigem, useOrigemDosLinks } from '../app/OrigemDosLinks'
import { comVoltar } from '../app/voltar'
import { ondeApareceACitacao, type CitacaoDoPacote, type OndeAparece } from '../banco/consultas'
import { useObrasParaLigar, type ObraDaLista } from '../bibliografia/doUsuario'
import { anoDoCsl, camposDaCurta, nomesDoTexto, parecidas } from '../bibliografia/formulario'
import { dobrar } from '../glossario/modelo'
import { Icon } from '../ui/Icon'
import { useCarregar } from '../ui/useCarregar'
import { estadoAtual, useEstado } from '../usuario/estado'
import { alvoDaLigacao, anoDaCitacao, citacaoDoLivro, rotuloDeLigar } from './citacoes'
import { excecaoViva } from './ligacoes'
import type { CasoEscolhido } from './DetalheDoCaso'
import '../imagens-usuario/MarcaSkc.css'

/** Quantas obras a lista mostra (as parecidas e a busca). */
const MAXIMO = 8
/** Quanto texto em volta da citação o «Onde aparece» mostra (um trecho longo vira «… <antes> citação <depois> …»). */
const EM_VOLTA = 220

export const rotuloDaObra = (o: Pick<ObraDaLista, 'curta' | 'titulo' | 'id'>): string => o.curta ?? o.titulo ?? o.id

/** O texto em que se procura cada obra (a curta, as curtas, o título, os sobrenomes e o ano), dobrado; uma vez por obra. */
const TEXTO_DA_OBRA = new WeakMap<ObraDaLista, string>()
function textoDaObra(o: ObraDaLista): string {
  let t = TEXTO_DA_OBRA.get(o)
  if (t === undefined) {
    const csl = o.csl ?? {}
    const nomes = [...(Array.isArray(csl.author) ? csl.author : []), ...(Array.isArray(csl.editor) ? csl.editor : [])].map((n) =>
      n && typeof n === 'object' ? [(n as Record<string, unknown>).family, (n as Record<string, unknown>).literal].filter((x) => typeof x === 'string').join(' ') : '',
    )
    t = dobrar([o.curta ?? '', ...o.curtas, o.titulo ?? '', ...nomes, anoDoCsl(csl) ?? ''].join(' '))
    TEXTO_DA_OBRA.set(o, t)
  }
  return t
}

/** As obras que têm todas as palavras da busca (dobradas), na ordem da Bibliografia. */
export function buscarObras(obras: readonly ObraDaLista[], busca: string, maximo = MAXIMO): ObraDaLista[] {
  const palavras = dobrar(busca).split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return []
  const saida: ObraDaLista[] = []
  for (const o of obras) {
    const t = textoDaObra(o)
    if (palavras.every((p) => t.includes(p))) saida.push(o)
    if (saida.length >= maximo) break
  }
  return saida
}

/**
 * As obras parecidas com a citação: pela chave (o sobrenome e o ano, `parecidas` da Nova obra); a citação sem autor, só pelo
 * ano (a pessoa escolhe).
 */
export function obrasParecidas(obras: readonly ObraDaLista[], c: Pick<CitacaoDoPacote, 'curta' | 'bruto'>, maximo = MAXIMO): ObraDaLista[] {
  if (c.curta) {
    const campos = camposDaCurta(c.curta)
    const nomes = nomesDoTexto(campos.autores || campos.organizadores)
    const csl: Record<string, unknown> = { title: '', author: nomes, ...(campos.ano ? { issued: { 'date-parts': [[Number(campos.ano)]] } } : {}) }
    return parecidas({ csl, curta: c.curta }, obras, maximo).map((p) => p.obra)
  }
  const ano = anoDaCitacao(c.bruto)
  return ano ? obras.filter((o) => anoDoCsl(o.csl) === ano || o.curtas.some((x) => x.includes(ano))).slice(0, maximo) : []
}

/**
 * O texto com a citação marcada (`<mark>`; todas as vezes que ela aparece), cortado em volta delas quando é longo. Sem a
 * citação no texto, o texto como está.
 */
export function TextoComACitacao({ texto, citacao }: { texto: string; citacao: string }) {
  const posicoes: number[] = []
  for (let i = citacao ? texto.indexOf(citacao) : -1; i >= 0; i = texto.indexOf(citacao, i + citacao.length)) posicoes.push(i)
  if (posicoes.length === 0) return <>{texto.length > EM_VOLTA * 2 ? `${texto.slice(0, EM_VOLTA * 2)}…` : texto}</>
  const inicio = Math.max(0, posicoes[0]! - EM_VOLTA)
  const fim = Math.min(texto.length, posicoes.at(-1)! + citacao.length + EM_VOLTA)
  const partes: ReactNode[] = []
  let de = inicio
  posicoes.forEach((p, k) => {
    partes.push(texto.slice(de, p), <mark key={k} className="revisao-marca">{citacao}</mark>)
    de = p + citacao.length
  })
  partes.push(texto.slice(de, fim))
  return (
    <>
      {inicio > 0 && '… '}
      {partes}
      {fim < texto.length && ' …'}
    </>
  )
}

interface Props {
  escolhido: CasoEscolhido
  citacoes: CitacaoDoPacote[]
  porChave: ReadonlyMap<string, readonly CitacaoDoPacote[]>
  /** O endereço da Revisão agora (com `?caso=`): a Nova obra volta para ele. */
  volta: string
  computador: boolean
  ocupado: boolean
  tituloRef?: Ref<HTMLHeadingElement>
  aoMarcar: () => void
  aoDesfazer: () => void
  aoLigar: (obra: { id: string; rotulo: string }) => void
  aoDesfazerLigacao: () => void
}

export function DetalheDaCitacao({ escolhido, citacoes, porChave, volta, computador, ocupado, tituloRef, aoMarcar, aoDesfazer, aoLigar, aoDesfazerLigacao }: Props) {
  const { caso, situacao, posicao, grupo } = escolhido
  const c = citacoes[0]!
  const idBusca = useId()
  // Tarefa 14 (N3 da Tarefa 11): a obra ligada abre com a origem leve (decisão 85), e a página dela mostra «‹ Revisão»
  const origem = useOrigemDosLinks()
  const [busca, setBusca] = useState('')
  // M1 (revisão final): sem a obra dos livros que sai no build seguinte (a ligação a ela não valeria)
  const carga = useObrasParaLigar()
  const obras = carga.fase === 'ok' ? carga.dados : null
  // a conta das iguais muda com as ligações (uma igual desligada no objeto não conta)
  const ligacoes = useEstado((e) => e.registros.get('citacao'))
  const alvo = useMemo(() => alvoDaLigacao(estadoAtual(), citacoes, porChave), [citacoes, porChave, ligacoes]) // eslint-disable-line react-hooks/exhaustive-deps
  const parecidasDaCitacao = useMemo(() => (obras ? obrasParecidas(obras, c) : []), [obras, c])
  const achadas = useMemo(() => (obras && busca.trim() ? buscarObras(obras, busca) : null), [obras, busca])
  const lista = achadas ?? parecidasDaCitacao
  const onde = useCarregar<OndeAparece | null>(() => ondeApareceACitacao(c), `${c.sigla}|${c.id}`)
  const obraLigada = situacao === 'ligado' && escolhido.obra ? (obras?.find((o) => o.id === escolhido.obra) ?? null) : null
  const semAutor = c.curta === null
  const abreObjeto = caso.abrir?.startsWith('/item/') ?? false
  // pela chave, as exceções vivas das citações do caso (desligadas no objeto) saem junto na Nova obra, como no «Ligar»
  const excecoes = useMemo(
    () => (alvo?.porChave ? citacoes.map((x) => excecaoViva(estadoAtual(), citacaoDoLivro(x))).filter((x): x is string => x !== null) : []),
    [alvo, citacoes, ligacoes], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const novaObra = alvo
    ? `/obra/nova?citacao=${encodeURIComponent(alvo.id)}&curta=${encodeURIComponent(c.bruto)}${excecoes.map((x) => `&excecao=${encodeURIComponent(x)}`).join('')}&volta=${encodeURIComponent(volta)}`
    : null

  return (
    <article className="revisao-detalhe-caso" data-chave={caso.chave} aria-labelledby={`${idBusca}-titulo`}>
      <header className="revisao-detalhe-cabeca">
        <span className="revisao-detalhe-sobre">
          {situacao === 'ligado' ? 'Citação ligada por você' : situacao === 'resolvido' ? 'Citação resolvida por você, sem ligar' : 'Citação não resolvida'}
          {posicao !== null && grupo && ` · ${posicao} de ${grupo.abertos.length}`}
        </span>
        <h2 id={`${idBusca}-titulo`} ref={tituloRef} tabIndex={-1}>
          {c.bruto}
        </h2>
        <p className="revisao-detalhe-apoio">
          {situacao === 'ligado'
            ? null
            : semAutor
              ? 'Sem autor na citação: «Ligar» liga só esta ocorrência.'
              : obras && parecidasDaCitacao.length === 0
                ? 'Nenhuma obra da Bibliografia tem este autor e este ano.'
                : obras
                  ? `${parecidasDaCitacao.length === 1 ? '1 obra parecida' : `${parecidasDaCitacao.length} obras parecidas`} na Bibliografia.`
                  : null}
        </p>
      </header>

      <section className="revisao-detalhe-quadro" aria-labelledby={`${idBusca}-onde`}>
        <h3 id={`${idBusca}-onde`} className="revisao-detalhe-secao">
          Onde aparece
        </h3>
        <p className="revisao-detalhe-onde">{caso.onde}</p>
        {onde.fase === 'ok' && onde.dados && (
          <p className="revisao-detalhe-texto" lang={onde.dados.lingua ?? undefined}>
            <TextoComACitacao texto={onde.dados.texto} citacao={c.bruto} />
          </p>
        )}
        {caso.abrir && (
          <LinkComOrigem className="revisao-detalhe-link" to={caso.abrir}>
            {abreObjeto ? `Abrir o objeto ${caso.numero}` : 'Abrir o grupo'}
          </LinkComOrigem>
        )}
      </section>

      {situacao === 'ligado' ? (
        <section className="revisao-detalhe-ligada" aria-labelledby={`${idBusca}-ligada`}>
          <h3 id={`${idBusca}-ligada`} className="revisao-detalhe-secao">
            Ligada a uma obra
          </h3>
          <p>
            {escolhido.obra && (
              <Link to={`/obra/${encodeURIComponent(escolhido.obra)}`} state={comVoltar(undefined, origem)} className="revisao-detalhe-link">
                {obraLigada ? rotuloDaObra(obraLigada) : escolhido.obra}
              </Link>
            )}
            {obraLigada?.titulo && obraLigada.curta && <span className="revisao-detalhe-obra-titulo"> · {obraLigada.titulo}</span>}
          </p>
          <p className="revisao-detalhe-apoio">A citação abre esta obra no texto e saiu da fila. Vai para os dados no próximo pacote.</p>
          <div className="revisao-detalhe-botoes">
            <button type="button" className="form-botao" onClick={aoDesfazerLigacao} disabled={ocupado} aria-busy={ocupado || undefined}>
              <Icon name="desfazer" size={16} />
              Desfazer a ligação
            </button>
          </div>
        </section>
      ) : (
        <section className="revisao-detalhe-ligar" aria-labelledby={`${idBusca}-ligar`}>
          <h3 id={`${idBusca}-ligar`} className="revisao-detalhe-secao">
            Ligar a uma obra da Bibliografia
          </h3>
          <div className="form-campo">
            <label htmlFor={`${idBusca}-busca`}>Procurar por autor, ano ou título</label>
            <input id={`${idBusca}-busca`} type="search" value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
          </div>
          {carga.fase === 'carregando' && <p className="revisao-detalhe-apoio">Carregando a Bibliografia…</p>}
          {carga.fase === 'erro' && <p className="revisao-detalhe-apoio">Não foi possível ler a Bibliografia.</p>}
          {obras && (
            <>
              <p className="revisao-detalhe-apoio" aria-live="polite">
                {achadas
                  ? achadas.length === 0
                    ? 'Nenhuma obra com essas palavras.'
                    : `${achadas.length === MAXIMO ? `As ${MAXIMO} primeiras obras` : achadas.length === 1 ? '1 obra' : `${achadas.length} obras`} com essas palavras.`
                  : lista.length > 0
                    ? semAutor
                      ? 'Obras do mesmo ano:'
                      : 'Parecidas (o sobrenome e o ano da citação):'
                    : semAutor
                      ? 'Nenhuma obra do mesmo ano. Procure acima.'
                      : 'Procure acima por outra grafia, o título ou o ano.'}
              </p>
              {lista.length > 0 && (
                <ul className="revisao-detalhe-obras" aria-label="Obras para ligar">
                  {lista.map((o) => (
                    <li key={o.id}>
                      <span className="revisao-detalhe-obra">
                        <span className="revisao-detalhe-obra-curta">
                          {rotuloDaObra(o)}
                          {o.skc && <span className="marca-skc">SKC</span>}
                        </span>
                        {o.curta && o.titulo && <span className="revisao-detalhe-obra-titulo">{o.titulo}</span>}
                      </span>
                      {alvo && (
                        <button
                          type="button"
                          className="form-botao revisao-detalhe-ligar-botao"
                          disabled={ocupado}
                          aria-busy={ocupado || undefined}
                          aria-label={`${rotuloDeLigar(alvo)} a «${rotuloDaObra(o)}»`}
                          onClick={() => aoLigar({ id: o.id, rotulo: rotuloDaObra(o) })}
                        >
                          {rotuloDeLigar(alvo)}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {!alvo && <p className="revisao-detalhe-apoio">Esta citação não tem trecho nem objeto: não há como ligar só ela.</p>}
          <div className="revisao-detalhe-botoes">
            {novaObra && (
              <Link className="form-botao form-botao-forte" to={novaObra}>
                Nova obra com esta citação
              </Link>
            )}
            {situacao === 'aberto' ? (
              <button type="button" className="form-botao" aria-keyshortcuts="D" onClick={aoMarcar} disabled={ocupado}>
                Marcar como resolvida sem ligar
              </button>
            ) : (
              <button type="button" className="form-botao" onClick={aoDesfazer} disabled={ocupado}>
                <Icon name="desfazer" size={16} />
                Devolver à fila
              </button>
            )}
          </div>
          <p className="revisao-detalhe-nota">
            Ligada, a citação passa a abrir a obra no texto, sai da fila e vai para os dados no próximo pacote.
            {alvo?.porChave && alvo.iguais > 1 && ` «Ligar» liga também as citações iguais nos outros objetos e nos livros que vierem.`}
            {computador && ' ↑ ↓ andam pela lista; Enter abre; U desfaz.'}
          </p>
        </section>
      )}
    </article>
  )
}
