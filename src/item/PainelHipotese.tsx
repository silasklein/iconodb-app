import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { formatarLocalizador } from '../banco/referencias'
import { hipotese } from '../banco/consultas'
import type { Hipotese } from '../banco/tipos'
import { caminhoDaBusca } from '../busca/url'
import { useFormasEmUso, useNomeVivo } from '../glossario/doUsuario'
import { ConteudoSkc, etiquetaDaHipoteseSkc, nomeDaHipoteseSkc, useHipoteseSkc, type TextosDasLeituras } from '../hipoteses/ConteudoSkc'
import { eHipoteseSkc } from '../hipoteses/modelo'
import { PosicaoNaHipotese } from '../hipoteses/PosicaoNaHipotese'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { MarcadorDeNivel } from '../ui/MarcadorDeNivel'
import { IconButton } from '../ui/IconButton'
import { useCarregar } from '../ui/useCarregar'
import { CascaDoPainel } from './CascaDoPainel'
import {
  autores,
  nomeDaHipotese,
  ROTULO_DA_MODALIDADE,
  ROTULO_DA_RELIGIOSIDADE,
  ROTULO_DA_VERIFICACAO,
  ROTULO_DO_NIVEL,
  temAncora,
} from './rotulos'
import type { VerbeteDoTrecho } from './trechos'
import './PainelHipotese.css'

export interface OrdemNoTexto {
  /** 1 a total. */
  posicao: number
  total: number
  anterior: string | null
  seguinte: string | null
}

interface Props {
  id: string
  /** "folha": a folha de baixo do celular (Hipotese.dc.html), modal. "lateral": o painel de 380 px do computador (PC-ItemHipotese.dc.html). */
  variante: 'folha' | 'lateral'
  aoFechar: () => void
  /** Onde o foco volta ao fechar (a âncora da hipótese, ou quem abriu). */
  devolverFoco?: () => HTMLElement | null
  /** A hipótese entre as âncoras do texto, para "[" e "]". Sem ela (hipótese sem trecho), não há anterior/seguinte. */
  ordem?: OrdemNoTexto | null
  aoIr?: (id: string) => void
  /** A região do alvo está acesa na imagem. */
  regiaoAcesa?: boolean
  /** Os verbetes marcados no trecho da hipótese (`verbetesDaAncora`): um link para cada. */
  verbetes?: readonly VerbeteDoTrecho[]
  /** Hipótese SKC (Tarefa 10): os textos das leituras, para o aviso "o texto da fonte mudou", e o rótulo de cada fonte. */
  textos?: TextosDasLeituras
  rotulosDasFontes?: ReadonlyMap<string, string>
}

const SEM_VERBETES: readonly VerbeteDoTrecho[] = []
const SEM_TEXTOS: TextosDasLeituras = new Map()

/**
 * Uma hipótese aberta: nível e modalidade, o termo, o recorte da fonte, autores, origem, alvo e
 * verificação, e os caminhos ao verbete e à busca pelo termo. No celular é uma folha modal (foco
 * preso, Esc, fundo que fecha, o resto inerte); no computador, um painel lateral não modal, que
 * fica sobre a coluna de leitura e nunca sobre a imagem. Em ambos o foco entra no painel e volta
 * à âncora ao fechar (CascaDoPainel).
 *
 * Tarefa 10: uma hipótese do livro tem, no fim, "Sua posição" (concordo, discordo, em aberto); uma hipótese SKC
 * (`HY-<aparelho>-<n>`) vem da camada do usuário, com o rótulo SKC (ConteudoSkc).
 */
