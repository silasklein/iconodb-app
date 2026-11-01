import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { AppRoutes } from './routes'
import { useRestaurarRolagem } from './useRestaurarRolagem'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('./RotaInicial', () => ({ RotaInicial: ({ children }: { children: React.ReactNode }) => children }))

let y = 0
let altura = 5000
const rolar = vi.mocked(window.scrollTo)
let ir: NavigateFunction

function Captura() {
  ir = useNavigate()
  return null
}
function Raiz() {
  useRestaurarRolagem()
  return (
    <Routes>
      <Route path="/lista" element={<p>lista</p>} />
      <Route path="/detalhe" element={<p>detalhe</p>} />
    </Routes>
  )
}

/** O usuário rola até `posicao`: o navegador muda scrollY e avisa. */
function rolarAte(posicao: number) {
  y = posicao
  fireEvent.scroll(window)
}
const chamadas = () => rolar.mock.calls.map((c) => [...c])

beforeEach(() => {
  y = 0
  altura = 5000
  sessionStorage.clear()
  rolar.mockReset()
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y })
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => altura })
})
afterEach(() => instalarMatchMedia(375))

describe('useRestaurarRolagem (telas de mentira)', () => {
  function abrir(url = '/lista') {
    render(
      <MemoryRouter initialEntries={[url]}>
        <Captura />
        <Raiz />
      </MemoryRouter>,
    )
  }

  it('a primeira tela não rola; ir a outra tela vai ao topo; voltar restaura a posição da lista', async () => {
    abrir()
    expect(chamadas()).toEqual([])
    rolarAte(900)
    act(() => void ir('/detalhe'))
    expect(chamadas()).toEqual([[0, 0]])
    y = 0
    act(() => void ir(-1))
    await waitFor(() => expect(chamadas()).toEqual([[0, 0], [0, 900]]))
  })

  it('mudar só o ?… da mesma tela (replace ou push) não mexe na rolagem', () => {
    abrir()
    rolarAte(600)
    act(() => void ir('/lista?filtro=a', { replace: true }))
    act(() => void ir('/lista?filtro=ab', { replace: true }))
    act(() => void ir('/lista?filtro=abc'))
    expect(chamadas()).toEqual([])
  })

  it('a posição de uma tela abaixo do replace continua a da própria entrada', async () => {
    abrir()
    rolarAte(700)
    act(() => void ir('/lista?filtro=a', { replace: true }))
    act(() => void ir('/detalhe'))
    y = 0
    act(() => void ir(-1))
    await waitFor(() => expect(chamadas().at(-1)).toEqual([0, 700]))
  })

  it('espera a página ficar alta (as listas chegam depois) antes de restaurar', async () => {
    abrir()
    rolarAte(1500)
    act(() => void ir('/detalhe'))
    y = 0
    altura = 800 // ainda carregando: pouca altura
    rolar.mockClear()
    act(() => void ir(-1))
    await new Promise((r) => setTimeout(r, 120))
    expect(chamadas()).toEqual([])
    altura = 5000
    await waitFor(() => expect(chamadas()).toEqual([[0, 1500]]))
  })

  it('sem a página ficar alta, depois de ~1 s restaura o que der', async () => {
    abrir()
    rolarAte(1500)
    act(() => void ir('/detalhe'))
    y = 0
    altura = 800
    rolar.mockClear()
    act(() => void ir(-1))
    await waitFor(() => expect(chamadas()).toEqual([[0, 1500]]), { timeout: 2500 })
  })

  it('quem rola na espera cancela a restauração', async () => {
    abrir()
    rolarAte(1500)
    act(() => void ir('/detalhe'))
    y = 0
    altura = 800
    rolar.mockClear()
    act(() => void ir(-1))
    fireEvent.wheel(window)
    altura = 5000
    await new Promise((r) => setTimeout(r, 150))
    expect(chamadas()).toEqual([])
  })

  it('ao sair da tela a posição fica guardada na sessão (é de onde uma página recarregada a lê)', async () => {
    abrir()
    rolarAte(840)
    act(() => void ir('/detalhe'))
    // a "nova sessão" lê o que ficou guardado, para a mesma chave de entrada (a inicial é "default")
    const guardado = JSON.parse(sessionStorage.getItem('iconodb:rolagem')!)
    expect(Object.values(guardado)).toContain(840)
  })

  it('um REPLACE na mesma tela (as letras do filtro) não deixa entradas de lixo na sessão', () => {
    abrir()
    rolarAte(600)
    act(() => void ir('/lista?filtro=a', { replace: true }))
    act(() => void ir('/lista?filtro=ab', { replace: true }))
    act(() => void ir('/lista?filtro=abc', { replace: true }))
    expect(sessionStorage.getItem('iconodb:rolagem')).toBeNull()
    act(() => void ir('/detalhe'))
    // só a entrada que de fato fica no histórico (a última) foi guardada
    expect(Object.values(JSON.parse(sessionStorage.getItem('iconodb:rolagem')!))).toEqual([600])
  })

  it('o scroll cortado durante a restauração não sobrescreve o alvo guardado', async () => {
    abrir()
    rolarAte(1500)
    act(() => void ir('/detalhe'))
    y = 0
    altura = 800 // a lista ainda não chegou
    act(() => void ir(-1))
    y = 300 // o navegador corta a posição à altura da página curta e avisa
    fireEvent.scroll(window)
    act(() => void ir('/detalhe'))
    expect(JSON.parse(sessionStorage.getItem('iconodb:rolagem')!)).toMatchObject({ default: 1500 })
  })

  it('passado 1 s sem a página crescer, o alvo continua sendo o guardado (o scrollY cortado só vale quando a pessoa rola)', async () => {
    abrir()
    rolarAte(1500)
    act(() => void ir('/detalhe'))
    y = 0
    altura = 800
    rolar.mockClear()
    act(() => void ir(-1))
    await waitFor(() => expect(chamadas()).toEqual([[0, 1500]]), { timeout: 2500 })
    y = 700 // o que coube
    fireEvent.scroll(window)
    act(() => void ir('/detalhe'))
    expect(JSON.parse(sessionStorage.getItem('iconodb:rolagem')!)).toMatchObject({ default: 1500 })
  })

  it('quem rola na espera assume a posição: vale onde ele parou, não o alvo', async () => {
    abrir()
    rolarAte(1500)
    act(() => void ir('/detalhe'))
    y = 0
    altura = 800
    act(() => void ir(-1))
    fireEvent.wheel(window)
    y = 420
    fireEvent.scroll(window)
    act(() => void ir('/detalhe'))
    expect(JSON.parse(sessionStorage.getItem('iconodb:rolagem')!)).toMatchObject({ default: 420 })
  })

  it('ao fechar a aba (pagehide) a posição da entrada corrente fica guardada', () => {
    abrir()
    rolarAte(555)
    fireEvent(window, new Event('pagehide'))
    expect(JSON.parse(sessionStorage.getItem('iconodb:rolagem')!)).toMatchObject({ default: 555 })
  })

  it('sessionStorage indisponível não quebra a navegação', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    abrir()
    rolarAte(100)
    expect(() => act(() => void ir('/detalhe'))).not.toThrow()
    expect(screen.getByText('detalhe')).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})

describe('useRestaurarRolagem no app: lista longa → detalhe → voltar', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    usarFoldDoPacoteSintetico()
  })
  afterAll(() => usarMotor(null))

  it('o Glossário volta à posição de onde se abriu o verbete', async () => {
    render(
      <MemoryRouter initialEntries={['/glossario']}>
        <Captura />
        <AppRoutes />
      </MemoryRouter>,
    )
    await screen.findAllByRole('link', { name: /Tell Probe Teste/ })
    rolarAte(1200)
    await userEvent.click(screen.getAllByRole('link', { name: /Tell Probe Teste/ })[0]!)
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })).toBeInTheDocument()
    expect(chamadas().at(-1)).toEqual([0, 0])
    y = 0
    act(() => void ir(-1))
    await screen.findAllByRole('link', { name: /Tell Probe Teste/ })
    await waitFor(() => expect(chamadas().at(-1)).toEqual([0, 1200]))
  })
})

