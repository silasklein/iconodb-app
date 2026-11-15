import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { LinkComOrigem, OrigemDosLinks } from '../app/OrigemDosLinks'
import { estadoDoGrupo } from '../app/origem'
import { usarMotor } from '../banco/cliente'
import { estadoDoResultado } from '../busca/url'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Item } from './Item'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
// CA00004 sem grupo nenhum (como objetos do livro que não estão em grupo): o caso do «Voltar às coleções».
vi.mock('../banco/consultas', async (original) => {
  const m = await original<typeof import('../banco/consultas')>()
  return {
    ...m,
    item: async (n: string) => {
      const d = await m.item(n)
      return d && d.numero === 'CA00004' ? { ...d, grupos: [], noLivro: [] } : d
    },
  }
})

const VERBETE = { rotulo: 'Verbete: leão-de-teste', caminho: '/verbete/GL-900001' }

/** O endereço e o estado de agora. */
function Local() {
  const { pathname, search, state } = useLocation()
  return <output data-testid="local" data-state={JSON.stringify(state ?? null)}>{`${pathname}${search}`}</output>
}
const local = () => screen.getByTestId('local').textContent

function Origem() {
  const { pathname } = useLocation()
  return <h1>Origem {pathname}</h1>
}

/** Abre o item depois de `antes` (entradas anteriores do histórico), com o estado dado. */
function abrir(caminho: string, state?: unknown, antes: string[] = []) {
  const [pathname, search] = caminho.split('?')
  return render(
    <MemoryRouter initialEntries={[...antes, { pathname: pathname!, search: search ? `?${search}` : '', state }]} initialIndex={antes.length}>
      <Routes>
        <Route path="/item/:numero" element={<Item />} />
        <Route path="*" element={<Origem />} />
      </Routes>
      <Local />
    </MemoryRouter>,
  )
}

describe('a página do objeto volta à tela de onde se veio (decisão 85)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterAll(() => usarMotor(null))
  afterEach(() => instalarMatchMedia(375))

  describe.each([
    ['celular', 375],
    ['computador', 1280],
  ] as const)('%s', (aparelho, largura) => {
    beforeEach(() => instalarMatchMedia(largura))

    it('vindo de um verbete: «‹ Verbete: …», com o «‹» fora do nome, volta no histórico com a hipótese', async () => {
      abrir('/item/CA00001?hipotese=HY-900001', { voltar: VERBETE }, ['/verbete/GL-900001'])
      const origem = await screen.findByRole('navigation', { name: 'Origem' })
      const link = within(origem).getByRole('link', { name: 'Verbete: leão-de-teste' })
      expect(link).toHaveTextContent(/^‹\s*Verbete: leão-de-teste$/)
      expect(link.querySelector('[aria-hidden="true"]')).toHaveTextContent('‹')
      expect(link).toHaveAttribute('href', '/verbete/GL-900001')
      if (aparelho === 'celular') {
        // o ícone do topo diz a origem e faz o mesmo
        expect(screen.getByRole('link', { name: 'Voltar (Verbete: leão-de-teste)' })).toHaveAttribute('href', '#/verbete/GL-900001')
        expect(screen.queryByRole('link', { name: 'Voltar ao grupo' })).toBeNull()
      } else {
        // no computador, na linha de cima da coluna da leitura, antes das ações
        const topo = origem.parentElement!
        expect(topo).toHaveClass('item-topo-pc')
        expect(within(topo).getByRole('toolbar', { name: 'Ações do item' })).toBeInTheDocument()
      }
      await userEvent.click(link)
      await waitFor(() => expect(local()).toBe('/verbete/GL-900001'))
      expect(screen.getByRole('heading', { name: 'Origem /verbete/GL-900001' })).toBeInTheDocument()
    })

    it('o anterior e o próximo do grupo levam a origem adiante (replace)', async () => {
      abrir('/item/CA00001', { voltar: VERBETE }, ['/verbete/GL-900001'])
      const nav = await screen.findByRole('navigation', { name: 'Posição no grupo' })
      await userEvent.click(await within(nav).findByRole('link', { name: 'Próximo: CA00002' }))
      await waitFor(() => expect(local()).toBe('/item/CA00002'))
      expect(JSON.parse(screen.getByTestId('local').dataset.state!).voltar).toEqual(VERBETE)
      await userEvent.click(await within(await screen.findByRole('navigation', { name: 'Origem' })).findByRole('link', { name: 'Verbete: leão-de-teste' }))
      // a troca foi replace: o voltar chega ao verbete, não ao vizinho
      await waitFor(() => expect(local()).toBe('/verbete/GL-900001'))
    })

    it('sem entrada anterior (o estado ficou, mas a origem não está atrás): vai ao caminho', async () => {
      abrir('/item/CA00001', { voltar: VERBETE })
      await userEvent.click(within(await screen.findByRole('navigation', { name: 'Origem' })).getByRole('link', { name: 'Verbete: leão-de-teste' }))
      await waitFor(() => expect(local()).toBe('/verbete/GL-900001'))
    })

    it('da Busca: «‹ Busca», além da posição na busca', async () => {
      abrir('/item/CA00001', estadoDoResultado(['CA00001', 'CA00002'], '/busca?q=teste'), ['/busca?q=teste'])
      expect(within(await screen.findByRole('navigation', { name: 'Origem' })).getByRole('link', { name: 'Busca' })).toHaveAttribute('href', '/busca?q=teste')
      expect(await screen.findByRole('navigation', { name: 'Posição na busca' })).toBeInTheDocument()
      if (aparelho === 'celular') expect(screen.getByRole('link', { name: 'Voltar à busca' })).toHaveAttribute('href', '#/busca?q=teste')
    })

    it('do grupo: nada muda (sem «‹ …»; o voltar é o do grupo)', async () => {
      abrir('/item/CA00001', estadoDoGrupo('GR-TESTE-I-01', 'G', '/grupo/GR-TESTE-I-01'), ['/grupo/GR-TESTE-I-01'])
      expect(await screen.findByRole('navigation', { name: 'Posição no grupo' })).toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Origem' })).toBeNull()
      if (aparelho === 'celular') expect(screen.getByRole('link', { name: 'Voltar ao grupo' })).toBeInTheDocument()
    })

    it('link direto, sem origem no app: como antes («Voltar às coleções» no celular; nada no computador)', async () => {
      abrir('/item/CA00004?hipotese=HY-900008')
      await screen.findByTestId('item-cabeca')
      expect(screen.queryByRole('navigation', { name: 'Origem' })).toBeNull()
      expect(screen.queryByRole('navigation', { name: /^Posição/ })).toBeNull()
      if (aparelho === 'celular') expect(screen.getByRole('link', { name: 'Voltar às coleções' })).toHaveAttribute('href', '#/colecoes')
      else expect(screen.queryByRole('link', { name: /Voltar/ })).toBeNull()
    })

    it('um estado com `voltar` ruim é ignorado', async () => {
      abrir('/item/CA00004', { voltar: { rotulo: 'Fora', caminho: 'https://outro.site/' } })
      await screen.findByTestId('item-cabeca')
      expect(screen.queryByRole('navigation', { name: 'Origem' })).toBeNull()
    })
  })
})