export function PainelHipotese({ id, variante, aoFechar, devolverFoco, ordem = null, aoIr, regiaoAcesa = false, verbetes = SEM_VERBETES, textos = SEM_TEXTOS, rotulosDasFontes = SEM_TEXTOS }: Props) {
  const skc = eHipoteseSkc(id)
  const carga = useCarregar(() => (skc ? Promise.resolve(null) : hipotese(id)), id)
  const hSkc = useHipoteseSkc(skc ? id : '')
  const formas = useFormasEmUso()
  const nomeDe = useNomeVivo()
  const atual = { ordem, aoIr }
  const folha = variante === 'folha'

  const h = !skc && carga.fase === 'ok' ? carga.dados : null
  const nome = skc ? (hSkc ? nomeDaHipoteseSkc(hSkc, nomeDe) : null) : h ? nomeDaHipotese(h, formas) : null
  const etiqueta = skc ? (hSkc ? etiquetaDaHipoteseSkc(hSkc) : '') : h ? `${ROTULO_DO_NIVEL[h.nivel]} · ${ROTULO_DA_MODALIDADE[h.modalidade]}` : ''

  // O nível de agora: o de uma hipótese SKC muda na hora quando a pessoa o edita; sem nível, nenhum marcador.
  const nivelAtual = skc ? (hSkc?.nivel ?? null) : (h?.nivel ?? null)

  return (
    <CascaDoPainel
      variante={variante}
      rotulo={nome ? `Hipótese ${nome}` : 'Hipótese'}
      ocupado={!skc && carga.fase === 'carregando'}
      aoFechar={aoFechar}
      devolverFoco={devolverFoco}
      chave={id}
      atalhos={{
        '[': () => {
          if (!atual.ordem?.anterior) return false
          atual.aoIr?.(atual.ordem.anterior)
        },
        ']': () => {
          if (!atual.ordem?.seguinte) return false
          atual.aoIr?.(atual.ordem.seguinte)
        },
      }}
    >
      <div className="painel-hipotese-topo">
        <span className="painel-hipotese-etiqueta">
          <MarcadorDeNivel nivel={nivelAtual} tamanho="painel" comTexto={false} />
          {etiqueta}
        </span>
        <IconButton icon="fechar" label="Fechar o painel" shortcut="Escape" shortcutLabel="Esc" onClick={aoFechar} />
      </div>
      {ordem && (
        <div className="painel-hipotese-ordem">
          <BotaoDeOrdem icone="anterior" rotulo="Hipótese anterior no texto" atalho="[" destino={ordem.anterior} aoIr={aoIr} />
          <span className="codigo">{`${ordem.posicao} / ${ordem.total} no texto`}</span>
          <BotaoDeOrdem icone="proximo" rotulo="Hipótese seguinte no texto" atalho="]" destino={ordem.seguinte} aoIr={aoIr} />
        </div>
      )}
      <div className="painel-hipotese-corpo">
        {skc ? (
          hSkc ? (
            <ConteudoSkc h={hSkc} regiaoAcesa={regiaoAcesa} textos={textos} rotulosDasFontes={rotulosDasFontes} />
          ) : (
            <p>Hipótese não encontrada.</p>
          )
        ) : (
          <>
            {carga.fase === 'erro' && <AvisoDeErro erro={carga.erro} aoTentar={carga.tentarDeNovo} />}
            {carga.fase === 'ok' && h === null && <p>Hipótese não encontrada.</p>}
            {h && <Conteudo h={h} regiaoAcesa={regiaoAcesa} verbetes={verbetes} formas={formas} />}
          </>
        )}
      </div>
      {!folha && (
        <p className="painel-hipotese-teclas">
          {ordem && (
            <>
              <kbd>[ ]</kbd> anterior e seguinte ·{' '}
            </>
          )}
          <kbd>H</kbd> todas por nível · <kbd>Esc</kbd> fecha
        </p>
      )}
    </CascaDoPainel>
  )
}

function BotaoDeOrdem({ icone, rotulo, atalho, destino, aoIr }: { icone: 'anterior' | 'proximo'; rotulo: string; atalho: string; destino: string | null; aoIr?: (id: string) => void }) {
  if (!destino) return <span className="painel-hipotese-ordem-vazio" aria-hidden="true" />
  return <IconButton icon={icone} label={rotulo} shortcut={atalho} tipPosition={icone === 'anterior' ? 'start' : 'end'} onClick={() => aoIr?.(destino)} />
}

