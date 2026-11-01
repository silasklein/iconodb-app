import type { ReactNode, Ref } from 'react'
import { Link } from 'react-router'
import type { ObjetoResumo } from '../banco/tipos'
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

/** A seção de objetos do detalhe: título, quantos são e a grade de cartões que levam ao item. */
export function SecaoDeObjetos({ rotulo, titulo, objetos, computador }: { rotulo: string; titulo: string; objetos: ObjetoResumo[]; computador: boolean }) {
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
            <CartaoDeObjeto key={o.numero} objeto={o} grande={computador} />
          ))}
        </div>
      )}
    </section>
  )
}

interface Moldura {
  /** Celular: o detalhe é a página inteira, com o topo (Voltar e as ações). Computador: é o painel da direita. */
  pagina: boolean
  voltar: { href: string; rotulo: string }
  /** Os ícones de ação do detalhe (buscar, copiar): no topo do celular; no computador, no cabeçalho. */
  acoes?: ReactNode
  children: ReactNode
}

/** A página do detalhe no celular, ou o painel dele no computador. */
export function MolduraDoDetalhe({ pagina, voltar, acoes, children }: Moldura) {
  return pagina ? (
    <div className="detalhe-pagina">
      <TopoDoCelular voltar={voltar} busca={acoes === undefined} acoes={acoes} />
      <main className="detalhe">{children}</main>
    </div>
  ) : (
    <div className="detalhe">{children}</div>
  )
}

interface Cabecalho {
  pagina: boolean
  etiqueta: string
  titulo: string
  codigo: string
  acoes: ReactNode
  tituloRef?: Ref<HTMLHeadingElement>
}

/** O cabeçalho do detalhe: etiqueta, título (h1 na página do celular, h2 no painel), código e, no computador, as ações. */
export function CabecalhoDoDetalhe({ pagina, etiqueta, titulo, codigo, acoes, tituloRef }: Cabecalho) {
  const Titulo = pagina ? 'h1' : 'h2'
  return (
    <header className="detalhe-cabecalho">
      <div className="detalhe-titulos">
        <span className="detalhe-etiqueta">{etiqueta}</span>
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
export function ErroNoDetalhe({ pagina, voltar, erro }: { pagina: boolean; voltar: { href: string; rotulo: string }; erro: unknown }) {
  return (
    <MolduraDoDetalhe pagina={pagina} voltar={voltar}>
      <div className="detalhe-aviso">
        <AvisoDeErro erro={erro} />
      </div>
    </MolduraDoDetalhe>
  )
}