describe('OrigemDosLinks e LinkComOrigem', () => {
  function Tela() {
    return (
      <OrigemDosLinks rotulo="Sítio: Tel Teste">
        <LinkComOrigem to="/item/CA00001">objeto</LinkComOrigem>
        <LinkComOrigem to={{ pathname: '/item/CA00002', search: '?hipotese=HY-1' }} state={{ a: 1 }}>
          hipótese
        </LinkComOrigem>
        <LinkComOrigem to="/verbete/GL-1">verbete</LinkComOrigem>
      </OrigemDosLinks>
    )
  }
  function Fora() {
    return <LinkComOrigem to="/item/CA00003">fora</LinkComOrigem>
  }
  const montar = () =>
    render(
      <MemoryRouter initialEntries={['/sitio/TESTE-1?parte=2']}>
        <Routes>
          <Route
            path="/sitio/:id"
            element={
              <>
                <Tela />
                <Fora />
                <Link to="/x">x</Link>
              </>
            }
          />
          <Route path="*" element={<p>longe</p>} />
        </Routes>
        <Local />
      </MemoryRouter>,
    )
  const estado = () => JSON.parse(screen.getByTestId('local').dataset.state!)

  it('os links para objetos levam a origem (com o `?…` da tela), junto do estado que já tinham', async () => {
    montar()
    await userEvent.click(screen.getByRole('link', { name: 'objeto' }))
    expect(local()).toBe('/item/CA00001')
    expect(estado()).toEqual({ voltar: { rotulo: 'Sítio: Tel Teste', caminho: '/sitio/TESTE-1?parte=2' } })
  })

  it('o estado de antes fica', async () => {
    montar()
    await userEvent.click(screen.getByRole('link', { name: 'hipótese' }))
    expect(local()).toBe('/item/CA00002?hipotese=HY-1')
    expect(estado()).toEqual({ a: 1, voltar: { rotulo: 'Sítio: Tel Teste', caminho: '/sitio/TESTE-1?parte=2' } })
  })

  it('o que não vai a um objeto, ou fica fora da tela de origem, não leva nada', async () => {
    montar()
    await userEvent.click(screen.getByRole('link', { name: 'verbete' }))
    expect(estado()).toBeNull()
  })

  it('fora de uma tela de origem, nada', async () => {
    montar()
    await userEvent.click(screen.getByRole('link', { name: 'fora' }))
    expect(local()).toBe('/item/CA00003')
    expect(estado()).toBeNull()
  })
})