describe('useRestaurarRolagem no app: o Voltar da tela e o fechar do visualizador', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    usarFoldDoPacoteSintetico()
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterAll(() => usarMotor(null))

  function app(url: string) {
    render(
      <MemoryRouter initialEntries={[url]}>
        <Captura />
        <AppRoutes />
        <Endereco />
      </MemoryRouter>,
    )
  }
  const Endereco = () => {
    const { pathname, search } = useLocation()
    return <output data-testid="endereco">{`${pathname}${search}`}</output>
  }
  const linhas = () => document.querySelectorAll<HTMLAnchorElement>('a.lista-linha')

  it('o Voltar na tela do verbete é um voltar de verdade: a lista reaparece na posição e com o ?filtro=', async () => {
    app('/glossario?filtro=leao')
    await waitFor(() => expect(linhas().length).toBeGreaterThan(0))
    rolarAte(1200)
    await userEvent.click(linhas()[0]!)
    await screen.findByRole('link', { name: 'Voltar ao glossário' })
    expect(chamadas().at(-1)).toEqual([0, 0])
    y = 0
    await userEvent.click(screen.getByRole('link', { name: 'Voltar ao glossário' }))
    await waitFor(() => expect(linhas().length).toBeGreaterThan(0))
    expect(screen.getByTestId('endereco')).toHaveTextContent('/glossario?filtro=leao')
    await waitFor(() => expect(chamadas().at(-1)).toEqual([0, 1200]))
  })

  it('o Voltar de um link direto (sem entrada anterior) leva ao destino, trocando a entrada', async () => {
    app('/verbete/ZZ-nao-existe')
    await userEvent.click(await screen.findByRole('link', { name: 'Voltar ao glossário' }))
    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent('/glossario'))
    act(() => void ir(-1)) // não há nada atrás: continua no glossário
    expect(screen.getByTestId('endereco')).toHaveTextContent('/glossario')
  })

  it('fechar o visualizador devolve o item à posição em que estava', async () => {
    app('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    rolarAte(700)
    await userEvent.click(await screen.findByRole('link', { name: 'Ampliar a imagem' }))
    await waitFor(() => expect(document.querySelector('.vis-figura img')).not.toBeNull())
    expect(screen.getByTestId('endereco')).toHaveTextContent('/imagem/')
    y = 0
    await userEvent.keyboard('{Escape}')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByTestId('endereco')).toHaveTextContent('/item/CA00001')
    await waitFor(() => expect(chamadas().at(-1)).toEqual([0, 700]))
  })
})
