import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

beforeAll(usarFoldDoPacoteSintetico)
afterEach(() => {
  instalarMatchMedia(375)
  usarMotor(null)
})

const linhas = () => screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/sitio/'))

describe('Sítios sem região no pacote (R18: uma lista alfabética com letras)', () => {
  beforeEach(async () => usarMotor(await bancoDeTeste()))

  it('lista os sítios com a coordenada em graus, a contagem de objetos e "abrir no mapa" (celular)', async () => {
    renderizarRota('/sitios')
    expect(screen.getByRole('heading', { level: 1, name: 'Sítios' })).toBeInTheDocument()
    await screen.findAllByRole('link', { name: /^Tell Probe Teste/ })
    expect(linhas().map((a) => a.getAttribute('href'))).toEqual(['/sitio/TESTE-1', '/sitio/TESTE-2'])
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['M', 'T'])
    const tell = screen.getByRole('link', { name: /^Tell Probe Teste/ })
    expect(within(tell).getByText('31,913 N · 35,207 E')).toBeInTheDocument()
    expect(within(tell.closest('.sitio-linha') as HTMLElement).getByLabelText('3 objetos')).toHaveTextContent('3')
    expect(within(screen.getByRole('link', { name: /^Maḥraṣ Teste/ })).getByText(/^\d+,\d{3} N · \d+,\d{3} E$/)).toBeInTheDocument()
    expect(screen.getByText('2 sítios · 2 com coordenada')).toBeInTheDocument()
    const mapa = screen.getByRole('link', { name: 'Abrir Tell Probe Teste no mapa' })
    expect(mapa).toHaveAttribute('href', 'https://www.openstreetmap.org/?mlat=31.9132&mlon=35.2071#map=12/31.9132/35.2071')
    expect(mapa).toHaveAttribute('target', '_blank')
    expect(mapa.getAttribute('rel')).toContain('noopener')
  })

  it('não há "Novo sítio" nem outra ação de edição (2B)', async () => {
    renderizarRota('/sitios')
    await screen.findAllByRole('link', { name: /^Tell Probe Teste/ })
    expect(screen.queryByText(/Novo sítio/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Novo|Corrigir/ })).not.toBeInTheDocument()
  })

  it('a busca acha o nome com a dobra ("mahras") e também a grafia impressa', async () => {
    renderizarRota('/sitios')
    const campo = await screen.findByRole('searchbox', { name: 'Buscar sítio' })
    await userEvent.type(campo, 'mahras')
    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(screen.getByRole('link', { name: /^Maḥraṣ Teste/ })).toBeInTheDocument()
    await userEvent.clear(campo)
    await userEvent.type(campo, 'zzzz')
    expect(await screen.findByText('Nenhum sítio encontrado.')).toBeInTheDocument()
  })

  it('no computador a lista fica à esquerda e o detalhe à direita; sem escolha, pede um sítio', async () => {
    instalarMatchMedia(1280)
    renderizarRota('/sitios')
    await screen.findAllByRole('link', { name: /^Tell Probe Teste/ })
    expect(screen.getByText('Escolha um sítio na lista.')).toBeInTheDocument()
    // no computador as linhas da lista não repetem o link do mapa (ele fica no detalhe)
    expect(screen.queryByRole('link', { name: 'Abrir Tell Probe Teste no mapa' })).not.toBeInTheDocument()
  })
})

describe('Sítios agrupados pela região (verbete-pai do nome do sítio, R18)', () => {
  beforeEach(async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar("UPDATE main.glossary_entry SET parent_id = 'GL-900001' WHERE id = 'GL-900004'")
  })

  it('celular: cada região abre e fecha; os sítios sem região vão para "Sem região", no fim', async () => {
    renderizarRota('/sitios')
    const regiao = await screen.findByRole('button', { name: /leão-de-teste/ })
    expect(regiao).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: /^Maḥraṣ Teste/ })).toBeInTheDocument()
    const sem = screen.getByRole('button', { name: /Sem região/ })
    expect(sem).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /^Tell Probe Teste/ })).not.toBeInTheDocument()
    expect(regiao.compareDocumentPosition(sem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await userEvent.click(sem)
    expect(sem).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: /^Tell Probe Teste/ })).toBeInTheDocument()
    await userEvent.click(regiao)
    expect(screen.queryByRole('link', { name: /^Maḥraṣ Teste/ })).not.toBeInTheDocument()
  })

  it('celular: buscar abre as regiões que têm acertos', async () => {
    renderizarRota('/sitios')
    await userEvent.type(await screen.findByRole('searchbox', { name: 'Buscar sítio' }), 'tell')
    expect(await screen.findByRole('link', { name: /^Tell Probe Teste/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /leão-de-teste/ })).not.toBeInTheDocument()
  })

  it('computador: as regiões são cabeçalhos', async () => {
    instalarMatchMedia(1280)
    renderizarRota('/sitios')
    await screen.findAllByRole('link', { name: /^Tell Probe Teste/ })
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['leão-de-teste', 'Sem região'])
    expect(screen.queryByRole('button', { name: /leão-de-teste/ })).not.toBeInTheDocument()
  })
})
