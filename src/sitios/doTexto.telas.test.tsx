/**
 * Etapa 4, Tarefa 26 (tela 7 aprovada; decisões 90.1 e 91, a7): as figuras com o achado «do texto» na página do sítio e no
 * cartão do ponto do mapa, sobre o pacote sintético. A figura `TESTEG-0002` (o objeto F200002) tem o achado no sítio TESTEG-9
 * «Tell Achado Teste», tirado do § 3. O ponto do mapa não muda; a marca fica no cartão e nas listas, com o link ao §. O achado
 * tirado só do crédito (banco de escrita) leva a marca sem link.
 */
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

afterEach(() => instalarMatchMedia(375))

const EXPLICACAO = '«do texto»: o lugar vem da frase do § que cita a figura (ou do crédito dela), não de um campo do catálogo.'

async function abrirMapa() {
  instalarMatchMedia(1280, { hover: true })
  renderizarRota('/sitios')
  await screen.findByRole('group', { name: 'Mapa dos sítios' })
  await userEvent.click(await screen.findByRole('button', { name: /^Tell Achado Teste, 1 objeto/ }))
  return screen.findByRole('dialog', { name: 'Sítio selecionado: Tell Achado Teste' })
}

describe('o achado «do texto» no sítio e no mapa (Tarefa 26)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    usarFoldDoPacoteSintetico()
  })
  afterAll(() => usarMotor(null))

  describe.each([
    ['celular', 375],
    ['computador', 1280],
  ])('a página do sítio (%s)', (_, largura) => {
    beforeEach(() => instalarMatchMedia(largura, { hover: largura >= 768 }))

    it('a linha que explica a marca e, no cartão da figura, «do texto · pelo § 3» com o link ao §, fora do link do cartão', async () => {
      renderizarRota('/sitio/TESTEG-9')
      const secao = await screen.findByRole('region', { name: 'Objetos deste sítio' })
      const cartao = await within(secao).findByRole('link', { name: /F200002/ })
      expect(cartao).toHaveAttribute('href', '/item/F200002')
      expect(within(secao).getByText(EXPLICACAO)).toBeInTheDocument()
      const marca = within(secao).getByTestId('marca-do-texto')
      expect(marca).toHaveTextContent('do texto pelo § 3')
      expect(within(marca).getByRole('link', { name: '§ 3' })).toHaveAttribute('href', '/paragrafo/TESTEG/3')
      expect(cartao.contains(marca)).toBe(false)
    })
  })

  it('um sítio sem achado do texto não tem a linha nem a marca', async () => {
    renderizarRota('/sitio/TESTE-1')
    const secao = await screen.findByRole('region', { name: 'Objetos deste sítio' })
    await waitFor(() => expect(within(secao).getAllByRole('link').length).toBeGreaterThan(0))
    expect(within(secao).queryByText(EXPLICACAO)).toBeNull()
    expect(within(secao).queryByTestId('marca-do-texto')).toBeNull()
  })

  it('o cartão do ponto: «1 objeto, 1 do texto do TESTEG» e a marca sob a miniatura, com o link ao § (a7: o ponto é o mesmo)', async () => {
    const cartao = await abrirMapa()
    expect(await within(cartao).findByText(/· 1 objeto, 1 do texto do TESTEG$/)).toBeInTheDocument()
    const lista = await within(cartao).findByRole('list', { name: 'Objetos de Tell Achado Teste' })
    await waitFor(() => expect(within(lista).getByRole('link', { name: 'Abrir F200002' })).toHaveAttribute('href', '/item/F200002'))
    const marca = within(lista).getByRole('link', { name: 'F200002: do texto, pelo § 3' })
    expect(marca).toHaveAttribute('href', '/paragrafo/TESTEG/3')
    expect(marca).toHaveTextContent(/^do texto$/)
    // o ponto do mapa é um ponto comum (nenhuma classe nova)
    const ponto = screen.getByRole('button', { name: /^Tell Achado Teste, 1 objeto/ })
    expect(ponto.getAttribute('class')).not.toMatch(/texto/)
    cleanup()
  })
})

describe('o achado tirado só do crédito (banco de escrita)', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    usarFoldDoPacoteSintetico()
    await executar("UPDATE pub_TESTEG.assertion SET passage_id = NULL, locator = NULL WHERE subject_id = 'TESTEG-0002'")
  })
  afterAll(() => usarMotor(null))

  it('na página do sítio, «do texto · pelo crédito», sem link', async () => {
    renderizarRota('/sitio/TESTEG-9')
    const secao = await screen.findByRole('region', { name: 'Objetos deste sítio' })
    const marca = await within(secao).findByTestId('marca-do-texto')
    expect(marca).toHaveTextContent('do texto pelo crédito')
    expect(within(marca).queryByRole('link')).toBeNull()
  })

  it('no cartão do ponto, a marca sem link', async () => {
    const cartao = await abrirMapa()
    const lista = await within(cartao).findByRole('list', { name: 'Objetos de Tell Achado Teste' })
    await waitFor(() => expect(within(lista).getByText('do texto')).toBeInTheDocument())
    expect(within(lista).getByText('do texto').closest('a')).toBeNull()
  })
})
