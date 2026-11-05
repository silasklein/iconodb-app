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
  vi.restoreAllMocks()
})

describe('Sítio (celular)', () => {
  beforeEach(async () => usarMotor(await bancoDeTeste()))

  it('mostra o nome, o código com a contagem, a coordenada com a fonte e o "abrir no mapa"', async () => {
    renderizarRota('/sitio/TESTE-2')
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })).toBeInTheDocument()
    expect(screen.getByText('GL-900005 · 3 objetos')).toHaveClass('codigo')
    const coord = screen.getByRole('region', { name: 'Coordenada' })
    expect(within(coord).getByText('31,91320 N · 35,20710 E')).toHaveClass('codigo')
    expect(within(coord).getByText('Gazetteer')).toBeInTheDocument()
    expect(within(coord).getByText('https://example.org/gazetteer/tell-probe-teste')).toBeInTheDocument()
    expect(within(coord).getByText('coordenada inventada para os testes')).toBeInTheDocument()
    // «Abrir no mapa» (Tarefa 19) abre o mapa do app centrado no sítio; o link do OpenStreetMap continua, à parte
    expect(screen.getByRole('link', { name: 'Abrir no mapa' })).toHaveAttribute('href', '/sitios?foco=TESTE-2')
    const osm = screen.getByRole('link', { name: 'Abrir no OpenStreetMap' })
    expect(osm).toHaveAttribute('href', 'https://www.openstreetmap.org/?mlat=31.9132&mlon=35.2071#map=12/31.9132/35.2071')
    expect(osm).toHaveAttribute('target', '_blank')
    expect(osm.getAttribute('rel')).toContain('noopener')
  })

  it('coordenada vinda da grade mostra a grade impressa e a fonte', async () => {
    renderizarRota('/sitio/TESTE-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Maḥteṣ Teste' })).toBeInTheDocument()
    const coord = screen.getByRole('region', { name: 'Coordenada' })
    expect(within(coord).getByText('160.120')).toHaveClass('codigo')
    expect(within(coord).getByText('Grade')).toBeInTheDocument()
    expect(within(coord).getByText('TESTE I (Palestine Grid)')).toBeInTheDocument()
    expect(within(coord).getByText(/^\d+,\d{5} N · \d+,\d{5} E$/)).toBeInTheDocument()
  })

  it('traz a nota do livro, o nome impresso e os objetos achados lá', async () => {
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    expect(screen.getByText('am Testbach (erfunden)')).toHaveAttribute('lang', 'de')
    const objetos = screen.getByRole('region', { name: 'Objetos deste sítio' })
    expect(within(objetos).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/item/CA00003', '/item/CA00004', '/item/BA00002'])
    expect(screen.getByRole('link', { name: 'Voltar aos sítios' })).toHaveAttribute('href', '#/sitios')
    expect(screen.getByRole('link', { name: 'Buscar objetos deste sítio' }).getAttribute('href')).toBe(
      '#/busca?q=Tell+Probe+Teste&escopo=local',
    )
  })

  it('lê sem campos de entrada até a pessoa tocar em "Corrigir" (Tarefa 12); não há escolha no mapa (2C)', async () => {
    const { container } = renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    expect(container.querySelector('input, textarea, select')).toBeNull()
    expect(screen.getByRole('button', { name: 'Corrigir' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: /Escolher no mapa/ })).not.toBeInTheDocument()
  })

  it('sem coordenada: avisa e não oferece o mapa', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar('UPDATE pub_TESTE.site SET lat = NULL, lon = NULL WHERE id = 2')
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    expect(screen.getByText('sem coordenada')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /mapa/ })).not.toBeInTheDocument()
  })

  it('a região aparece quando o verbete do nome tem pai', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar("UPDATE main.glossary_entry SET parent_id = 'GL-900001' WHERE id = 'GL-900005'")
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    expect(screen.getByText('Sítio · leão-de-teste')).toBeInTheDocument()
    expect(screen.getByText('leão-de-teste', { selector: 'dd' })).toBeInTheDocument()
  })

  it('"Copiar referência" copia o nome e a coordenada e avisa', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderizarRota('/sitio/TESTE-2')
    await userEvent.click(await screen.findByRole('button', { name: 'Copiar referência' }))
    expect(writeText).toHaveBeenCalledWith('Tell Probe Teste · 31,91320 N · 35,20710 E')
    expect(await screen.findByRole('status')).toHaveTextContent('Referência copiada')
  })

  it('sítio que não existe: aviso', async () => {
    renderizarRota('/sitio/TESTE-99')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sítio não encontrado' })).toBeInTheDocument()
  })
})

describe('Sítio (computador): lista e detalhe', () => {
  beforeEach(async () => {
    instalarMatchMedia(1280)
    usarMotor(await bancoDeTeste())
  })

  it('a lista fica à esquerda com o sítio marcado; o detalhe à direita; trocar de sítio não remonta a lista', async () => {
    renderizarRota('/sitio/TESTE-2')
    expect(await screen.findByRole('heading', { level: 2, name: 'Tell Probe Teste' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Sítios' })).toBeInTheDocument()
    const lista = document.querySelector('.lista-rolagem')
    expect(screen.getByRole('link', { name: /^Tell Probe Teste/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Abrir no mapa' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: /^Maḥteṣ Teste/ }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Maḥteṣ Teste' })).toBeInTheDocument()
    expect(document.querySelector('.lista-rolagem')).toBe(lista)
    await waitFor(() => expect(screen.getByRole('link', { name: /^Maḥteṣ Teste/ })).toHaveAttribute('aria-current', 'page'))
  })
})

describe('Sítio: coordenada 0', () => {
  it('latitude e longitude 0 mostram os graus e o link do mapa', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar('UPDATE pub_TESTE.site SET lat = 0, lon = 0 WHERE id = 2')
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    expect(screen.getByRole('link', { name: 'Abrir no OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/?mlat=0&mlon=0#map=12/0/0')
    expect(screen.getByRole('link', { name: 'Abrir no mapa' })).toHaveAttribute('href', '/sitios?foco=TESTE-2')
    expect(screen.getByText('0,00000 N · 0,00000 E')).toBeInTheDocument()
    usarMotor(null)
  })

  it('só a latitude em 0 e sem longitude: sem coordenada e sem mapa', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar('UPDATE pub_TESTE.site SET lat = 0, lon = NULL WHERE id = 2')
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    expect(screen.queryByRole('link', { name: 'Abrir no mapa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Abrir no OpenStreetMap' })).not.toBeInTheDocument()
    expect(screen.getByText('sem coordenada')).toBeInTheDocument()
    usarMotor(null)
  })
})
