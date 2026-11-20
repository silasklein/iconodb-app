import { Fragment, useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { LinkComOrigem, OrigemDosLinks } from '../app/OrigemDosLinks'
import { paragrafosQueCitam } from '../banco/consultas'
import { caminhoDoParagrafo, destaqueDaFigura } from '../banco/paragrafos'
import type { CampoDoCatalogo, ItemDaFonte, ObjetoResumo, ParagrafoQueCita, ReferenciaBibliografica, SitioDoItem } from '../banco/tipos'
import { useCarregar } from '../ui/useCarregar'
import { acharLinks } from './links'
import { montarTrechos } from './trechos'
import '../imagens-usuario/MarcaSkc.css'
import './Figura.css'

/**
 * A página da figura (Etapa 4, Tarefa 24; tela 1 aprovada, decisão 91): as peças do item sem os campos do catálogo, a figura
 * de um livro em parágrafos (`ItemDaFonte.tipo === 'figura'`, o GGG).
 */

/** Os itens de figura do objeto, na ordem das fontes. */
export const figurasDe = (itens: readonly ItemDaFonte[]): ItemDaFonte[] => itens.filter((i) => i.tipo === 'figura')

/** O número da figura no livro, sem a sigla: «1a», «2». */
export const numeroDaFigura = (f: Pick<ItemDaFonte, 'referencia'>): string => `${f.referencia.numero ?? ''}${f.referencia.sufixo ?? ''}`

/** O campo do crédito (o Quellennachweis, categoria 7) de uma figura; null sem crédito. */
export const campoDoCredito = (catalogo: readonly CampoDoCatalogo[], f: Pick<ItemDaFonte, 'id'>): CampoDoCatalogo | null =>
  catalogo.find((c) => c.itemId === f.id && c.categoria === 7) ?? null

/** «1a-b », «1a–c », «3a, c », «2 »: o número da figura e as letras do Quellennachweis, no começo do crédito. */
const PREFIXO = /^(\d+)([a-z](?:\s*(?:[-–]|,|und)\s*[a-z])*)?\s+(?=\S)/

/** As letras de «a-c», «a, c», «a und b». */
function letrasDe(grupo: string): Set<string> {
  const letras = new Set<string>()
  for (const parte of grupo.split(/\s*(?:,|und)\s*/)) {
    const [de, ate = de] = parte.split(/\s*[-–]\s*/)
    if (!de || !ate) continue
    for (let c = de.charCodeAt(0); c <= ate.charCodeAt(0); c++) letras.add(String.fromCharCode(c))
  }
  return letras
}

/**
 * O crédito sem o prefixo da figura («1a-b Autor 1999: …» → «Autor 1999: …»), como no desenho aprovado: só quando o
 * prefixo começa pelo número da própria figura e, se traz letras, a letra dela está entre elas. Senão, como está.
 */
export function semPrefixoDaFigura(texto: string, ref: Pick<ItemDaFonte['referencia'], 'numero' | 'sufixo'>): string {
  const m = PREFIXO.exec(texto)
  if (!m || Number(m[1]) !== ref.numero) return texto
  if (m[2] && ref.sufixo && !letrasDe(m[2]).has(ref.sufixo)) return texto
  return texto.slice(m[0].length)
}

/**
 * O crédito da figura (o Quellennachweis), em português quando há, senão como impresso, sem o prefixo da figura
 * (`semPrefixoDaFigura`; `comPrefixo`: inteiro, como na voz da peça juntada), com cada citação resolvida da figura ligada
 * à obra, como no texto das leituras (`acharLinks`).
 */
export function CreditoDaFigura({
  campo,
  item,
  bibliografia,
  comPrefixo = false,
}: {
  campo: CampoDoCatalogo
  item: ItemDaFonte
  bibliografia: readonly ReferenciaBibliografica[]
  comPrefixo?: boolean
}) {
  const pt = campo.texto !== null
  const impresso = campo.texto ?? campo.literal
  const texto = comPrefixo ? impresso : semPrefixoDaFigura(impresso, item.referencia)
  const links = acharLinks(texto, [], { fonte: item.origem, itemId: item.id, bibliografia, remissoes: [] })
  return (
    <span className="figura-credito" lang={pt ? 'pt-BR' : undefined}>
      {montarTrechos(texto, { links }).map((p, i) =>
        p.tipo === 'link' ? (
          <Link key={i} className="item-ficha-link" to={p.destino} aria-label={p.rotulo}>
            {p.texto}
          </Link>
        ) : (
          <Fragment key={i}>{p.tipo === 'ancora' ? p.partes.map((x) => x.texto).join('') : p.texto}</Fragment>
        ),
      )}
    </span>
  )
}

const quantosParagrafos = (n: number) => `${n} ${n === 1 ? '§' : '§§'}`

/** A frase com a referência à figura destacada («(fig. 3b)», tela 1; `destaqueDaFigura`), ou inteira se não a acha. */
function FraseComAFigura({ frase, figura }: { frase: string; figura: Pick<ItemDaFonte['referencia'], 'numero' | 'sufixo'> | null }) {
  const d = figura?.numero ? destaqueDaFigura(frase, figura.numero, figura.sufixo ?? '') : null
  if (!d) return <>{frase}</>
  return (
    <>
      {frase.slice(0, d.inicio)}
      <span className="discutida-fig">{frase.slice(d.inicio, d.fim)}</span>
      {frase.slice(d.fim)}
    </>
  )
}

/**
 * «Discutida em N §§» (decisão 91, a3): cada § que cita a figura, com a frase que a cita (no português, ou no original
 * quando a tradução não deixou achar a frase) e a referência à figura destacada, o caminho do § em português (sem o livro,
 * que é o da figura) e o link à página do §, que leva a origem (decisão 85) quando a tela a dá (`OrigemDosLinks`).
 */
export function DiscutidaEm({ citacoes, figura = null }: { citacoes: readonly ParagrafoQueCita[]; figura?: Pick<ItemDaFonte['referencia'], 'numero' | 'sufixo'> | null }) {
  const id = useId()
  if (citacoes.length === 0) return <p className="discutida-vazia">Nenhum § cita esta figura.</p>
  return (
    <>
      <p className="discutida-titulo" id={id}>
        Discutida em {quantosParagrafos(citacoes.length)}
      </p>
      <ul className="discutida" aria-labelledby={id}>
        {citacoes.map((c) => (
          <li key={`${c.sigla}|${c.numero}`}>
            <LinkComOrigem to={caminhoDoParagrafo(c.sigla, c.numero)}>
              <span className="discutida-paragrafo">§ {c.numero}</span>
              <span className="discutida-texto">
                <span className="discutida-frase" lang={c.lingua === 'pt' ? 'pt-BR' : 'de'}>
                  <FraseComAFigura frase={c.frase} figura={figura} />
                </span>
                {c.caminho.length > 1 && <span className="discutida-onde">{c.caminho.slice(1).join(' › ')}</span>}
              </span>
            </LinkComOrigem>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * A voz da figura entre as leituras (tela 1; decisão 91, a2): a sigla e o número do livro à esquerda, como nas leituras, e
 * «Discutida em» à direita. `credito`: na peça juntada (o objeto que também está noutro livro), o crédito da figura vem aqui,
 * porque a ficha é a do outro livro.
 */
export function VozDaFigura({ item, credito = null }: { item: ItemDaFonte; credito?: ReactNode }) {
  const carga = useCarregar(() => paragrafosQueCitam(item.id), item.id)
  return (
    <OrigemDosLinks rotulo={rotuloDaOrigem(item)}>
      <div className="leitura figura-voz" role="group" aria-label={item.origem}>
        <div className="leitura-fonte" data-testid="leitura-fonte">
          <span className="leitura-sigla">{item.referencia.obra || item.publicacao}</span>
          <span className="leitura-numero">{numeroDaFigura(item)}</span>
        </div>
        <div className="leitura-corpo" aria-busy={carga.fase === 'carregando' || undefined}>
          {carga.fase === 'ok' && <DiscutidaEm citacoes={carga.dados} figura={item.referencia} />}
          {carga.fase === 'erro' && <p className="discutida-vazia">Não foi possível ler os §§ que citam esta figura.</p>}
          {credito && <p className="figura-voz-credito">Crédito: {credito}</p>}
        </div>
      </div>
    </OrigemDosLinks>
  )
}

/** A origem que os links da figura ao § levam (decisão 85): «‹ Figura TESTEG: 1a» na página do §. */
export const rotuloDaOrigem = (f: Pick<ItemDaFonte, 'origem'>): string => `Figura ${f.origem}`

/** A sigla do livro do sítio («TESTEG-9» → «TESTEG»): o id do sítio de um livro é `<SIGLA>-<n>`. */
const siglaDoSitio = (id: string) => id.slice(0, id.lastIndexOf('-'))

/** A linha que explica a marca «do texto» onde ela aparece em cartões (a página do sítio; Tarefa 26, tela 7). */
export const EXPLICACAO_DO_TEXTO = '«do texto»: o lugar vem da frase do § que cita a figura (ou do crédito dela), não de um campo do catálogo.'

/**
 * A marca do achado «do texto» sob o cartão de um objeto (a página do sítio; Tarefa 26, tela 7): «do texto · pelo § 3», com o
 * link ao §, ou «do texto · pelo crédito», sem link (o achado tirado só do crédito).
 */
export function MarcaDoTextoNoCartao({ achado }: { achado: NonNullable<ObjetoResumo['achadoDoTexto']> }) {
  return (
    <small className="cartao-do-texto" data-testid="marca-do-texto">
      <span className="marca-skc">do texto</span>{' '}
      <span className="cartao-do-texto-onde">
        {achado.paragrafo === null ? (
          'pelo crédito'
        ) : (
          <>
            pelo{' '}
            <LinkComOrigem className="item-ficha-link" to={caminhoDoParagrafo(achado.sigla, achado.paragrafo)}>
              § {achado.paragrafo}
            </LinkComOrigem>
          </>
        )}
      </span>
    </small>
  )
}

/**
 * A marca do achado «do texto» na ficha (decisão 90.1): a etiqueta contornada que o app já tem (a da marca SKC) e de onde o
 * lugar veio: «pela fig. 3b no § 29», com o link ao §, ou, quando o achado foi tirado só do crédito, «pelo crédito; nenhum §
 * diz o lugar», sem link. No achado comum, nada.
 */
export function MarcaDoTexto({ sitio, figura }: { sitio: Pick<SitioDoItem, 'id' | 'doTexto' | 'paragrafo'>; figura: ItemDaFonte | null }) {
  if (!sitio.doTexto) return null
  const n = sitio.paragrafo
  return (
    <OrigemDosLinks rotulo={figura ? rotuloDaOrigem(figura) : null}>
      <small className="item-ficha-do-texto" data-testid="marca-do-texto">
        <span className="marca-skc">do texto</span>{' '}
        {n === null ? (
          'pelo crédito; nenhum § diz o lugar'
        ) : (
          <>
            {figura ? `pela fig. ${numeroDaFigura(figura)} no ` : 'pelo '}
            <LinkComOrigem className="item-ficha-link" to={caminhoDoParagrafo(siglaDoSitio(sitio.id), n)}>
              § {n}
            </LinkComOrigem>
          </>
        )}
      </small>
    </OrigemDosLinks>
  )
}