function Conteudo({ h, regiaoAcesa, verbetes, formas }: { h: Hipotese; regiaoAcesa: boolean; verbetes: readonly VerbeteDoTrecho[]; formas: ReadonlyMap<string, string> }) {
  const termo = h.termos[0] ?? null
  // Os verbetes do trecho e, depois, os termos da hipótese que não estão nele.
  // Cada um com a forma em uso de agora (Tarefa 11); o texto do trecho é o do pacote.
  const lista: VerbeteDoTrecho[] = verbetes.map((v) => ({ ...v, texto: formas.get(v.glId) ?? v.texto }))
  for (const t of h.termos) if (!lista.some((v) => v.glId === t.glId)) lista.push({ glId: t.glId, texto: formas.get(t.glId) ?? t.pt ?? t.de ?? t.glId })
  const linhas: [string, ReactNode][] = []
  if (h.citacao) linhas.push(['Fonte', <span lang="de">{`»${h.citacao}«`}</span>])
  if (h.autores.length > 0) linhas.push(['Autores', autores(h.autores)])
  if (h.locator) linhas.push(['Origem', formatarLocalizador(h.locator)])
  linhas.push(['Sobre', <Sobre h={h} regiaoAcesa={regiaoAcesa} />])
  if (!temAncora(h)) linhas.push(['Trecho', 'sem trecho no texto PT'])
  if (h.religiosidade) linhas.push(['Religiosidade', ROTULO_DA_RELIGIOSIDADE[h.religiosidade]])
  linhas.push(['Verificação', ROTULO_DA_VERIFICACAO[h.verificacao]])
  const ids = [h.id, termo?.glId].filter(Boolean).join(' · ')

  return (
    <>
      <div className="painel-hipotese-cabeca">
        <h2>{nomeDaHipotese(h, formas)}</h2>
        <span className="painel-hipotese-ids codigo">
          {ids}
          {termo?.de && (
            <>
              {' · '}
              <span lang="de">{termo.de}</span>
            </>
          )}
        </span>
      </div>
      <dl className="painel-hipotese-dados">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      {lista.length > 1 && (
        <ul className="painel-hipotese-verbetes" aria-label="Verbetes no trecho">
          {lista.map((v) => (
            <li key={v.glId}>
              <Link to={`/verbete/${encodeURIComponent(v.glId)}`} aria-label={`Abrir verbete: ${v.texto}`}>
                <span className="painel-hipotese-verbetes-rotulo">Abrir verbete</span> {v.texto}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {lista.length > 0 && (
        <div className="painel-hipotese-acoes">
          {lista.length === 1 && (
            <Link className="painel-hipotese-principal" to={`/verbete/${encodeURIComponent(lista[0]!.glId)}`}>
              Abrir verbete
            </Link>
          )}
          <Link
            className="painel-hipotese-secundaria"
            to={caminhoDaBusca((termo && formas.get(termo.glId)) ?? termo?.pt ?? termo?.de ?? lista[0]!.texto, { escopo: 'termo' })}
            aria-label="Filtrar a busca por este termo"
          >
            Filtrar a busca
          </Link>
        </div>
      )}
      <PosicaoNaHipotese hipotese={h.id} />
    </>
  )
}

function Sobre({ h, regiaoAcesa }: { h: Hipotese; regiaoAcesa: boolean }) {
  const { alvo } = h
  const outroObjeto = alvo.numero && h.citadaDe
  return (
    <>
      {alvo.rotulo ? (
        <>
          <strong>{alvo.rotulo}</strong> (elemento)
        </>
      ) : (
        'objeto inteiro'
      )}
      {outroObjeto && (
        <>
          {' de '}
          <Link to={`/item/${encodeURIComponent(alvo.numero!)}`} className="codigo">
            {alvo.numero}
          </Link>
        </>
      )}
      {regiaoAcesa && ' · acesa na imagem'}
    </>
  )
}
