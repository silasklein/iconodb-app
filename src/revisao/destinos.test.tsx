/**
 * Os destinos das ações da Revisão (`?corrigir=`): o objeto abre já no que falta (a folha do sítio, a ficha no Sítio, a escolha do
 * período), e voltar à Revisão encontra os grupos abertos e a rolagem. Pacote sintético.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { AppRoutes } from '../app/routes'
import { executar, usarMotor } from '../banco/cliente'
import { numerosDosObjetos } from '../banco/consultas'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from '../objetos-skc/pacote'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { estadoAtual, registrar } from '../usuario/estado'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../app/RotaInicial', () => ({ RotaInicial: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../pacote/local', async (original) => {
  const real = await original<typeof import('../pacote/local')>()
  return { ...real, lerEstado: vi.fn(async (armazem?: Parameters<typeof real.lerEstado>[0]) => (await real.lerEstado(armazem).catch(() => null)) ?? ({ schema: 5 } as never)) }
})

let ir: NavigateFunction
let y = 0
function Captura() {
  ir = useNavigate()
  const { pathname, search } = useLocation()
  return <output data-testid="endereco">{`${pathname}${search}`}</output>
}
const endereco = () => screen.getByTestId('endereco').textContent
function app(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Captura />
      <AppRoutes />
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  usarMotor(await bancoDeTeste({ escrita: true }))
  usarFoldDoPacoteSintetico()
  Element.prototype.scrollIntoView = vi.fn()
  await executar("INSERT INTO pub_TESTE.review_queue (entity, entity_id, reason, detail) VALUES ('item', 'TESTE-0004', 'medidas_nao_normalizadas', '5 cm?')")
})
afterAll(() => usarMotor(null))
beforeEach(async () => {
  instalarMatchMedia(375)
  y = 0
  vi.mocked(window.scrollTo).mockReset()
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y })
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => 5000 })
  definirFonteDosNumerosDoPacote(numerosDosObjetos)
  await recarregarNumerosDoPacote()
})
afterEach(() => {
  instalarMatchMedia(375)
  definirFonteDosNumerosDoPacote(null)
})

describe('«Escolher o sítio» abre o objeto no sítio', () => {
  it('objeto do livro: a folha «Sítio deste objeto» já aberta, com o foco dentro, e o parâmetro sai do endereço', async () => {
    app('/item/CA00001?corrigir=sitio')
    const dialogo = await screen.findByRole('dialog', { name: 'Sítio deste objeto' })
    await waitFor(() => expect(dialogo.contains(document.activeElement)).toBe(true))
    await waitFor(() => expect(endereco()).toBe('/item/CA00001'))
  })

  it('sem o parâmetro a folha não abre sozinha', async () => {
    app('/item/CA00001')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('dialog', { name: 'Sítio deste objeto' })).toBeNull()
  })

  it('objeto SKC: «Editar a ficha» já aberta, com o foco no campo Sítio', async () => {
    await registrar('objeto', 'OB-aaaaaaaa-1', 'criar', { periodo: 'CA', titulo: 'Selo', sitio: '', sitioNome: 'Miš', origemTipo: 'achado' })
    try {
      app('/item/OB-aaaaaaaa-1?corrigir=sitio')
      const ficha = await screen.findByRole('region', { name: 'Editar a ficha' })
      await waitFor(() => expect(within(ficha).getByRole('combobox', { name: 'Sítio' })).toHaveFocus())
      await waitFor(() => expect(endereco()).toBe('/item/OB-aaaaaaaa-1'))
    } finally {
      await registrar('objeto', 'OB-aaaaaaaa-1', 'excluir')
    }
  })
})

describe('«Escolher o período» abre o rascunho na escolha do período', () => {
  it('o foco vai ao grupo de rádio do período e o parâmetro sai do endereço', async () => {
    await registrar('objeto', 'OB-aaaaaaaa-2', 'criar', { titulo: 'Sem período' })
    try {
      app('/item/OB-aaaaaaaa-2?corrigir=periodo')
      const grupo = await screen.findByRole('radiogroup', { name: 'Período' })
      await waitFor(() => expect(grupo.contains(document.activeElement)).toBe(true))
      expect(document.activeElement).toHaveAttribute('role', 'radio')
      await waitFor(() => expect(endereco()).toBe('/item/OB-aaaaaaaa-2'))
    } finally {
      await registrar('objeto', 'OB-aaaaaaaa-2', 'excluir')
    }
  })

  it('o rascunho que ganha período sai da Revisão', async () => {
    await registrar('objeto', 'OB-aaaaaaaa-3', 'criar', { titulo: 'Sem período' })
    try {
      app('/revisao?abrir=objetos-sem-numero')
      expect(await screen.findByRole('link', { name: 'Escolher o período' })).toBeInTheDocument()
      await act(() => registrar('objeto', 'OB-aaaaaaaa-3', 'alterar', { periodo: 'CA' }))
      await waitFor(() => expect(screen.queryByRole('button', { name: /^Objetos sem número/ })).toBeNull())
    } finally {
      await registrar('objeto', 'OB-aaaaaaaa-3', 'excluir')
    }
  })
})

describe('voltar à Revisão', () => {
  it('encontra os grupos abertos do mesmo jeito e a rolagem de onde estava', async () => {
    app('/revisao?abrir=medidas-nao-organizadas')
    await screen.findByRole('list', { name: 'Casos de Medidas não organizadas' })
    y = 1200
    fireEvent.scroll(window)
    await userEvent.click(screen.getByRole('button', { name: 'Deixar como está: CA00004' }))
    await screen.findByRole('heading', { level: 3, name: 'Resolvidos por você · 1' })
    act(() => void ir('/item/CA00004'))
    await screen.findByRole('heading', { level: 1 })
    expect(vi.mocked(window.scrollTo).mock.calls.at(-1)).toEqual([0, 0])
    y = 0
    act(() => void ir(-1))
    await screen.findByRole('heading', { level: 3, name: 'Resolvidos por você · 1' })
    expect(endereco()).toBe('/revisao?abrir=medidas-nao-organizadas')
    await waitFor(() => expect(vi.mocked(window.scrollTo).mock.calls.at(-1)).toEqual([0, 1200]))
    await registrar('revisao', Array.from(estadoAtual().registros.get('revisao')!.keys())[0]!, 'excluir')
  })
})
