import type { MouseEvent, ReactNode, Ref } from 'react'
import { Link, useLocation } from 'react-router'
import type { ObjetoResumo } from '../banco/tipos'
import { OrigemDosLinks, useAoVoltarParaOrigem } from '../app/OrigemDosLinks'
import { rotuloDoIconeDeVoltar, voltarDaOrigem, type VoltarDaOrigem as Origem } from '../app/voltar'
import { VoltarDaOrigem } from '../item/VoltarDaOrigem'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { CartaoDeObjeto } from '../ui/CartaoDeObjeto'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { Contagem } from '../ui/Contagem'
import './Lista.css'

/** Uma linha de "rótulo: valor" (dl). Sem valor, não aparece. `lang="de"` desenha em itálico. */
export function Linha({ rotulo, children, lang, dir, vazio = false }: { rotulo: string; children: ReactNode; lang?: string; dir?: 'auto' | 'ltr' | 'rtl'; vazio?: boolean }) {
  if (vazio) return null
  return (
    <>
      <dt>{rotulo}</dt>
      <dd lang={lang} dir={dir}>{children}</dd>
    </>
  )
}

/**
 * A seção de objetos do detalhe: título, quantos são e a grade de cartões que levam ao item. `em(o)`: o sítio de onde o objeto
 * vem quando não é o da página (uma parte dele, Parte 2C, bloco 2): o cartão diz «em Área Teste BB».
 */
export function SecaoDeObjetos<T extends ObjetoResumo>({
  rotulo,
  titulo,
  objetos,
  computador,
  em,
}: {
  rotulo: string
  titulo: string
  objetos: T[]
  computador: boolean
  em?: (o: T) => string | null
}) {
  return (
    <section className="detalhe-secao" aria-label={rotulo}>
      <div className="detalhe-secao-topo">
        <h2>{titulo}</h2>
        <Contagem n={objetos.length} um="objeto" varios="objetos" className="codigo" />
      </div>
      {objetos.length === 0 ? (
        <p className="detalhe-vazio">Nenhum objeto.</p>
      ) : (
        <div className="detalhe-grade">
          {objetos.map((o) => (
            <CartaoDeObjeto key={o.numero} objeto={o} grande={computador} em={em?.(o) ?? undefined} />
          ))}
        </div>
      )}
    </section>
  )
}

/** O Voltar do topo do celular: o destino (`#/…`), o nome e, com uma origem (decisão 85), o clique que volta a ela. */
export interface VoltarDoTopo {
  href: string
  rotulo: string
  aoClicar?: (e: MouseEvent<HTMLAnchorElement>) => void
}

/**
 * Decisão 85 numa página de detalhe aberta de outra tela (Tarefa 14: a obra aberta da Revisão): com a origem leve no estado
 * do roteador, o Voltar do topo do celular volta a ela (como o do objeto), e `deOnde` vai à moldura, que mostra «‹ <origem>».
 * Sem origem, o Voltar de sempre (`padrao`).
 */
export function useVoltarDoDetalhe(padrao: { href: string; rotulo: string }): { voltar: VoltarDoTopo; deOnde: Origem | null } {
  const { state } = useLocation()
  const deOnde = voltarDaOrigem(state)
  const aoClicar = useAoVoltarParaOrigem(deOnde)
  return { voltar: deOnde ? { href: `#${deOnde.caminho}`, rotulo: rotuloDoIconeDeVoltar(deOnde), aoClicar } : padrao, deOnde }
}

interface Moldura {
  /** Celular: o detalhe é a página inteira, com o topo (Voltar e as ações). Computador: é o painel da direita. */
  pagina: boolean
  voltar: VoltarDoTopo
  /** De onde se veio (decisão 85; `useVoltarDoDetalhe`): o «‹ <origem>» antes do cabeçalho. */
  deOnde?: Origem | null
  /** Os ícones de ação do detalhe (buscar, copiar): no topo do celular; no computador, no cabeçalho. */
  acoes?: ReactNode
  /** O nome desta tela no «‹ …» dos objetos abertos daqui («Verbete: leão-de-teste»; decisão 85). */
  origem?: string | null
  children: ReactNode
}

/** A página do detalhe no celular, ou o painel dele no computador. */
export function MolduraDoDetalhe({ pagina, voltar, deOnde, acoes, origem, children }: Moldura) {
  const corpo = (
    <OrigemDosLinks rotulo={origem}>
      {deOnde && <VoltarDaOrigem voltar={deOnde} />}
      {children}
    </OrigemDosLinks>
  )
  return pagina ? (
    <div className="detalhe-pagina">
      <TopoDoCelular voltar={voltar} busca={acoes === undefined} acoes={acoes} />
      <main className="detalhe">{corpo}</main>
    </div>
  ) : (
    <div className="detalhe">{corpo}</div>
  )
}

interface Cabecalho {
  pagina: boolean
  etiqueta: string
  titulo: string
  codigo: string
  acoes: ReactNode
  tituloRef?: Ref<HTMLHeadingElement>
  /** Entre a etiqueta e o título (o caminho de uma parte até o todo, na página do sítio). */
  antesDoTitulo?: ReactNode
}

/** O cabeçalho do detalhe: etiqueta, título (h1 na página do celular, h2 no painel), código e, no computador, as ações. */
export function CabecalhoDoDetalhe({ pagina, etiqueta, titulo, codigo, acoes, tituloRef, antesDoTitulo }: Cabecalho) {
  const Titulo = pagina ? 'h1' : 'h2'
  return (
    <header className="detalhe-cabecalho">
      <div className="detalhe-titulos">
        <span className="detalhe-etiqueta">{etiqueta}</span>
        {antesDoTitulo}
        <Titulo className="detalhe-titulo" ref={tituloRef}>
          {titulo}
        </Titulo>
        <span className="codigo detalhe-codigo">{codigo}</span>
      </div>
      {!pagina && <div className="detalhe-acoes">{acoes}</div>}
    </header>
  )
}

/** O aviso quando o item não existe, com o caminho de volta à lista. */
export function NaoEncontrado({ pagina, voltar, titulo, destino, rotuloDoDestino }: Omit<Moldura, 'children'> & { titulo: string; destino: string; rotuloDoDestino: string }) {
  const Titulo = pagina ? 'h1' : 'h2'
  return (
    <MolduraDoDetalhe pagina={pagina} voltar={voltar}>
      <div className="detalhe-aviso">
        <Titulo className="detalhe-titulo">{titulo}</Titulo>
        <p>
          <Link to={destino}>{rotuloDoDestino}</Link>
        </p>
      </div>
    </MolduraDoDetalhe>
  )
}

/** Erro de leitura do banco dentro do detalhe. */
export function ErroNoDetalhe({ pagina, voltar, erro, aoTentar }: { pagina: boolean; voltar: VoltarDoTopo; erro: unknown; aoTentar?: () => void }) {
  return (
    <MolduraDoDetalhe pagina={pagina} voltar={voltar}>
      <div className="detalhe-aviso">
        <AvisoDeErro erro={erro} aoTentar={aoTentar} />
      </div>
    </MolduraDoDetalhe>
  )
}
