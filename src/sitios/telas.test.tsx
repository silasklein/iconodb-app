/**
 * Tarefa 12 nas telas (Sitios.dc.html, Sitio.dc.html, PC-Sitio.dc.html): a lista com os sítios do usuário e os nomes de
 * agora, a página de um sítio novo (`/sitio/SI-…`), a correção de um sítio do livro (com o "no livro: …" ao lado), a
 * exclusão reversível e o aviso de nome repetido. Sobre o pacote sintético (TESTE-1 Maḥteṣ Teste, TESTE-2 Tell Probe Teste).
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { B, ev } from '../../tests/suporte/eventosDeTeste'
import { usarMotor } from '../banco/cliente'
import { irPara, renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import * as armazem from '../usuario/armazem'
import { estadoAtual, receberEventos, registrar } from '../usuario/estado'
import { descarregarPendentes } from '../usuario/pendentes'
import { lerDadosDoSitio } from './modelo'
import { chaveDoRascunhoDaCoordenada } from './rascunho'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
  // um sítio novo com tudo, e um sem nada além do nome; um objeto SKC no primeiro
  await registrar('sitio', 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell Inventado', variantes: ['Tall Inventada'], regiao: 'Negev', lat: 31.77, lon: 35.21, nota: 'coordenada do artigo' })
  await registrar('sitio', 'SI-aaaaaaaa-2', 'criar', { nome: 'Sítio só com nome' })
  await registrar('objeto', 'OB-aaaaaaaa-1', 'criar', { periodo: 'CA', titulo: 'Escaraveu de teste.', sitio: 'SI-aaaaaaaa-1', sitioNome: 'Tell Inventado', origemTipo: 'achado' })
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

const dados = (id: string) => lerDadosDoSitio(estadoAtual().registro('sitio', id)!)
const linhas = () => screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/sitio/'))

describe('a lista de sítios com os sítios do usuário', () => {
  it('traz os do livro e os do usuário (com a marca SKC), em ordem alfabética, e o botão "Novo sítio"', async () => {
    renderizarRota('/sitios')
    await screen.findAllByRole('link', { name: /^Tell Probe Teste/ })
    // ordem pelo nome dobrado: Maḥteṣ, Sítio só com nome, Tell Inventado, Tell Probe, Tell Usuário (TESTE-3: publicado da camada, Tarefa 16)
    expect(linhas().map((a) => a.getAttribute('href'))).toEqual(['/sitio/TESTE-1', '/sitio/SI-aaaaaaaa-2', '/sitio/SI-aaaaaaaa-1', '/sitio/TESTE-2', '/sitio/TESTE-3'])
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['M', 'S', 'T'])
    const inventado = screen.getByRole('link', { name: /^Tell Inventado/ })
    expect(inventado).toHaveAttribute('href', '/sitio/SI-aaaaaaaa-1')
    expect(within(inventado).getByText('SKC')).toHaveClass('marca-skc')
    // E-5: a região deduzida da coordenada no fim da linha (a escrita pelo usuário, «Negev», não entra)
    expect(within(inventado).getByText('31,77 N · 35,21 E · Levante Sul')).toHaveClass('sitio-coord')
    expect(within(screen.getByRole('link', { name: /^Sítio só com nome/ })).getByText('sem coordenada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Novo sítio' })).toHaveAttribute('href', '/sitios/novo')
    expect(screen.getByText('5 sítios · 4 com coordenada')).toBeInTheDocument()
  })

  it('E-5: a região da linha sai da coordenada (a do filtro); sem coordenada ou fora das regiões, a linha não a mostra', async () => {
    await registrar('sitio', 'TESTE-2', 'alterar', { regiao: 'Egito' }) // o campo escrito não conta
    renderizarRota('/sitios')
    await screen.findAllByRole('link', { name: /^Tell Probe Teste/ })
    expect(within(screen.getByRole('link', { name: /^Tell Probe Teste/ })).getByText('31,913 N · 35,207 E · Levante Sul')).toHaveClass('sitio-coord')
    expect(within(screen.getByRole('link', { name: /^Sítio só com nome/ })).getByText('sem coordenada')).toBeInTheDocument()
    cleanup()
    await registrar('sitio', 'TESTE-2', 'alterar', { regiao: null, lat: 0, lon: 0 }) // fora de todas as regiões
    renderizarRota('/sitios')
    await screen.findAllByRole('link', { name: /^Tell Probe Teste/ })
    expect(within(screen.getByRole('link', { name: /^Tell Probe Teste/ })).getByText('0 N · 0 E')).toBeInTheDocument()
    for (const c of document.querySelectorAll('.sitio-coord')) expect(c.textContent).not.toMatch(/^ · | · $/)
    cleanup()
    await registrar('sitio', 'TESTE-2', 'alterar', { lat: null, lon: null })
  })

  it('E-5: o ícone de «Mostrar no mapa» é o alfinete no celular e a mira no computador; no computador «Novo sítio» fica à direita do título', async () => {
    renderizarRota('/sitios')
    const botao = await screen.findByRole('button', { name: 'Mostrar Tell Inventado no mapa' })
    expect(botao.querySelector('svg path')?.getAttribute('d')).toMatch(/^M12 21s/)
    expect(document.querySelector('.sitios-titulo-linha')).toBeNull()
    cleanup()
    instalarMatchMedia(1280, { hover: true })
    renderizarRota('/sitios')
    const desktop = await screen.findByRole('button', { name: 'Mostrar Tell Inventado no mapa' })
    expect(desktop.querySelectorAll('svg circle, svg path').length).toBe(5) // a mira: um círculo e quatro traços
    expect(desktop.querySelector('svg path')?.getAttribute('d')).not.toMatch(/^M12 21s/)
    const linha = document.querySelector('.sitios-titulo-linha')!
    expect(within(linha as HTMLElement).getByRole('heading', { level: 1, name: 'Sítios' })).toBeInTheDocument()
    expect(within(linha as HTMLElement).getByRole('link', { name: 'Novo sítio' })).toHaveAttribute('href', '/sitios/novo')
    expect(screen.getAllByRole('link', { name: 'Novo sítio' })).toHaveLength(1)
  })

  it('um sítio do livro corrigido aparece com o nome de agora, e a busca da lista acha o novo e o antigo', async () => {
    await registrar('sitio', 'TESTE-2', 'alterar', { nome: 'Tell Nova Grafia', variantes: ['Khirbet Probe'] })
    renderizarRota('/sitios')
    const campo = await screen.findByRole('searchbox', { name: 'Buscar sítio' })
    await screen.findByRole('link', { name: /^Tell Nova Grafia/ })
    expect(screen.queryByRole('link', { name: /^Tell Probe Teste/ })).toBeNull()
    for (const q of ['nova grafia', 'tell probe', 'khirbet']) {
      await userEvent.clear(campo)
      await userEvent.type(campo, q)
      await waitFor(() => expect(linhas().map((a) => a.getAttribute('href'))).toEqual(['/sitio/TESTE-2']), { timeout: 2000 })
    }
    await registrar('sitio', 'TESTE-2', 'alterar', { nome: null, variantes: null })
  })

  it('o sítio excluído sai da lista', async () => {
    await registrar('sitio', 'SI-aaaaaaaa-3', 'criar', { nome: 'Sítio apagado' })
    await registrar('sitio', 'SI-aaaaaaaa-3', 'excluir')
    renderizarRota('/sitios')
    await screen.findAllByRole('link', { name: /^Tell Probe Teste/ })
    expect(screen.queryByRole('link', { name: /Sítio apagado/ })).toBeNull()
  })

  it('computador: a lista à esquerda e a página do sítio novo à direita', async () => {
    instalarMatchMedia(1280)
    renderizarRota('/sitio/SI-aaaaaaaa-1')
    expect(await screen.findByRole('heading', { level: 2, name: 'Tell Inventado' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Sítios' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Tell Inventado/ })).toHaveAttribute('aria-current', 'page')
  })
})

describe('a página de um sítio novo (/sitio/SI-…)', () => {
  it('mostra o nome, a marca SKC, a região, as outras grafias, a coordenada, a nota e os objetos (o SKC achado lá)', async () => {
    renderizarRota('/sitio/SI-aaaaaaaa-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell Inventado' })).toBeInTheDocument()
    expect(screen.getByText('Sítio SKC · Negev')).toBeInTheDocument()
    expect(screen.getByText('SI-aaaaaaaa-1 · 1 objeto')).toHaveClass('codigo')
    const dl = screen.getByRole('region', { name: 'Dados do sítio' })
    expect(within(dl).getByText('Tall Inventada')).toBeInTheDocument()
    expect(within(dl).getByText('coordenada do artigo')).toBeInTheDocument()
    const coord = screen.getByRole('region', { name: 'Coordenada' })
    expect(within(coord).getByText('31,77 N · 35,21 E')).toHaveClass('codigo')
    expect(screen.getByRole('link', { name: 'Abrir no OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/?mlat=31.77&mlon=35.21#map=12/31.77/35.21')
    expect(screen.getByRole('link', { name: 'Abrir no mapa' })).toHaveAttribute('href', '/sitios?foco=SI-aaaaaaaa-1')
    const objetos = screen.getByRole('region', { name: 'Objetos deste sítio' })
    await waitFor(() => expect(within(objetos).getAllByRole('link')).toHaveLength(1))
    expect(within(objetos).getByRole('link')).toHaveAttribute('href', expect.stringMatching(/^\/item\/(CA\d+|OB-aaaaaaaa-1)$/))
    expect(screen.getByRole('link', { name: 'Voltar aos sítios' })).toHaveAttribute('href', '#/sitios')
  })

  it('um sítio sem nada além do nome: "sem coordenada", sem o link do mapa, sem objetos', async () => {
    renderizarRota('/sitio/SI-aaaaaaaa-2')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sítio só com nome' })).toBeInTheDocument()
    expect(screen.getByText('sem coordenada')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /mapa/ })).toBeNull()
    expect(screen.getByText('Nenhum objeto.')).toBeInTheDocument()
  })

  it('um id de sítio novo que não existe: "Sítio não encontrado"', async () => {
    renderizarRota('/sitio/SI-zzzzzzzz-9')
    expect(await screen.findByRole('heading', { level: 1, name: 'Sítio não encontrado' })).toBeInTheDocument()
  })
})

describe('corrigir um sítio do livro: a correção fica na camada do usuário e o livro continua visível', () => {
  afterEach(async () => {
    await registrar('sitio', 'TESTE-2', 'alterar', { nome: null, regiao: null, lat: null, lon: null, nota: null, variantes: null })
  })

  it('"Corrigir" abre os campos; mudar o nome e sair do campo grava só o nome; a página mostra "no livro: …"', async () => {
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    const corrigir = screen.getByRole('button', { name: 'Corrigir' })
    expect(corrigir).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(corrigir)
    expect(corrigir).toHaveAttribute('aria-pressed', 'true')
    const nome = screen.getByRole('textbox', { name: 'Nome' })
    expect(nome).toHaveValue('Tell Probe Teste')
    await userEvent.clear(nome)
    await userEvent.type(nome, '  Tell   Probe  Corrigido ')
    await userEvent.tab()
    await waitFor(() => expect(dados('TESTE-2').nome).toBe('Tell Probe Corrigido'))
    // um campo só por evento: o nome mudou e a coordenada, por exemplo, não foi escrita junto
    expect(estadoAtual().hlcDoCampo('sitio', 'TESTE-2', 'nome')).not.toBe(estadoAtual().hlcDoCampo('sitio', 'TESTE-2', 'lat'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell Probe Corrigido' })).toBeInTheDocument()
    expect(screen.getByText('no livro: Tell Probe Teste')).toBeInTheDocument()
    // voltar ao valor do livro
    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao nome do livro' }))
    await waitFor(() => expect(dados('TESTE-2').nome).toBeNull())
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    expect(screen.queryByText(/no livro: Tell Probe Teste/)).toBeNull()
  })

  it('escrever o nome do livro de novo grava null (o mesmo que voltar)', async () => {
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    const nome = screen.getByRole('textbox', { name: 'Nome' })
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Outro nome')
    await userEvent.tab()
    await waitFor(() => expect(dados('TESTE-2').nome).toBe('Outro nome'))
    await userEvent.clear(nome)
    await userEvent.type(nome, 'Tell Probe Teste')
    await userEvent.tab()
    await waitFor(() => expect(estadoAtual().registro('sitio', 'TESTE-2')!.campos.nome).toBeNull())
  })

  it('a coordenada: o par lat+lon num evento só, erros em português, e o valor do livro ao lado', async () => {
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    const secao = screen.getByRole('region', { name: 'Coordenada, em correção' })
    expect(within(secao).getByText('No livro: 31,91320 N · 35,20710 E')).toBeInTheDocument()
    const lat = within(secao).getByRole('textbox', { name: 'Latitude' })
    const lon = within(secao).getByRole('textbox', { name: 'Longitude' })
    expect(lat).toHaveValue('31,9132')
    await userEvent.clear(lat)
    await userEvent.type(lat, '131,2')
    await userEvent.click(within(secao).getByRole('button', { name: 'Salvar a coordenada' }))
    expect(await within(secao).findByRole('alert')).toHaveTextContent('Latitude entre −90 e 90 (recebi 131,2).')
    expect(dados('TESTE-2').coordenada).toBeNull()
    await userEvent.clear(lat)
    await userEvent.type(lat, '31,5')
    await userEvent.clear(lon)
    await userEvent.type(lon, '35,5')
    await userEvent.click(within(secao).getByRole('button', { name: 'Salvar a coordenada' }))
    await waitFor(() => expect(dados('TESTE-2').coordenada).toEqual({ lat: 31.5, lon: 35.5 }))
    // o par vai num evento só: o mesmo hlc nos dois campos
    expect(estadoAtual().hlcDoCampo('sitio', 'TESTE-2', 'lat')).toBe(estadoAtual().hlcDoCampo('sitio', 'TESTE-2', 'lon'))
    expect(estadoAtual().hlcDoCampo('sitio', 'TESTE-2', 'lat')).not.toBe(estadoAtual().hlcDoCampo('sitio', 'TESTE-2', 'nome'))
    // fora do modo de correção: a coordenada de agora e a do livro
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    const coord = screen.getByRole('region', { name: 'Coordenada' })
    expect(within(coord).getByText('31,5 N · 35,5 E')).toBeInTheDocument()
    expect(within(coord).getByText('no livro: 31,91320 N · 35,20710 E')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir no OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/?mlat=31.5&mlon=35.5#map=12/31.5/35.5')
    // voltar ao valor do livro
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    await userEvent.click(screen.getByRole('button', { name: 'Voltar à coordenada do livro' }))
    await waitFor(() => expect(dados('TESTE-2').coordenada).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    expect(await screen.findByText('31,91320 N · 35,20710 E')).toBeInTheDocument()
  })

  it('colar um link do OpenStreetMap no campo Latitude preenche os dois campos', async () => {
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    const secao = screen.getByRole('region', { name: 'Coordenada, em correção' })
    const lat = within(secao).getByRole('textbox', { name: 'Latitude' })
    await userEvent.clear(lat)
    await userEvent.click(lat)
    await userEvent.paste('https://www.openstreetmap.org/#map=12/31.7683/35.2137')
    expect(lat).toHaveValue('31,7683')
    expect(within(secao).getByRole('textbox', { name: 'Longitude' })).toHaveValue('35,2137')
  })

  it('colar o ambíguo, um link fora da faixa ou um link curto do Google: a mensagem específica, e o campo fica como estava', async () => {
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    const secao = screen.getByRole('region', { name: 'Coordenada, em correção' })
    const lat = within(secao).getByRole('textbox', { name: 'Latitude' })
    const lon = within(secao).getByRole('textbox', { name: 'Longitude' })
    await userEvent.click(lat)
    await userEvent.paste('31,77,35,21')
    expect(await within(secao).findByRole('alert')).toHaveTextContent('«31,77,35,21» é ambígua: não dá para saber onde a vírgula separa a latitude da longitude. Use «31.77, 35.21», «31,77; 35,21», um link do OpenStreetMap')
    expect(lat).toHaveValue('31,9132')
    await userEvent.click(lon)
    await userEvent.paste('https://www.openstreetmap.org/?mlat=95&mlon=35')
    expect(await within(secao).findByRole('alert')).toHaveTextContent('Latitude entre −90 e 90 (recebi 95).')
    expect(lon).toHaveValue('35,2071')
    await userEvent.click(lat)
    await userEvent.paste('https://maps.app.goo.gl/AbC123xyz')
    const aviso = await within(secao).findByRole('alert')
    expect(aviso).toHaveTextContent('link curto do Google Maps')
    expect(aviso).toHaveTextContent('copie as coordenadas')
    expect(dados('TESTE-2').coordenada).toBeNull()
  })

  it('digitar o par inteiro («31,77,35,21») num campo e sair: a mensagem do ambíguo, não "escreva um número"', async () => {
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    const secao = screen.getByRole('region', { name: 'Coordenada, em correção' })
    const lat = within(secao).getByRole('textbox', { name: 'Latitude' })
    await userEvent.clear(lat)
    await userEvent.type(lat, '31,77,35,21')
    await userEvent.tab()
    expect(await within(secao).findByRole('alert')).toHaveTextContent('«31,77,35,21» é ambígua')
    await userEvent.clear(lat)
    await userEvent.type(lat, '31.77, 35.21')
    await userEvent.tab()
    await waitFor(() => expect(dados('TESTE-2').coordenada).toEqual({ lat: 31.77, lon: 35.21 }))
  })

  describe('a coordenada digitada em «Corrigir» não se perde', () => {
    const abrir = async () => {
      renderizarRota('/sitio/TESTE-2')
      await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
      await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
      const secao = screen.getByRole('region', { name: 'Coordenada, em correção' })
      return { secao, lat: within(secao).getByRole('textbox', { name: 'Latitude' }), lon: within(secao).getByRole('textbox', { name: 'Longitude' }) }
    }
    const preencher = async (lat: HTMLElement, lon: HTMLElement, la: string, lo: string) => {
      await userEvent.clear(lat)
      await userEvent.type(lat, la)
      await userEvent.clear(lon)
      await userEvent.type(lon, lo)
    }
    beforeEach(() => localStorage.clear())
    /**
     * Os campos de «Corrigir» partem da coordenada que a página mostrava ao montar e, quando o estado do usuário termina de chegar,
     * passam para a gravada (a que um teste anterior deixou). Um teste que LÊ o valor dos campos para usá-lo depois espera antes
     * esse assentamento, senão lê o valor do primeiro desenho (corrida que aparecia sob carga).
     */
    const assentados = async (lat: HTMLElement, lon: HTMLElement) => {
      const c = dados('TESTE-2').coordenada
      if (!c) return
      const texto = (n: number) => String(n).replace('.', ',')
      await waitFor(() => {
        expect(lat).toHaveValue(texto(c.lat))
        expect(lon).toHaveValue(texto(c.lon))
      })
    }

    it('um par válido grava sozinho ao sair do campo, como os outros campos, sem «Salvar a coordenada»', async () => {
      const { lat, lon } = await abrir()
      await userEvent.clear(lat)
      await userEvent.type(lat, '31,6')
      await userEvent.clear(lon)
      await userEvent.type(lon, '35,6')
      await userEvent.tab()
      await waitFor(() => expect(dados('TESTE-2').coordenada).toEqual({ lat: 31.6, lon: 35.6 }))
      expect(estadoAtual().hlcDoCampo('sitio', 'TESTE-2', 'lat')).toBe(estadoAtual().hlcDoCampo('sitio', 'TESTE-2', 'lon'))
      // A coordenada chega aos dados antes de a gravação terminar (o aviso e o rascunho apagado vêm no `then`): esperar os dois.
      expect(await screen.findByText('Coordenada guardada.')).toBeInTheDocument()
      await waitFor(() => expect(localStorage.getItem(chaveDoRascunhoDaCoordenada('TESTE-2'))).toBeNull())
    })

    it('fechar «Corrigir» com o par válido ainda no campo (sem sair dele antes) grava a coordenada', async () => {
      const { lat, lon } = await abrir()
      await userEvent.clear(lat)
      await userEvent.type(lat, '31,7')
      await userEvent.clear(lon)
      await userEvent.type(lon, '35,7')
      await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
      await waitFor(() => expect(dados('TESTE-2').coordenada).toEqual({ lat: 31.7, lon: 35.7 }))
      expect(await screen.findByText('31,7 N · 35,7 E')).toBeInTheDocument()
    })

    it('passar da latitude para a longitude não grava a metade que já mudou; sair do par grava os dois de uma vez', async () => {
      const { lat, lon } = await abrir()
      const antes = estadoAtual().hlcDoCampo('sitio', 'TESTE-2', 'lat')
      await userEvent.clear(lat)
      await userEvent.type(lat, '31,4')
      await userEvent.click(lon) // a longitude ainda é a do livro: gravar agora seria um par misturado
      expect(estadoAtual().hlcDoCampo('sitio', 'TESTE-2', 'lat')).toBe(antes)
      expect(dados('TESTE-2').coordenada).toBeNull()
      await userEvent.clear(lon)
      await userEvent.type(lon, '35,4')
      await userEvent.tab()
      await waitFor(() => expect(dados('TESTE-2').coordenada).toEqual({ lat: 31.4, lon: 35.4 }))
    })

    it('sair da página com o par válido ainda no campo (o foco nunca saiu dele) grava a coordenada', async () => {
      const { lat, lon } = await abrir()
      await userEvent.clear(lat)
      await userEvent.type(lat, '31,45')
      await userEvent.clear(lon)
      await userEvent.type(lon, '35,45')
      act(() => irPara('/sitios'))
      await screen.findByRole('heading', { level: 1, name: 'Sítios' })
      await waitFor(() => expect(dados('TESTE-2').coordenada).toEqual({ lat: 31.45, lon: 35.45 }))
      expect(localStorage.getItem(chaveDoRascunhoDaCoordenada('TESTE-2'))).toBeNull()
    })

    it('fechar «Corrigir» com o par pela metade: nada é gravado, a página avisa e, ao reabrir, o que foi escrito volta', async () => {
      const { lat, lon } = await abrir()
      await userEvent.clear(lat)
      await userEvent.type(lat, '31,8')
      await userEvent.clear(lon)
      await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
      expect(dados('TESTE-2').coordenada).toBeNull()
      expect(await screen.findByRole('status', { name: 'Coordenada ainda não salva' })).toHaveTextContent('Há uma coordenada ainda não salva neste sítio')
      await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
      expect(screen.getByRole('textbox', { name: 'Latitude' })).toHaveValue('31,8')
      expect(screen.getByRole('textbox', { name: 'Longitude' })).toHaveValue('')
      expect(screen.getByRole('status', { name: 'Rascunho da coordenada recuperado' })).toBeInTheDocument()
      // completar e sair grava, e o rascunho some
      await userEvent.type(screen.getByRole('textbox', { name: 'Longitude' }), '35,8')
      await userEvent.tab()
      await waitFor(() => expect(dados('TESTE-2').coordenada).toEqual({ lat: 31.8, lon: 35.8 }))
      expect(localStorage.getItem(chaveDoRascunhoDaCoordenada('TESTE-2'))).toBeNull()
      expect(screen.queryByRole('status', { name: 'Rascunho da coordenada recuperado' })).toBeNull()
    })

    it('fechar «Corrigir» com um valor inválido (fora da faixa) também guarda o rascunho e avisa', async () => {
      const { lat, lon } = await abrir()
      await userEvent.clear(lat)
      await userEvent.type(lat, '131,2')
      await userEvent.clear(lon)
      await userEvent.type(lon, '35,9')
      await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
      expect(dados('TESTE-2').coordenada).toBeNull()
      expect(await screen.findByRole('status', { name: 'Coordenada ainda não salva' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
      expect(screen.getByRole('textbox', { name: 'Latitude' })).toHaveValue('131,2')
    })

    it('sair da página (voltar, ou outra rota) com o par pela metade: o rascunho volta ao reabrir o sítio, e «Descartar o rascunho» o apaga', async () => {
      const { lat, lon } = await abrir()
      await userEvent.clear(lat)
      await userEvent.type(lat, '31,3')
      await userEvent.clear(lon)
      await userEvent.type(lon, '35,') // sem tirar o foco: a navegação vem com o campo ainda em edição
      act(() => irPara('/sitios'))
      await screen.findByRole('heading', { level: 1, name: 'Sítios' })
      expect(dados('TESTE-2').coordenada).toBeNull()
      act(() => irPara('/sitio/TESTE-2'))
      await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
      expect(await screen.findByRole('status', { name: 'Coordenada ainda não salva' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
      expect(screen.getByRole('textbox', { name: 'Latitude' })).toHaveValue('31,3')
      expect(screen.getByRole('textbox', { name: 'Longitude' })).toHaveValue('35,')
      await userEvent.click(screen.getByRole('button', { name: 'Descartar o rascunho' }))
      expect(localStorage.getItem(chaveDoRascunhoDaCoordenada('TESTE-2'))).toBeNull()
      expect(screen.getByRole('textbox', { name: 'Latitude' })).toHaveValue('31,9132')
      expect(screen.getByRole('textbox', { name: 'Longitude' })).toHaveValue('35,2071')
    })

    describe('r2 (I3): o rascunho sai ANTES da gravação e nenhuma gravação que termina apaga um rascunho mais novo', () => {
      const chave = chaveDoRascunhoDaCoordenada('TESTE-2')
      /** A próxima gravação no IndexedDB espera `liberar()`. */
      const gravacaoLenta = () => {
        let liberar!: () => void
        const porta = new Promise<void>((ok) => (liberar = ok))
        const original = armazem.gravarNovosEventos
        const espia = vi.spyOn(armazem, 'gravarNovosEventos').mockImplementationOnce(async (...a) => {
          await porta
          return original(...a)
        })
        return { liberar, espia }
      }

      it('fechar «Corrigir» no mesmo instante em que o foco sai do campo: grava, mostra a coordenada nova e NÃO avisa de coordenada não salva', async () => {
        const { lat, lon } = await abrir()
        await preencher(lat, lon, '31,66', '35,66')
        act(() => {
          fireEvent.blur(lon)
          fireEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
        })
        await waitFor(() => expect(dados('TESTE-2').coordenada).toEqual({ lat: 31.66, lon: 35.66 }))
        expect(await screen.findByText('31,66 N · 35,66 E')).toBeInTheDocument()
        await new Promise((ok) => setTimeout(ok, 150))
        expect(screen.queryByRole('status', { name: 'Coordenada ainda não salva' })).toBeNull()
        expect(localStorage.getItem(chave)).toBeNull()
      })

      it('T17-B-13: enquanto a gravação não termina o rascunho continua guardado (nada vive só na memória), a página não avisa, e ele sai quando a gravação termina', async () => {
        const { lat, lon } = await abrir()
        await preencher(lat, lon, '31,67', '35,67')
        expect(localStorage.getItem(chave)).not.toBeNull()
        const { liberar } = gravacaoLenta()
        fireEvent.blur(lon)
        // o par segue guardado no aparelho até a gravação terminar de verdade
        expect(JSON.parse(localStorage.getItem(chave)!)).toEqual({ lat: '31,67', lon: '35,67' })
        await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
        expect(screen.queryByRole('status', { name: 'Coordenada ainda não salva' })).toBeNull()
        liberar()
        await waitFor(() => expect(dados('TESTE-2').coordenada).toEqual({ lat: 31.67, lon: 35.67 }))
        await waitFor(() => expect(localStorage.getItem(chave)).toBeNull())
        expect(screen.queryByRole('status', { name: 'Coordenada ainda não salva' })).toBeNull()
      })

      it('mexer de novo enquanto a gravação está pendente: o rascunho mais novo (meio par) sobrevive à gravação que termina', async () => {
        const { lat, lon } = await abrir()
        await preencher(lat, lon, '31,11', '35,11')
        const { liberar } = gravacaoLenta()
        fireEvent.blur(lon)
        await userEvent.click(lat)
        await userEvent.clear(lat)
        await userEvent.type(lat, '31,2')
        await userEvent.clear(lon)
        expect(JSON.parse(localStorage.getItem(chave)!)).toEqual({ lat: '31,2', lon: '' })
        liberar()
        await waitFor(() => expect(dados('TESTE-2').coordenada).toEqual({ lat: 31.11, lon: 35.11 }))
        await new Promise((ok) => setTimeout(ok, 100))
        expect(JSON.parse(localStorage.getItem(chave)!)).toEqual({ lat: '31,2', lon: '' })
        expect(lat).toHaveValue('31,2')
        // fechar: a página avisa, e o meio par volta ao reabrir
        await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
        expect(await screen.findByRole('status', { name: 'Coordenada ainda não salva' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
        expect(screen.getByRole('textbox', { name: 'Latitude' })).toHaveValue('31,2')
      })

      it('a gravação falha: o rascunho volta e a mensagem aparece; fechar sem que o disco volte deixa o aviso na página, e reabrir traz o par', async () => {
        const { lat, lon } = await abrir()
        await preencher(lat, lon, '31,33', '35,33')
        const falha = vi.spyOn(armazem, 'gravarNovosEventos').mockRejectedValue(new Error('disco cheio'))
        fireEvent.blur(lon)
        expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar; tente de novo.')
        expect(JSON.parse(localStorage.getItem(chave)!)).toEqual({ lat: '31,33', lon: '35,33' })
        expect(estadoAtual().registro('sitio', 'TESTE-2')?.campos.lat ?? null).toBeNull()
        await userEvent.click(screen.getByRole('button', { name: 'Corrigir' })) // ao fechar tenta de novo, e falha de novo
        expect(await screen.findByRole('status', { name: 'Coordenada ainda não salva' })).toBeInTheDocument()
        await waitFor(() => expect(falha.mock.calls.length).toBeGreaterThanOrEqual(2))
        await new Promise((ok) => setTimeout(ok, 50))
        falha.mockRestore()
        expect(JSON.parse(localStorage.getItem(chave)!)).toEqual({ lat: '31,33', lon: '35,33' })
        expect(screen.getByRole('status', { name: 'Coordenada ainda não salva' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
        expect(screen.getByRole('textbox', { name: 'Latitude' })).toHaveValue('31,33')
        expect(screen.getByRole('textbox', { name: 'Longitude' })).toHaveValue('35,33')
      })

      it('a gravação falha e o disco volta antes de fechar: fechar grava o par que estava no campo, sem aviso', async () => {
        const { lat, lon } = await abrir()
        await preencher(lat, lon, '31,34', '35,34')
        const falha = vi.spyOn(armazem, 'gravarNovosEventos').mockRejectedValueOnce(new Error('disco cheio'))
        fireEvent.blur(lon)
        expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar; tente de novo.')
        falha.mockRestore()
        await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
        await waitFor(() => expect(dados('TESTE-2').coordenada).toEqual({ lat: 31.34, lon: 35.34 }))
        await new Promise((ok) => setTimeout(ok, 100))
        expect(screen.queryByRole('status', { name: 'Coordenada ainda não salva' })).toBeNull()
        expect(localStorage.getItem(chave)).toBeNull()
      })
    })

    describe('r2 (m-d): uma coordenada que chega de outro aparelho com «Corrigir» aberto não é desfeita pelo valor antigo da tela', () => {
      const deFora = (lat: number, lon: number, seq = 1) =>
        act(() => void receberEventos([ev({ ap: B, seq, ms: Date.now() + 5 * 60_000 + seq, tipo: 'sitio', reg: 'TESTE-2', campos: { lat, lon } })]))

      it('campos que a pessoa não mexeu se atualizam; sair deles sem mexer não grava nada', async () => {
        const { lat, lon } = await abrir()
        expect(lat).toHaveValue('31,9132')
        await deFora(32.5, 36.5)
        await waitFor(() => expect(lat).toHaveValue('32,5'))
        expect(lon).toHaveValue('36,5')
        const antes = estadoAtual().hlcDoCampo('sitio', 'TESTE-2', 'lat')
        await userEvent.click(lat)
        await userEvent.tab()
        await userEvent.tab() // saiu do par sem mudar nada
        expect(estadoAtual().hlcDoCampo('sitio', 'TESTE-2', 'lat')).toBe(antes)
        expect(dados('TESTE-2').coordenada).toEqual({ lat: 32.5, lon: 36.5 })
        expect(localStorage.getItem(chaveDoRascunhoDaCoordenada('TESTE-2'))).toBeNull()
      })

      it('a pessoa mexeu só na latitude: o que ela escreveu fica, a longitude de fora entra, e o par gravado é (latitude dela, longitude de fora)', async () => {
        const { lat, lon } = await abrir()
        await userEvent.clear(lat)
        await userEvent.type(lat, '33')
        await deFora(32.5, 36.5)
        await waitFor(() => expect(lon).toHaveValue('36,5'))
        expect(lat).toHaveValue('33')
        await userEvent.tab() // da latitude para a longitude: dentro do par, não grava
        await userEvent.tab() // sai do par
        await waitFor(() => expect(dados('TESTE-2').coordenada).toEqual({ lat: 33, lon: 36.5 }))
      })

      it('a gravação da própria pessoa não é tomada por uma chegada de fora (o texto que ela escreveu depois fica)', async () => {
        const { lat, lon } = await abrir()
        await preencher(lat, lon, '31,5', '35,5')
        fireEvent.blur(lon)
        await waitFor(() => expect(dados('TESTE-2').coordenada).toEqual({ lat: 31.5, lon: 35.5 }))
        expect(lat).toHaveValue('31,5')
        await userEvent.click(lat)
        await userEvent.type(lat, '1') // 31,51: ainda sem sair
        await deFora(32.5, 36.5, 2)
        await waitFor(() => expect(lon).toHaveValue('36,5')) // a longitude que ela não mexeu depois da gravação acompanha
        expect(lat).toHaveValue('31,51')
      })

      it('T17-B-14: um campo mexido e digitado de volta ao valor guardado acompanha o valor que chega de fora', async () => {
        const { lat, lon } = await abrir()
        await assentados(lat, lon)
        const guardadoLat = (lat as HTMLInputElement).value
        await userEvent.clear(lat)
        await userEvent.type(lat, '33')
        await userEvent.clear(lat)
        await userEvent.type(lat, guardadoLat) // de volta ao que estava
        await deFora(31.5, 36.5, 41)
        // os dois campos acompanham (o mexido-e-devolvido também): espera os dois, não só o primeiro que mudar
        await waitFor(() => {
          expect(lon).toHaveValue('36,5')
          expect(lat).toHaveValue('31,5')
        })
        // e sair dos campos não grava o valor velho por cima do que chegou
        await userEvent.tab()
        await userEvent.tab()
        expect(dados('TESTE-2').coordenada).toEqual({ lat: 31.5, lon: 36.5 })
      })

      it('T17-B-15: uma gravação que falha depois de uma chegada de fora avisa e guarda o par que a pessoa escreveu', async () => {
        const { lat, lon } = await abrir()
        await preencher(lat, lon, '31,41', '35,41')
        let falhar!: () => void
        const porta = new Promise<never>((_, nao) => (falhar = () => nao(new Error('disco cheio'))))
        vi.spyOn(armazem, 'gravarNovosEventos').mockImplementationOnce(async () => porta)
        fireEvent.blur(lon)
        await deFora(34.5, 38.5, 42) // chega de outro aparelho enquanto a gravação está pendente
        await waitFor(() => expect(lon).toHaveValue('38,5'))
        falhar()
        expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar; tente de novo.')
        expect(JSON.parse(localStorage.getItem(chaveDoRascunhoDaCoordenada('TESTE-2'))!)).toEqual({ lat: '31,41', lon: '35,41' })
        expect(lat).toHaveValue('31,41')
        expect(lon).toHaveValue('35,41')
        vi.restoreAllMocks()
      })
    })

    describe('T17-B-13: um rascunho igual à coordenada de agora não é «ainda não salva»', () => {
      it('a página não avisa quando o rascunho guardado diz a coordenada que já está gravada', async () => {
        localStorage.removeItem(chaveDoRascunhoDaCoordenada('TESTE-2')) // sobras de um teste anterior (a falha deixa o rascunho)
        const { lat, lon } = await abrir()
        await assentados(lat, lon)
        const par = { lat: (lat as HTMLInputElement).value, lon: (lon as HTMLInputElement).value }
        await userEvent.click(screen.getByRole('button', { name: 'Corrigir' })) // fecha sem mudar nada
        const chave = chaveDoRascunhoDaCoordenada('TESTE-2')
        const avisoDeCoordenada = () => screen.queryByRole('status', { name: 'Coordenada ainda não salva' })
        const outraAbaGuardou = (rascunho: unknown) => {
          localStorage.setItem(chave, JSON.stringify(rascunho))
          act(() => void window.dispatchEvent(new StorageEvent('storage', { key: chave })))
        }
        // O controle positivo primeiro: um rascunho DIFERENTE da coordenada gravada faz o aviso aparecer (a página escuta, e o aviso funciona)...
        outraAbaGuardou({ lat: `${par.lat}9`, lon: par.lon })
        await screen.findByRole('status', { name: 'Coordenada ainda não salva' })
        // ...e o rascunho IGUAL à coordenada gravada o tira: nada a avisar (sem esperar um tempo fixo: o aviso que sai é o que se espera).
        outraAbaGuardou(par)
        await waitFor(() => expect(avisoDeCoordenada()).toBeNull())
        localStorage.removeItem(chave)
      })
    })
  })

  it('outras grafias: Enter acrescenta, o × tira; a região e a nota gravam ao sair; o nome do livro continua achando', async () => {
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    const grafia = screen.getByRole('textbox', { name: 'Outras grafias' })
    await userEvent.type(grafia, 'Khirbet Probe{Enter}')
    await waitFor(() => expect(dados('TESTE-2').variantes).toEqual(['Khirbet Probe']))
    expect(grafia).toHaveValue('')
    await userEvent.type(grafia, 'khirbet  probe{Enter}')
    expect(dados('TESTE-2').variantes).toEqual(['Khirbet Probe']) // a mesma, pela dobra
    await userEvent.click(screen.getByRole('button', { name: 'Tirar a grafia Khirbet Probe' }))
    await waitFor(() => expect(dados('TESTE-2').variantes).toEqual([]))
    await userEvent.type(screen.getByRole('textbox', { name: 'Região ou país' }), 'Judeia')
    await userEvent.type(screen.getByRole('textbox', { name: 'Nota' }), 'Conferir no artigo.')
    await act_descarregar()
    await waitFor(() => expect(dados('TESTE-2')).toMatchObject({ regiao: 'Judeia', nota: 'Conferir no artigo.' }))
    expect(screen.getByText('Sítio · Judeia')).toBeInTheDocument()
  })

  it('um sítio do livro não se exclui, só se corrige', async () => {
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    expect(screen.queryByRole('button', { name: /Excluir o sítio/ })).toBeNull()
  })
})

async function act_descarregar() {
  const { act } = await import('@testing-library/react')
  await act(() => descarregarPendentes())
}

describe('excluir um sítio do usuário (reversível) e o aviso de nome repetido', () => {
  it('"Excluir o sítio" pede a confirmação com o nome e o número de objetos; excluído, volta para a lista, que oferece "Restaurar"', async () => {
    await registrar('sitio', 'SI-aaaaaaaa-5', 'criar', { nome: 'Sítio efêmero' })
    renderizarRota('/sitio/SI-aaaaaaaa-5')
    await screen.findByRole('heading', { level: 1, name: 'Sítio efêmero' })
    await userEvent.click(screen.getByRole('button', { name: 'Excluir o sítio' }))
    const grupo = screen.getByRole('group', { name: 'Excluir o sítio «Sítio efêmero»?' })
    expect(grupo).toHaveTextContent('Nenhum objeto usa este sítio.')
    expect(grupo).toHaveTextContent('Dá para restaurar depois.')
    await userEvent.click(within(grupo).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(estadoAtual().registro('sitio', 'SI-aaaaaaaa-5')!.excluido).toBe(true))
    expect(await screen.findByText('Sítio «Sítio efêmero» excluído.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar o sítio' }))
    await waitFor(() => expect(estadoAtual().registro('sitio', 'SI-aaaaaaaa-5')!.excluido).toBe(false))
  })

  it('a página de um sítio excluído (por endereço) diz que foi excluído e oferece "Restaurar o sítio"', async () => {
    await registrar('sitio', 'SI-aaaaaaaa-6', 'criar', { nome: 'Sítio guardado' })
    await registrar('sitio', 'SI-aaaaaaaa-6', 'excluir')
    renderizarRota('/sitio/SI-aaaaaaaa-6')
    await screen.findByRole('heading', { level: 1, name: 'Sítio guardado' })
    expect(screen.getByText(/Este sítio foi excluído/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar o sítio' }))
    await waitFor(() => expect(estadoAtual().registro('sitio', 'SI-aaaaaaaa-6')!.excluido).toBe(false))
  })

  it('renomear um sítio para o nome de outro (do livro ou do usuário, sem diacríticos nem caixa) avisa, sem bloquear, e liga ao existente', async () => {
    renderizarRota('/sitio/SI-aaaaaaaa-2')
    await screen.findByRole('heading', { level: 1, name: 'Sítio só com nome' })
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    const nome = screen.getByRole('textbox', { name: 'Nome' })
    await userEvent.clear(nome)
    await userEvent.type(nome, 'MAHTES TESTE')
    const aviso = await screen.findByRole('note', { name: 'Possível duplicado' })
    expect(within(aviso).getByRole('link', { name: 'Maḥteṣ Teste' })).toHaveAttribute('href', '/sitio/TESTE-1')
    expect(aviso).toHaveTextContent('dos livros')
    expect(aviso).toHaveTextContent('Renomeie')
    await userEvent.tab()
    // não bloqueia: o nome foi gravado
    await waitFor(() => expect(dados('SI-aaaaaaaa-2').nome).toBe('MAHTES TESTE'))
    await userEvent.clear(nome)
    await userEvent.type(nome, 'tall inventada')
    expect(within(await screen.findByRole('note', { name: 'Possível duplicado' })).getByRole('link', { name: 'Tell Inventado' })).toHaveAttribute('href', '/sitio/SI-aaaaaaaa-1')
    fireEvent.blur(nome)
    await waitFor(() => expect(dados('SI-aaaaaaaa-2').nome).toBe('tall inventada'))
    await registrar('sitio', 'SI-aaaaaaaa-2', 'alterar', { nome: 'Sítio só com nome' })
  })
})
