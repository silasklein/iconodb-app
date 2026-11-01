import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { lerParametros, montarParametros, caminhoDaBusca } from '../busca/url'
import { CampoDeBusca } from '../telas/CampoDeBusca'
import { Menu } from '../telas/Menu'
import { IconButton } from './IconButton'
import { Logo } from './Logo'
import { textoDePendencias, usePendencias } from './usePendencias'
import './BarraSuperior.css'

export const PLACEHOLDER_DA_BUSCA = 'termo, sítio ou número…'
const ESPERA_AO_DIGITAR_MS = 250

type Secao = 'colecoes' | 'glossario' | 'sitios' | 'bibliografia' | 'revisao'

/** A seção a que a tela pertence: Coleções vale também para os grupos, Glossário para os verbetes, e assim por diante. */
export function secaoDoCaminho(pathname: string): Secao | null {
  const primeiro = pathname.split('/')[1] ?? ''
  const mapa: Record<string, Secao> = {
    colecoes: 'colecoes',
    grupo: 'colecoes',
    glossario: 'glossario',
    verbete: 'glossario',
    sitios: 'sitios',
    sitio: 'sitios',
    bibliografia: 'bibliografia',
    obra: 'bibliografia',
    revisao: 'revisao',
  }
  return mapa[primeiro] ?? null
}

interface Props {
  /** Mostra o campo de busca ao centro (padrão). O Início do computador tem o próprio campo e o dispensa. */
  busca?: boolean
}

/**
 * A barra superior das telas de computador (48 px, PC-*): à esquerda o logo SKC (leva ao Início),
 * ao centro a busca sempre visível, à direita os ícones Coleções, Glossário, Sítios, Bibliografia,
 * Revisão (um ponto, com "<N> pendências" na dica) e Menu. Sem ícone de sincronização na 2A.
 *
 * Os atalhos `g` + letra valem no app todo (AtalhosGlobais). Na Busca, o campo da barra é o campo
 * da busca: digitar atualiza `q` no endereço (preservando escopo e filtros); nas outras telas,
 * Enter leva à Busca. A cor segue o tema da tela (branca nas de consulta, escura nas de item).
 */
export function BarraSuperior({ busca = true }: Props) {
  const { pathname } = useLocation()
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const pend = usePendencias()
  const secao = secaoDoCaminho(pathname)
  const [menu, setMenu] = useState<{ gatilho: HTMLElement | null } | null>(null)

  const naBusca = pathname === '/busca'
  const qDoEndereco = naBusca ? lerParametros(params).q : ''
  const [texto, setTexto] = useState(qDoEndereco)
  const ultimoEnviado = useRef(qDoEndereco)
  // O endereço mudou por fora (voltar, limpar filtros, sair da Busca): o campo acompanha.
  useEffect(() => {
    if (qDoEndereco !== ultimoEnviado.current) {
      ultimoEnviado.current = qDoEndereco
      setTexto(qDoEndereco)
    }
  }, [qDoEndereco])

  // Lê os parâmetros de agora, na hora de gravar: a espera de digitação não desfaz o que outro toque mudou.
  const gravar = useRef((_q: string) => {})
  gravar.current = (q: string) => {
    if (!naBusca) return // nunca escreve ?q= numa rota que não é a Busca (derrubaria ?obra= e afins)
    ultimoEnviado.current = q
    setParams((anterior) => montarParametros({ ...lerParametros(anterior), q }), { replace: true })
  }
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Trocar de tela cancela a espera pendente (e o desmonte também).
  useEffect(() => () => clearTimeout(espera.current), [pathname])

  const aoMudar = (novo: string) => {
    setTexto(novo)
    if (!naBusca) return
    clearTimeout(espera.current)
    espera.current = setTimeout(() => gravar.current(novo), novo === '' ? 0 : ESPERA_AO_DIGITAR_MS)
  }
  const aoEnviar = (enviado: string) => {
    clearTimeout(espera.current)
    if (naBusca) gravar.current(enviado)
    else navegar(caminhoDaBusca(enviado))
  }

  const rotuloDaRevisao = pend && pend.total > 0 ? `Revisão, ${textoDePendencias(pend.total)}` : 'Revisão'
  const secoes: { icone: 'colecoes' | 'glossario' | 'sitios' | 'bibliografia'; rotulo: string; chave: Secao; atalho: string }[] = [
    { icone: 'colecoes', rotulo: 'Coleções', chave: 'colecoes', atalho: 'g c' },
    { icone: 'glossario', rotulo: 'Glossário', chave: 'glossario', atalho: 'g l' },
    { icone: 'sitios', rotulo: 'Sítios', chave: 'sitios', atalho: 'g s' },
    { icone: 'bibliografia', rotulo: 'Bibliografia', chave: 'bibliografia', atalho: 'g b' },
  ]

  return (
    <header className="barra-superior">
      <div className="barra-esquerda">
        <a className="barra-logo tip-start" href="#/" aria-label="Início" data-tip="Início (g i)" aria-keyshortcuts="g i">
          <Logo scale={2} tone="atual" />
        </a>
      </div>
      <div className="barra-centro">
        {busca && (
          <CampoDeBusca
            id="busca-barra"
            variante="barra"
            valor={texto}
            aoMudar={aoMudar}
            aoEnviar={aoEnviar}
            placeholder={PLACEHOLDER_DA_BUSCA}
            atalho
          />
        )}
      </div>
      <nav className="barra-direita" aria-label="Navegação">
        {secoes.map((s) => (
          <IconButton key={s.chave} icon={s.icone} label={s.rotulo} shortcut={s.atalho} href={`#/${s.chave}`} atual={secao === s.chave} />
        ))}
        <IconButton
          icon="revisao"
          label={rotuloDaRevisao}
          shortcut="g r"
          href="#/revisao"
          atual={secao === 'revisao'}
          ponto={pend !== null && pend.total > 0}
        />
        <IconButton
          icon="menu"
          label="Menu"
          size={22}
          expandido={menu !== null}
          abre="dialog"
          onClick={(e) => setMenu({ gatilho: e.currentTarget })}
        />
      </nav>
      {menu && <Menu variante="popover" gatilho={menu.gatilho} aoFechar={() => setMenu(null)} />}
    </header>
  )
}
