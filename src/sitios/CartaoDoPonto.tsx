import { forwardRef, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { sitio } from '../banco/consultas'
import { MiniaturaDoObjeto } from '../imagens-usuario/MiniaturaDoObjeto'
import { useObjetosDoSitio } from '../telas/Sitio'
import { coordenadaAte5, coordenadaEmGraus } from '../telas/coordenada'
import { Icon } from '../ui/Icon'
import { numeroPtBr } from '../ui/numero'
import { useCarregar } from '../ui/useCarregar'
import type { ObjetoResumo } from '../banco/tipos'
import { eSitioSkc } from './modelo'
import type { PontoDoMapa, SitioNoMapa } from './mapa'
import { nomeDaRegiao } from './regioes'
import './CartaoDoPonto.css'

const SEM_OBJETOS: readonly ObjetoResumo[] = []
const objetosEm = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'objeto' : 'objetos'}`

interface Props {
  ponto: PontoDoMapa
  /** Computador: o cartão flutuante ao lado do ponto. Celular: a folha de baixo. */
  computador: boolean
  aoFechar: () => void
  estilo?: CSSProperties
}

/**
 * O cartão de um ponto do mapa (SitiosMapa.dc.html, PC-SitiosMapa.dc.html): o nome, a coordenada, a região e os objetos, as
 * miniaturas e «Abrir sítio». GENÉRICO sobre «a lista de sítios neste ponto» (decisão 49): um ponto com vários sítios (mesma
 * coordenada) lista cada um com as suas miniaturas e o seu «Abrir sítio»; quando a Parte 2C mesclar sítios, o cartão continua
 * lendo só `ponto.sitios`. O foco vai ao primeiro «Abrir sítio» ao abrir.
 */
export const CartaoDoPonto = forwardRef<HTMLDivElement, Props>(function CartaoDoPonto({ ponto, computador, aoFechar, estilo }, ref) {
  const varios = ponto.sitios.length > 1
  const primeiro = ponto.sitios[0]!
  const doUsuario = ponto.sitios.every((s) => s.doUsuario)
  const coordenada = doUsuario ? coordenadaAte5(ponto.lat, ponto.lon) : coordenadaEmGraus(ponto.lat, ponto.lon, 3)
  const Titulo = computador ? 'span' : 'h2'
  return (
    <div ref={ref} className={`cartao-ponto${computador ? ' cartao-ponto-flutuante' : ' cartao-ponto-folha'}`} role="dialog" aria-label={`Sítio selecionado: ${ponto.nome}`} style={estilo}>
      {!computador && <span className="cartao-ponto-alca" aria-hidden="true" />}
      <div className="cartao-ponto-topo">
        <div className="cartao-ponto-titulos">
          <Titulo className="cartao-ponto-nome">{ponto.nome}</Titulo>
          <span className="cartao-ponto-coord">{coordenada}</span>
          <span className="cartao-ponto-sub">
            {varios ? `${numeroPtBr(ponto.sitios.length)} sítios neste ponto` : nomeDaRegiao(primeiro.regiao)} · {objetosEm(ponto.objetos)}
          </span>
        </div>
        <button type="button" className="cartao-ponto-fechar" aria-label="Fechar" data-tip={computador ? 'Fechar (Esc)' : 'Fechar'} aria-keyshortcuts="Escape" onClick={aoFechar}>
          <Icon name="fechar" size={18} />
        </button>
      </div>
      {ponto.sitios.map((s) => (
        <SitioDoCartao key={s.id} sitio={s} comTitulo={varios} computador={computador} />
      ))}
    </div>
  )
})

/** Um sítio do ponto: as miniaturas dos objetos e o «Abrir sítio». */
function SitioDoCartao({ sitio: s, comTitulo, computador }: { sitio: SitioNoMapa; comTitulo: boolean; computador: boolean }) {
  const ehNovo = eSitioSkc(s.id)
  const carga = useCarregar(() => (ehNovo ? Promise.resolve(null) : sitio(s.id)), s.id)
  const livro = carga.fase === 'ok' ? carga.dados : null
  const objetos = useObjetosDoSitio(s.id, livro?.objetos ?? SEM_OBJETOS)
  const mostrados = computador ? objetos.slice(0, 4) : objetos
  const mais = objetos.length - mostrados.length
  return (
    <div className="cartao-ponto-sitio">
      {comTitulo && (
        <p className="cartao-ponto-sitio-nome">
          {s.nome}
          <span> · {objetosEm(s.objetos)}</span>
        </p>
      )}
      {carga.fase === 'erro' ? (
        <p className="cartao-ponto-vazio">Não foi possível ler os objetos deste sítio.</p>
      ) : (
        <ul className="cartao-ponto-miniaturas" aria-label={`Objetos de ${s.nome}`}>
          {mostrados.map((o) => (
            <li key={o.numero}>
              <Link className="cartao-ponto-miniatura" to={`/item/${encodeURIComponent(o.numero)}`} aria-label={`Abrir ${o.semNumero ? (o.tipo ?? 'objeto sem número') : o.numero}`}>
                <span className="cartao-ponto-imagem">
                  <MiniaturaDoObjeto numero={o.skc ? o.itemId : o.numero} caminho={o.miniatura} alt="" />
                </span>
                {!computador && <span className="cartao-ponto-codigo">{o.semNumero ? '—' : o.numero}</span>}
              </Link>
            </li>
          ))}
          {mais > 0 && (
            <li>
              <Link className="cartao-ponto-miniatura cartao-ponto-mais" to={`/sitio/${encodeURIComponent(s.id)}`} aria-label={`Ver os ${numeroPtBr(objetos.length)} objetos`}>
                +{numeroPtBr(mais)}
              </Link>
            </li>
          )}
        </ul>
      )}
      {carga.fase !== 'erro' && objetos.length === 0 && carga.fase === 'ok' && <p className="cartao-ponto-vazio">Nenhum objeto neste sítio.</p>}
      <Link className="cartao-ponto-abrir" to={`/sitio/${encodeURIComponent(s.id)}`} aria-label={comTitulo ? `Abrir sítio ${s.nome}` : undefined} data-abrir="">
        Abrir sítio
        {computador && !comTitulo && (
          <span className="cartao-ponto-tecla" aria-hidden="true">
            Enter
          </span>
        )}
        {!computador && <Icon name="proximo" size={18} />}
      </Link>
    </div>
  )
}
