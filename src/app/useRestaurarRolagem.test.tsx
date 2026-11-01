import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { AppRoutes } from './routes'
import { useRestaurarRolagem } from './useRestaurarRolagem'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async () => null) }))
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
