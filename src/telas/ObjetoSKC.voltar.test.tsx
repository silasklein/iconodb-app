/**
 * Decisão 85 no objeto SKC: «‹ <origem>» e o ícone do topo voltam à tela de onde se veio; o anterior e o próximo de «Meus
 * objetos» levam a origem adiante; sem origem, «Voltar a Meus objetos» como sempre. Pacote sintético e objetos TESTE.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { AppRoutes } from '../app/routes'
import { usarMotor } from '../banco/cliente'
import { numerosDosObjetos } from '../banco/consultas'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from '../objetos-skc/pacote'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { registrar } from '../usuario/estado'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../app/RotaInicial', () => ({ RotaInicial: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../pacote/local', async (original) => {
  const real = await original<typeof import('../pacote/local')>()
  return { ...real, lerEstado: vi.fn(async (armazem?: Parameters<typeof real.lerEstado>[0]) => (await real.lerEstado(armazem).catch(() => null)) ?? ({ schema: 5 } as never)) }
})

const VERBETE = { rotulo: 'Verbete: leão-de-teste', caminho: '/verbete/GL-900001' }
const A = 'OB-aaaaaaaa-5'
const B = 'OB-aaaaaaaa-6'

function Local() {
  const { pathname, search, state } = useLocation()
  return <output data-testid="local" data-state={JSON.stringify(state ?? null)}>{`${pathname}${search}`}</output>
}
const local = () => screen.getByTestId('local').textContent
const estado = () => JSON.parse(screen.getByTestId('local').dataset.state!)

function app(id: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={['/verbete/GL-900001', { pathname: `/item/${id}`, state }]} initialIndex={1}>
      <Local />
      <AppRoutes />
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  usarMotor(await bancoDeTeste({ escrita: true }))
  usarFoldDoPacoteSintetico()
  Element.prototype.scrollIntoView = vi.fn()
  definirFonteDosNumerosDoPacote(numerosDosObjetos)
  await recarregarNumerosDoPacote()
  await registrar('objeto', A, 'criar', { periodo: 'CA', titulo: 'Selo de teste A', origemTipo: 'achado' })
  await registrar('objeto', B, 'criar', { periodo: 'CA', titulo: 'Selo de teste B', origemTipo: 'achado' })
})
afterAll(async () => {
  await registrar('objeto', A, 'excluir')
  await registrar('objeto', B, 'excluir')
  definirFonteDosNumerosDoPacote(null)
  usarMotor(null)
})
afterEach(() => instalarMatchMedia(375))

describe.each([
  ['celular', 375],
  ['computador', 1280],
] as const)('objeto SKC, %s', (aparelho, largura) => {
  beforeEach(() => instalarMatchMedia(largura))

  it('vindo de um verbete: «‹ Verbete: …» volta a ele; o anterior/próximo de «Meus objetos» leva a origem adiante', async () => {
    app(A, { voltar: VERBETE })
    const origem = await screen.findByRole('navigation', { name: 'Origem' })
    const volta = within(origem).getByRole('link', { name: 'Verbete: leão-de-teste' })
    expect(volta).toHaveAttribute('href', '/verbete/GL-900001')
    if (aparelho === 'celular') {
      expect(screen.getByRole('link', { name: 'Voltar (Verbete: leão-de-teste)' })).toHaveAttribute('href', '#/verbete/GL-900001')
      expect(screen.queryByRole('link', { name: 'Voltar a Meus objetos' })).toBeNull()
    } else {
      expect(origem.parentElement).toHaveClass('item-topo-pc')
      expect(within(origem.parentElement!).getByRole('toolbar', { name: 'Ações do objeto' })).toBeInTheDocument()
    }
    // «Meus objetos» tem os dois: o vizinho é um deles (a ordem é a da lista)
    const nav = await screen.findByRole('navigation', { name: 'Posição em Meus objetos' })
    const seta = within(nav).getAllByRole('link').find((a) => /^(Próximo objeto|Objeto anterior)/.test(a.getAttribute('aria-label') ?? ''))!
    await userEvent.click(seta)
    await waitFor(() => expect(local()).not.toBe(`/item/${A}`))
    expect(estado().voltar).toEqual(VERBETE)
    await userEvent.click(within(await screen.findByRole('navigation', { name: 'Origem' })).getByRole('link', { name: 'Verbete: leão-de-teste' }))
    // a troca do vizinho foi replace: o voltar chega ao verbete
    await waitFor(() => expect(local()).toBe('/verbete/GL-900001'))
  })

  it('sem origem: «Voltar a Meus objetos» como sempre, sem «‹ …»', async () => {
    app(B)
    await screen.findByRole('navigation', { name: 'Posição em Meus objetos' })
    expect(screen.queryByRole('navigation', { name: 'Origem' })).toBeNull()
    if (aparelho === 'celular') expect(screen.getByRole('link', { name: 'Voltar a Meus objetos' })).toHaveAttribute('href', '#/colecoes')
  })
})
