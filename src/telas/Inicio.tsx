import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { useIrParaBusca } from '../busca/useIrParaBusca'
import { contagens, grupos } from '../banco/consultas'
import { IconButton } from '../ui/IconButton'
import { ImagemDeCapa } from '../ui/ImagemDeCapa'
import { Logo } from '../ui/Logo'
import { useBreakpoint } from '../ui/useBreakpoint'
import { useCarregar } from '../ui/useCarregar'
import { numeroPtBr } from '../ui/usePendencias'
import { PLACEHOLDER_DA_BUSCA } from '../ui/BarraSuperior'
import { CampoDeBusca } from './CampoDeBusca'
import { Menu } from './Menu'
import './Inicio.css'

const ENTRADAS: { rotulo: string; para: string }[] = [
  { rotulo: 'Coleções', para: '/colecoes' },
  { rotulo: 'Glossário', para: '/glossario' },
  { rotulo: 'Sítios', para: '/sitios' },
  { rotulo: 'Bibliografia', para: '/bibliografia' },
  { rotulo: 'Minhas notas', para: '/notas' },
]

/**
 * O Início (Main.dc.html no celular, PC-Inicio.dc.html no computador). Um só componente:
 * no celular o topo (logo, lupa, menu) é da tela; no computador é a barra superior.
 * A imagem decorativa é a capa do primeiro grupo do pacote (dado do pacote, nunca do código).
 */
export function Inicio() {
  const computador = useBreakpoint() === 'computador'
  const irParaBusca = useIrParaBusca()
  const [texto, setTexto] = useState('')
  const [menu, setMenu] = useState<{ gatilho: HTMLElement | null } | null>(null)
  const campo = useRef<HTMLDivElement>(null)

  const carga = useCarregar(async () => {
    const [c, g] = await Promise.all([contagens(), grupos()])
    return { contagens: c, capa: g[0]?.capa ?? null }
  })
  const dados = carga.fase === 'ok' ? carga.dados : null
  const valor = (n: number | undefined) => (n === undefined ? '—' : numeroPtBr(n))

  return (
    <div className="inicio">
      <div className="inicio-capa" aria-hidden="true">
        <ImagemDeCapa caminho={dados?.capa?.miniatura ?? null} />
      </div>

      {!computador && (
        <header className="inicio-topo">
          <Logo scale={2} tone="light" />
          <div className="inicio-topo-icones">
            <IconButton
              icon="buscar"
              label="Buscar"
              shortcut="/"
              onClick={() => campo.current?.querySelector('input')?.focus()}
            />
            <IconButton
              icon="menu"
              label="Abrir o menu"
              size={22}
              expandido={menu !== null}
              abre="dialog"
              onClick={(e) => setMenu({ gatilho: e.currentTarget })}
            />
          </div>
        </header>
      )}

      <main className="inicio-principal">
        <div className="inicio-titulo">
          <h1>Iconografia do Levante antigo</h1>
          <span className="inicio-filete" aria-hidden="true" />
        </div>

        <dl className="inicio-contagens" role="group" aria-label="O que há no banco">
          <div>
            <dt>Objetos</dt>
            <dd>{valor(dados?.contagens.objetos)}</dd>
          </div>
          <div>
            <dt>Hipóteses</dt>
            <dd>{valor(dados?.contagens.hipoteses)}</dd>
          </div>
          <div>
            <dt>Verbetes</dt>
            <dd>{valor(dados?.contagens.verbetes)}</dd>
          </div>
        </dl>

        <div ref={campo}>
          <CampoDeBusca
            id="busca-inicio"
            variante={computador ? 'inicio' : 'pagina'}
            valor={texto}
            aoMudar={setTexto}
            aoEnviar={irParaBusca}
            placeholder={PLACEHOLDER_DA_BUSCA}
            atalho
          />
        </div>

        <p className="inicio-resumo">Do Natufiano ao Bronze Antigo. Leituras das fontes em alemão, com tradução em português.</p>

        <nav aria-label="Entradas" className="inicio-entradas">
          {ENTRADAS.map((e) => (
            <Link key={e.para} className="hit" to={e.para}>
              {e.rotulo}
            </Link>
          ))}
        </nav>
      </main>

      {menu && <Menu variante="folha" gatilho={menu.gatilho} aoFechar={() => setMenu(null)} />}
    </div>
  )
}
