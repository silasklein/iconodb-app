/**
 * Tarefa 19 nas telas (decisão 36; SitiosMapa.dc.html, PC-SitiosMapa.dc.html): o filtro por região, o mapa com os sítios do
 * livro e os do usuário, o cartão do ponto, as teclas, «Mostrar no mapa» e «Abrir no mapa». Sobre o pacote sintético
 * (TESTE-1 Maḥteṣ Teste, TESTE-2 Tell Probe Teste, TESTE-3 Tell Usuário Teste, todos no Levante Sul) mais sítios do usuário.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { atalhoRegistrado } from '../app/atalhos'
import { executar, usarMotor } from '../banco/cliente'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { registrar } from '../usuario/estado'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
  await registrar('sitio', 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell do Egito', lat: 30.04, lon: 31.24 })
  await registrar('sitio', 'SI-aaaaaaaa-2', 'criar', { nome: 'Tell do Irã', lat: 32, lon: 50 })
  await registrar('sitio', 'SI-aaaaaaaa-3', 'criar', { nome: 'Sítio sem coordenada' })
  // dois sítios na mesma coordenada: um ponto só
  await registrar('sitio', 'SI-aaaaaaaa-4', 'criar', { nome: 'Gêmeo A', lat: 36.5, lon: 40.0 })
  await registrar('sitio', 'SI-aaaaaaaa-5', 'criar', { nome: 'Gêmeo B', lat: 36.5, lon: 40.0 })
  // um excluído: não aparece em lugar nenhum
  await registrar('sitio', 'SI-aaaaaaaa-6', 'criar', { nome: 'Sítio excluído', lat: 30.5, lon: 31.0 })
  await registrar('sitio', 'SI-aaaaaaaa-6', 'excluir', {})
  // um sítio do usuário que o pacote publicou como TESTE-3 (redirecionamento SI-teste123-1 → TESTE-3): aparece uma vez, como o do livro
  await registrar('sitio', 'SI-teste123-1', 'criar', { nome: 'Tell Usuário Teste', lat: 31.5, lon: 35.0 })
  // uma coordenada fora de todos os polígonos
  await registrar('sitio', 'SI-aaaaaaaa-7', 'criar', { nome: 'Sítio no Atlântico', lat: 10, lon: -30 })
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

const pontos = () => [...document.querySelectorAll<HTMLElement>('[data-ponto]')]
const nomesDosPontos = () => pontos().map((p) => p.getAttribute('aria-label')!.replace(/, \d+ (sítios, \d+ )?objetos?$/, ''))
const linhas = () => [...document.querySelectorAll<HTMLElement>('.sitio-linha')].map((l) => l.dataset.sitio)
const endereco = () => screen.getByTestId('endereco').textContent
const palco = () => screen.getByRole('group', { name: 'Mapa dos sítios' })
const chip = (nome: string) => screen.getByRole('button', { name: new RegExp(`^${nome}, `) })

async function abrir(url = '/sitios', largura = 1280) {
  instalarMatchMedia(largura, { hover: largura >= 768 })
  renderizarRota(url)
  const celularNoMapa = largura < 768 && (url.includes('vista=mapa') || url.includes('foco='))
  if (celularNoMapa) await screen.findByRole('group', { name: 'Modo de exibição' })
  else await screen.findByRole('searchbox', { name: 'Buscar sítio' })
  if (!url.startsWith('/sitio/') && (largura >= 768 || celularNoMapa)) await screen.findByRole('group', { name: 'Mapa dos sítios' })
  if (!celularNoMapa) await waitFor(() => expect(linhas().length).toBeGreaterThan(0))
  else await waitFor(() => expect(pontos().length).toBeGreaterThan(0))
}

describe('o filtro por região (etiquetas que se combinam)', () => {
  it('uma etiqueta por região, «Todas» e «Sem coordenada», com as contagens; região vazia é tracejada; a fora das regiões aparece', async () => {
    await abrir()
    const grupo = screen.getByRole('group', { name: 'Filtrar por região' })
    const nomes = within(grupo).getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    // Pacote 8: TESTE-5 a TESTE-8 a mais (TESTE-7 e TESTE-8 no Levante Sul, TESTE-5 e TESTE-6 sem coordenada); TESTE-4, mesclado
    // em TESTE-2, não aparece.
    expect(nomes).toEqual([
      'Todas, 13 sítios',
      'Levante Sul, 5 sítios',
      'Levante Norte, 2 sítios',
      'Transjordânia, 0 sítios (nenhum ainda)',
      'Egito, 1 sítio',
      'Mesopotâmia, 0 sítios (nenhum ainda)',
      'Anatólia, 0 sítios (nenhum ainda)',
      'Chipre, 0 sítios (nenhum ainda)',
      'Irã, 1 sítio',
      'Sem coordenada, 3 sítios',
      'Fora das regiões, 1 sítio',
    ])
    expect(within(grupo).getByRole('button', { name: 'Todas, 13 sítios' })).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Chipre')).toHaveClass('regiao-chip-vazia')
  })

  it('as etiquetas combinam (união) e filtram a lista e o mapa; o endereço guarda o filtro', async () => {
    await abrir()
    expect(linhas()).toHaveLength(13) // pacote 8: TESTE-5 a TESTE-8 a mais (TESTE-4, mesclado, não)
    expect(pontos()).toHaveLength(9) // 13 sítios, 3 sem coordenada, 2 de uma coordenada só (Gêmeos)
    await userEvent.click(chip('Egito'))
    expect(endereco()).toBe('/sitios?regioes=egito')
    await waitFor(() => expect(linhas()).toEqual(['SI-aaaaaaaa-1']))
    expect(nomesDosPontos()).toEqual(['Tell do Egito'])
    expect(chip('Egito')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Todas, / })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip('Irã'))
    expect(endereco()).toBe('/sitios?regioes=egito%2Cira')
    await waitFor(() => expect(linhas().sort()).toEqual(['SI-aaaaaaaa-1', 'SI-aaaaaaaa-2']))
    expect(nomesDosPontos().sort()).toEqual(['Tell do Egito', 'Tell do Irã'])
    expect(screen.getByRole('status', { name: '' , hidden: false })).toBeTruthy()
    expect(screen.getByText('2 sítios')).toBeInTheDocument()
    await userEvent.click(chip('Egito')) // tirar uma
    await waitFor(() => expect(linhas()).toEqual(['SI-aaaaaaaa-2']))
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtro' }))
    await waitFor(() => expect(linhas()).toHaveLength(13))
    expect(endereco()).toBe('/sitios')
  })

  it('E-5: a faixa da lista filtrada diz a região no celular («1 SÍTIO · EGITO») e só conta no computador', async () => {
    await abrir('/sitios?regioes=egito', 375)
    await waitFor(() => expect(linhas()).toEqual(['SI-aaaaaaaa-1']))
    expect(document.querySelector('.sitios-contagem [role="status"]')).toHaveTextContent(/^1 sítio · Egito$/)
    cleanup()
    await abrir('/sitios?regioes=egito,ira', 375)
    await waitFor(() => expect(linhas().sort()).toEqual(['SI-aaaaaaaa-1', 'SI-aaaaaaaa-2']))
    expect(document.querySelector('.sitios-contagem [role="status"]')).toHaveTextContent(/^2 sítios · Egito, Irã$/)
    cleanup()
    // m-1: a ordem é a das etiquetas (REGIOES), não a dos toques na URL
    await abrir('/sitios?regioes=ira,egito', 375)
    await waitFor(() => expect(linhas().sort()).toEqual(['SI-aaaaaaaa-1', 'SI-aaaaaaaa-2']))
    expect(document.querySelector('.sitios-contagem [role="status"]')).toHaveTextContent(/^2 sítios · Egito, Irã$/)
    cleanup()
    await abrir('/sitios?regioes=egito')
    await waitFor(() => expect(linhas()).toEqual(['SI-aaaaaaaa-1']))
    expect(document.querySelector('.sitios-contagem [role="status"]')).toHaveTextContent(/^1 sítio$/)
  })

  it('«Todas» limpa as regiões; «Sem coordenada» filtra a lista e o mapa diz que não há ponto', async () => {
    await abrir('/sitios?regioes=egito')
    await waitFor(() => expect(linhas()).toEqual(['SI-aaaaaaaa-1']))
    await userEvent.click(screen.getByRole('button', { name: /^Todas, / }))
    await waitFor(() => expect(linhas()).toHaveLength(13))
    await userEvent.click(chip('Sem coordenada'))
    await waitFor(() => expect(linhas()).toEqual(['TESTE-5', 'SI-aaaaaaaa-3', 'TESTE-6'])) // pacote 8: as partes sem coordenada
    expect(pontos()).toHaveLength(0)
    expect(screen.getByText('Nenhum sítio com coordenada neste filtro.')).toBeInTheDocument()
  })

  it('o filtro vem do endereço, combina com a busca por texto e uma região desconhecida é ignorada', async () => {
    await abrir('/sitios?regioes=levante-norte,xyz&filtro=g%C3%AAmeo%20b')
    await waitFor(() => expect(linhas()).toEqual(['SI-aaaaaaaa-5']))
    expect(chip('Levante Norte')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('searchbox', { name: 'Buscar sítio' })).toHaveValue('gêmeo b')
  })

  it('o filtro volta ao endereço depois de abrir um sítio e voltar', async () => {
    await abrir('/sitios?regioes=ira')
    await waitFor(() => expect(linhas()).toEqual(['SI-aaaaaaaa-2']))
    await userEvent.click(screen.getByRole('link', { name: /^Tell do Irã/ }))
    await screen.findByRole('heading', { level: 2, name: 'Tell do Irã' })
    expect(endereco()).toBe('/sitio/SI-aaaaaaaa-2?regioes=ira')
  })
})

describe('os sítios no mapa', () => {
  it('um ponto por coordenada, com o nome e a contagem; o excluído, o sem coordenada e o redirecionado repetido não entram', async () => {
    await abrir()
    const nomes = nomesDosPontos()
    expect(nomes).toContain('Tell do Egito')
    expect(nomes).toContain('Tell do Irã')
    expect(nomes).toContain('Gêmeo A e Gêmeo B') // a mesma coordenada: um ponto só
    expect(nomes).toContain('Maḥteṣ Teste')
    expect(nomes).toContain('Tell Probe Teste')
    expect(nomes).not.toContain('Sítio excluído')
    expect(nomes).not.toContain('Sítio sem coordenada')
    // TESTE-3 (do livro) e o SI-teste123-1 que virou ele: um ponto, uma linha
    expect(nomes.filter((n) => n === 'Tell Usuário Teste')).toHaveLength(1)
    expect(linhas().filter((l) => l === 'TESTE-3' || l === 'SI-teste123-1')).toEqual(['TESTE-3'])
    expect(screen.queryByRole('link', { name: /Sítio excluído/ })).not.toBeInTheDocument()
    const gemeos = screen.getByRole('button', { name: 'Gêmeo A e Gêmeo B, 2 sítios, 0 objetos' })
    expect(gemeos).toHaveAttribute('aria-pressed', 'false')
  })

  it('o mapa é só desenho local: nenhum pedido de rede', async () => {
    const pedido = vi.spyOn(globalThis, 'fetch')
    await abrir()
    expect(pedido).not.toHaveBeenCalled()
    pedido.mockRestore()
  })

  it('clicar no ponto abre o cartão (nome, coordenada, região, objetos, «Abrir sítio»); clicar de novo, Fechar e Esc fecham', async () => {
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Tell do Egito, 0 objetos' }))
    const cartao = await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell do Egito' })
    expect(within(cartao).getByText('30,04 N · 31,24 E')).toBeInTheDocument()
    expect(within(cartao).getByText('Egito · 0 objetos')).toBeInTheDocument()
    expect(within(cartao).getByRole('link', { name: 'Abrir sítio' })).toHaveAttribute('href', '/sitio/SI-aaaaaaaa-1')
    expect(screen.getByRole('button', { name: 'Tell do Egito, 0 objetos' })).toHaveAttribute('aria-pressed', 'true')
    // o foco vai ao «Abrir sítio»
    await waitFor(() => expect(within(cartao).getByRole('link', { name: 'Abrir sítio' })).toHaveFocus())
    // a linha do sítio fica marcada
    expect(document.querySelector('[data-sitio="SI-aaaaaaaa-1"]')).toHaveClass('sitio-linha-selecionada')
    // Esc fecha e o foco volta ao ponto
    await waitFor(() => expect(atalhoRegistrado('Escape', 'mapa')).toBe(true))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tell do Egito, 0 objetos' })).toHaveFocus())
    expect(document.querySelector('[data-sitio="SI-aaaaaaaa-1"]')).not.toHaveClass('sitio-linha-selecionada')
    // outro ponto, e o botão Fechar
    await userEvent.click(screen.getByRole('button', { name: 'Tell do Irã, 0 objetos' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('o cartão de um ponto com vários sítios lista cada um com o seu «Abrir sítio» (genérico sobre os sítios do ponto)', async () => {
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Gêmeo A e Gêmeo B, 2 sítios, 0 objetos' }))
    const cartao = await screen.findByRole('dialog', { name: 'Sítio selecionado: Gêmeo A e Gêmeo B' })
    expect(within(cartao).getByText('2 sítios neste ponto · 0 objetos')).toBeInTheDocument()
    expect(within(cartao).getByRole('link', { name: 'Abrir sítio Gêmeo A' })).toHaveAttribute('href', '/sitio/SI-aaaaaaaa-4')
    expect(within(cartao).getByRole('link', { name: 'Abrir sítio Gêmeo B' })).toHaveAttribute('href', '/sitio/SI-aaaaaaaa-5')
  })

  it('o cartão traz as miniaturas dos objetos do sítio (do livro) e o «+N» quando passam de quatro', async () => {
    await abrir()
    const probe = screen.getByRole('button', { name: /^Tell Probe Teste, 3 objetos/ })
    await userEvent.click(probe)
    const cartao = await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell Probe Teste' })
    const lista = await within(cartao).findByRole('list', { name: 'Objetos de Tell Probe Teste' })
    await waitFor(() => expect(within(lista).getAllByRole('link').length).toBe(3))
    for (const a of within(lista).getAllByRole('link')) expect(a.getAttribute('href')).toMatch(/^\/item\/[A-Z]{2}\d+$/)
  })

  it('passar o mouse numa linha acende o ponto (anel) e passar o mouse no ponto acende a linha', async () => {
    await abrir()
    const linha = document.querySelector<HTMLElement>('[data-sitio="SI-aaaaaaaa-2"]')!
    expect(document.querySelector('.mapa-anel')).toBeNull()
    await userEvent.hover(within(linha).getByRole('link'))
    await waitFor(() => expect(document.querySelector('[data-anel]')).not.toBeNull())
    expect(linha).toHaveClass('sitio-linha-acesa')
    await userEvent.unhover(within(linha).getByRole('link'))
    await waitFor(() => expect(document.querySelector('[data-anel]')).toBeNull())
    expect(linha).not.toHaveClass('sitio-linha-acesa')
    // e ao contrário
    await userEvent.hover(screen.getByRole('button', { name: 'Tell do Egito, 0 objetos' }))
    await waitFor(() => expect(document.querySelector('[data-sitio="SI-aaaaaaaa-1"]')).toHaveClass('sitio-linha-acesa'))
    await userEvent.unhover(screen.getByRole('button', { name: 'Tell do Egito, 0 objetos' }))
    await waitFor(() => expect(document.querySelector('[data-sitio="SI-aaaaaaaa-1"]')).not.toHaveClass('sitio-linha-acesa'))
    // o foco do teclado também acende
    act(() => screen.getByRole('button', { name: 'Tell do Irã, 0 objetos' }).focus())
    await waitFor(() => expect(document.querySelector('[data-sitio="SI-aaaaaaaa-2"]')).toHaveClass('sitio-linha-acesa'))
  })
})

describe('teclado e botões do mapa', () => {
  const k = () => Number(palco().dataset.k)
  const x = () => Number(palco().dataset.x)
  const y = () => Number(palco().dataset.y)
  const tecla = async (t: string) => {
    await waitFor(() => expect(atalhoRegistrado(t, 'mapa')).toBe(true)) // o mapa registra num efeito: espera antes de apertar
    fireEvent.keyDown(document.body, { key: t })
  }

  it('+ e − aproximam e afastam, 0 mostra tudo; os botões fazem o mesmo; nada passa dos limites', async () => {
    await abrir()
    const k0 = k()
    await tecla('+')
    await waitFor(() => expect(k()).toBeGreaterThan(k0))
    const k1 = k()
    await tecla('-')
    await waitFor(() => expect(k()).toBeLessThan(k1))
    await userEvent.click(screen.getByRole('button', { name: 'Aproximar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Aproximar' }))
    await waitFor(() => expect(k()).toBeGreaterThan(k1))
    await tecla('0')
    await waitFor(() => expect(k()).toBeCloseTo(k0, 3))
    for (let i = 0; i < 12; i++) await userEvent.click(screen.getByRole('button', { name: 'Aproximar' }))
    await waitFor(() => expect(k()).toBe(6))
    await userEvent.click(screen.getByRole('button', { name: 'Ver tudo' }))
    await waitFor(() => expect(k()).toBeCloseTo(k0, 3))
  })

  it('as setas movem o mapa só com o foco no mapa; com o foco fora dele, não', async () => {
    await abrir()
    // bem aproximado: com a extensão inteira dentro do palco não há para onde arrastar
    for (let i = 0; i < 4; i++) await tecla('+')
    await waitFor(() => expect(k()).toBeGreaterThan(0.5))
    const x0 = x()
    const y0 = y()
    // foco no campo de busca (fora do palco): a seta não move o mapa
    act(() => screen.getByRole('searchbox', { name: 'Buscar sítio' }).focus())
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(x()).toBe(x0)
    // foco no palco: as setas movem
    act(() => palco().focus())
    await tecla('ArrowLeft')
    await waitFor(() => expect(x()).toBeGreaterThan(x0))
    await tecla('ArrowUp')
    await waitFor(() => expect(y()).toBeGreaterThan(y0))
  })

  it('+ − 0 R não valem dentro de um campo de texto', async () => {
    await abrir()
    await waitFor(() => expect(atalhoRegistrado('+', 'mapa')).toBe(true))
    const k0 = k()
    const campo = screen.getByRole('searchbox', { name: 'Buscar sítio' })
    act(() => campo.focus())
    await userEvent.keyboard('+0r-')
    expect(campo).toHaveValue('+0r-')
    expect(k()).toBe(k0)
    expect(screen.getByRole('checkbox', { name: /Limites das regiões/ })).not.toBeChecked()
  })

  it('R liga e desliga os limites das regiões (a caixa de marcação acompanha); os nomes das regiões aparecem', async () => {
    await abrir()
    const caixa = screen.getByRole('checkbox', { name: /Limites das regiões/ })
    expect(caixa).not.toBeChecked()
    expect(document.querySelectorAll('path.mapa-regiao')).toHaveLength(0)
    await tecla('r')
    await waitFor(() => expect(caixa).toBeChecked())
    // as arestas das regiões, traçadas uma vez só, e o nome de cada região
    expect(document.querySelectorAll('path[data-regiao="todas"]')).toHaveLength(1)
    expect(document.querySelectorAll('path.mapa-regiao-ativa')).toHaveLength(0)
    expect(document.querySelectorAll('.mapa-rotulo-regiao')).toHaveLength(8)
    // a região do filtro ganha o contorno cheio
    await userEvent.click(chip('Egito'))
    await waitFor(() => expect(document.querySelectorAll('path.mapa-regiao-ativa[data-regiao="egito"]')).toHaveLength(1))
    await userEvent.click(caixa)
    await waitFor(() => expect(caixa).not.toBeChecked())
    expect(document.querySelectorAll('path.mapa-regiao')).toHaveLength(0)
  })

  it('as teclas do mapa ficam no catálogo (aria-keyshortcuts declarados)', async () => {
    const { teclasNaoDeclaradas } = await import('../test/atalhosDeclarados')
    await abrir()
    expect(teclasNaoDeclaradas(document.body)).toEqual([])
  })

  it('o palco tem nome e descrição de texto (a lista é o equivalente acessível) e cada ponto é um botão com o nome do sítio', async () => {
    await abrir()
    expect(palco()).toHaveAttribute('tabindex', '0')
    expect(palco()).toHaveAccessibleDescription(/A lista dos sítios é o equivalente em texto/)
    // as teclas entre os pontos, em palavras (não os símbolos do teclado de Mac): m14
    expect(palco()).toHaveAccessibleDescription(/Num ponto, as setas vão ao ponto vizinho; PgUp e PgDn percorrem todos; Home e End vão ao primeiro e ao último/)
    for (const p of pontos()) expect(p.tagName).toBe('BUTTON')
  })
})

describe('«Mostrar no mapa» e «Abrir no mapa»', () => {
  it('«Mostrar no mapa» (computador) abre o cartão do sítio e centra o mapa nele', async () => {
    await abrir()
    const k0 = Number(palco().dataset.k)
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar Tell do Irã no mapa' }))
    expect(await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell do Irã' })).toBeInTheDocument()
    await waitFor(() => expect(Number(palco().dataset.k)).toBeGreaterThan(k0))
    // o ponto fica no centro do palco (o palco de teste mede 800 x 600)
    const ponto = screen.getByRole('button', { name: 'Tell do Irã, 0 objetos' })
    const [px, py] = ponto.style.transform.match(/-?[\d.]+/g)!.map(Number)
    expect(px! + ponto.offsetWidth / 2 || px!).toBeTruthy()
    expect(Math.abs(px! - 400)).toBeLessThan(20)
    expect(Math.abs(py! - 300)).toBeLessThan(20)
  })

  it('/sitios?foco=<sítio> chega com o mapa centrado e o cartão aberto; um filtro que o esconde é desfeito', async () => {
    await abrir('/sitios?foco=SI-aaaaaaaa-1&regioes=ira', 1280)
    expect(await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell do Egito' })).toBeInTheDocument()
    await waitFor(() => expect(linhas()).toHaveLength(13)) // pacote 8: TESTE-5 a TESTE-8 a mais
    expect(chip('Irã')).toHaveAttribute('aria-pressed', 'false')
  })

  it('com ?foco= no endereço, mudar o filtro não centra de novo nem desfaz a escolha da pessoa', async () => {
    await abrir('/sitios?foco=SI-aaaaaaaa-1')
    expect(await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell do Egito' })).toBeInTheDocument()
    await userEvent.click(chip('Irã'))
    await waitFor(() => expect(linhas()).toEqual(['SI-aaaaaaaa-2']))
    expect(chip('Irã')).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip('Egito'))
    await waitFor(() => expect(linhas().sort()).toEqual(['SI-aaaaaaaa-1', 'SI-aaaaaaaa-2']))
    expect(chip('Irã')).toHaveAttribute('aria-pressed', 'true')
  })

  it('na página de um sítio aberta ao lado da lista, «Abrir no mapa» volta ao mapa, centrado e com o cartão do sítio', async () => {
    await abrir('/sitio/SI-aaaaaaaa-2')
    await screen.findByRole('heading', { level: 2, name: 'Tell do Irã' })
    expect(screen.queryByRole('group', { name: 'Mapa dos sítios' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Abrir no mapa' }))
    expect(await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell do Irã' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Mapa dos sítios' })).toBeInTheDocument()
  })

  it('a rota /sitios sem foco, no computador, não abre cartão', async () => {
    await abrir()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('celular: «Lista | Mapa», os filtros e a folha do sítio', () => {
  it('abre na lista; «Mapa» mostra o mapa (e esconde a lista); «Lista» volta; o endereço guarda a vista', async () => {
    await abrir('/sitios', 375)
    const grupo = screen.getByRole('group', { name: 'Modo de exibição' })
    expect(within(grupo).getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('group', { name: 'Mapa dos sítios' })).not.toBeInTheDocument()
    await userEvent.click(within(grupo).getByRole('button', { name: 'Mapa' }))
    expect(await screen.findByRole('group', { name: 'Mapa dos sítios' })).toBeInTheDocument()
    expect(endereco()).toBe('/sitios?vista=mapa')
    expect(within(grupo).getByRole('button', { name: 'Mapa' })).toHaveAttribute('aria-pressed', 'true')
    expect(linhas()).toHaveLength(0)
    // os filtros valem nos dois modos
    await userEvent.click(chip('Egito'))
    await waitFor(() => expect(nomesDosPontos()).toEqual(['Tell do Egito']))
    await userEvent.click(within(grupo).getByRole('button', { name: 'Lista' }))
    await waitFor(() => expect(linhas()).toEqual(['SI-aaaaaaaa-1']))
    expect(screen.queryByRole('group', { name: 'Mapa dos sítios' })).not.toBeInTheDocument()
  })

  it('tocar num ponto abre a folha do sítio, com «Abrir sítio»; os controles do mapa têm o alvo de toque', async () => {
    await abrir('/sitios?vista=mapa', 375)
    await userEvent.click(screen.getByRole('button', { name: 'Tell do Egito, 0 objetos' }))
    const folha = await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell do Egito' })
    expect(within(folha).getByRole('heading', { level: 2, name: 'Tell do Egito' })).toBeInTheDocument()
    expect(within(folha).getByRole('link', { name: 'Abrir sítio' })).toHaveAttribute('href', '/sitio/SI-aaaaaaaa-1')
    expect(folha).toHaveClass('cartao-ponto-folha')
    const barra = screen.getByRole('toolbar', { name: 'Controles do mapa' })
    expect(within(barra).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Aproximar', 'Afastar', 'Ver tudo', 'Limites das regiões'])
    expect(within(barra).getByRole('button', { name: 'Limites das regiões' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(within(barra).getByRole('button', { name: 'Limites das regiões' }))
    expect(within(barra).getByRole('button', { name: 'Limites das regiões' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('«Mostrar no mapa» numa linha da lista leva ao mapa, com o cartão aberto', async () => {
    await abrir('/sitios', 375)
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar Tell do Egito no mapa' }))
    expect(await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell do Egito' })).toBeInTheDocument()
    expect(endereco()).toContain('vista=mapa')
  })
})

describe('revisão 1: teclado entre os pontos, «+» no celular, cartão no canto, teclas na caixa de limites', () => {
  it('os pontos são UMA parada de Tab (tabindex 0 num só), e Tab não passa por todos', async () => {
    await abrir()
    const ps = pontos()
    expect(ps.length).toBeGreaterThan(3)
    expect(ps.filter((p) => p.tabIndex === 0)).toHaveLength(1)
    expect(ps.filter((p) => p.tabIndex === -1)).toHaveLength(ps.length - 1)
    // o ponto que ganha o foco vira a parada do grupo
    const outro = ps.find((p) => p.tabIndex === -1)!
    act(() => outro.focus())
    await waitFor(() => expect(outro.tabIndex).toBe(0))
    expect(pontos().filter((p) => p.tabIndex === 0)).toHaveLength(1)
  })

  it('com o foco num ponto, PageDown e PageUp percorrem todos os pontos, e Home e End vão às pontas', async () => {
    await abrir()
    await waitFor(() => expect(atalhoRegistrado('PageDown', 'mapa')).toBe(true))
    const todos = pontos().map((p) => p.dataset.ponto)
    act(() => pontos()[0]!.focus())
    await userEvent.keyboard('{Home}')
    const visitados = new Set<string | undefined>()
    for (let i = 0; i < todos.length + 1; i++) {
      visitados.add((document.activeElement as HTMLElement).dataset.ponto)
      await userEvent.keyboard('{PageDown}')
    }
    expect([...visitados].sort()).toEqual([...todos].sort())
    const ultimo = (document.activeElement as HTMLElement).dataset.ponto
    await userEvent.keyboard('{Home}')
    const primeiro = (document.activeElement as HTMLElement).dataset.ponto
    expect(primeiro).not.toBe(ultimo)
    await userEvent.keyboard('{End}')
    expect((document.activeElement as HTMLElement).dataset.ponto).toBe(ultimo)
    await userEvent.keyboard('{PageUp}')
    expect((document.activeElement as HTMLElement).dataset.ponto).not.toBe(ultimo)
  })

  it('com o foco num ponto, as setas vão ao vizinho (e não movem o mapa); com o foco no palco, movem o mapa', async () => {
    await abrir()
    await waitFor(() => expect(atalhoRegistrado('ArrowLeft', 'mapa')).toBe(true))
    const antes = palco().dataset.x
    act(() => pontos()[0]!.focus())
    const inicial = (document.activeElement as HTMLElement).dataset.ponto
    // alguma seta tem vizinho: o foco muda de ponto
    let mudou = false
    for (const seta of ['{ArrowRight}', '{ArrowLeft}', '{ArrowDown}', '{ArrowUp}']) {
      await userEvent.keyboard(seta)
      if ((document.activeElement as HTMLElement).dataset.ponto !== inicial) {
        mudou = true
        break
      }
    }
    expect(mudou).toBe(true)
    expect(palco().dataset.x).toBe(antes)
    act(() => palco().focus())
    await userEvent.keyboard('+')
    await waitFor(() => expect(Number(palco().dataset.k)).toBeGreaterThan(0))
    const aproximado = palco().dataset.x
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() => expect(palco().dataset.x).not.toBe(aproximado))
  })

  it('um clique no ponto (mouse) abre o cartão UMA vez: o clique que vem depois do soltar não o desfaz', async () => {
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Tell do Egito, 0 objetos' }))
    expect(await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell do Egito' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // pelo teclado (Enter no ponto): abre e Enter de novo no mesmo ponto fecha (o clique do teclado não é engolido)
    const ponto = screen.getByRole('button', { name: 'Tell do Egito, 0 objetos' })
    act(() => ponto.focus())
    fireEvent.click(ponto, { detail: 0 })
    expect(await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell do Egito' })).toBeInTheDocument()
  })

  it('no computador o cartão fica fixo no canto (sem posição calculada pelo ponto)', async () => {
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Tell do Irã, 0 objetos' }))
    const cartao = await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell do Irã' })
    expect(cartao).toHaveClass('cartao-ponto-flutuante')
    expect(cartao.getAttribute('style') ?? '').toBe('')
  })

  it('celular, modo mapa: «Novo sítio» é o «+» do topo, antes da busca; na lista continua o botão', async () => {
    await abrir('/sitios?vista=mapa', 375)
    const novo = screen.getByRole('link', { name: 'Novo sítio' })
    expect(novo).toHaveAttribute('href', '#/sitios/novo')
    expect(novo.closest('.topo-celular')).not.toBeNull()
    const topo = novo.closest('.topo-celular')!
    const nomes = [...topo.querySelectorAll('a,button')].map((b) => b.getAttribute('aria-label'))
    expect(nomes.indexOf('Novo sítio')).toBeGreaterThan(-1)
    expect(nomes.indexOf('Novo sítio')).toBeLessThan(nomes.indexOf('Buscar'))
    expect(screen.getAllByRole('link', { name: 'Novo sítio' })).toHaveLength(1)
    await userEvent.click(within(screen.getByRole('group', { name: 'Modo de exibição' })).getByRole('button', { name: 'Lista' }))
    const naLista = await screen.findByRole('link', { name: 'Novo sítio' })
    expect(naLista.closest('.topo-celular')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Novo sítio' })).toHaveLength(1)
  })

  it('com o foco na caixa «Limites das regiões», o R liga e desliga os limites (m9)', async () => {
    await abrir()
    await waitFor(() => expect(atalhoRegistrado('r', 'mapa')).toBe(true))
    const caixa = screen.getByRole('checkbox', { name: /Limites das regiões/ })
    act(() => caixa.focus())
    expect(caixa).not.toBeChecked()
    await userEvent.keyboard('r')
    await waitFor(() => expect(caixa).toBeChecked())
    await userEvent.keyboard('r')
    await waitFor(() => expect(caixa).not.toBeChecked())
    // numa caixa de texto continua sem valer
    const busca = screen.getByRole('searchbox', { name: 'Buscar sítio' })
    await userEvent.click(busca)
    await userEvent.keyboard('r')
    expect(busca).toHaveValue('r')
    expect(caixa).not.toBeChecked()
  })
})

describe('T17-C-25: o enquadramento do mapa acompanha a busca só depois de uma pausa', () => {
  const quadro = () => `${palco().getAttribute('data-k')}|${palco().getAttribute('data-x')}|${palco().getAttribute('data-y')}`

  it('digitar não refaz o enquadramento a cada letra (o mapa não se mexe sob o dedo); parou de digitar, ele se ajusta', async () => {
    await abrir()
    const antes = quadro()
    const busca = screen.getByRole('searchbox', { name: 'Buscar sítio' })
    await userEvent.type(busca, 'Irã')
    await waitFor(() => expect(nomesDosPontos()).toEqual(['Tell do Irã'])) // o filtro já agiu (os pontos acompanham a letra)
    expect(quadro()).toBe(antes) // mas o mapa ainda não foi reenquadrado
    // passada a pausa, o «Ver tudo» do que sobrou
    await waitFor(() => expect(quadro()).not.toBe(antes), { timeout: 3000 })
  })

  it('o filtro por região também reenquadra (a pausa é só da busca)', async () => {
    await abrir()
    const antes = quadro()
    await userEvent.click(chip('Egito'))
    await waitFor(() => expect(nomesDosPontos()).toEqual(['Tell do Egito']))
    await waitFor(() => expect(quadro()).not.toBe(antes))
  })
})

describe('T17-C-26: o nome de um mar não cobre um ponto', () => {
  const lugares = () => [...document.querySelectorAll('.mapa-lugar')].map((e) => e.textContent)

  it('«Mar Mediterrâneo» é escrito no lugar dele e some quando um sítio cairia debaixo do nome', async () => {
    // Pacote 8: TESTE-7 «Maḥtiṣ Teste» (32,5 N · 35,5 E) já cai debaixo do nome; o controle positivo é sem ele.
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar('DELETE FROM pub_TESTE.site WHERE id = 7')
    onTestFinished(async () => usarMotor(await bancoDeTeste()))
    await abrir()
    await waitFor(() => expect(lugares()).toContain('Mar Mediterrâneo')) // o controle positivo: com os pontos de sempre ele aparece
    // um sítio no centro do nome (33,0 N · 33,0 E, no mar)
    await registrar('sitio', 'SI-bbbbbbbb-1', 'criar', { nome: 'Tell no mar', lat: 33.0, lon: 33.0 })
    try {
      await waitFor(() => expect(nomesDosPontos()).toContain('Tell no mar'))
      expect(lugares()).not.toContain('Mar Mediterrâneo')
    } finally {
      await registrar('sitio', 'SI-bbbbbbbb-1', 'excluir', {})
    }
    await waitFor(() => expect(lugares()).toContain('Mar Mediterrâneo')) // sem o ponto, volta
  })
})

describe('T17-C-27: o cartão do computador cresce quando as miniaturas chegam', () => {
  it('o cartão do ponto escolhido é observado (como a folha do celular), para o mapa refazer a conta quando ele cresce', async () => {
    const observados: Element[] = []
    const original = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(_cb: ResizeObserverCallback) {}
      observe(el: Element) {
        observados.push(el)
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    try {
      await abrir('/sitios', 1280)
      await userEvent.click(screen.getByRole('button', { name: 'Tell do Egito, 0 objetos' }))
      const cartao = await screen.findByRole('dialog', { name: 'Sítio selecionado: Tell do Egito' })
      await waitFor(() => expect(observados.some((el) => el === cartao || el.contains(cartao) || cartao.contains(el))).toBe(true))
    } finally {
      globalThis.ResizeObserver = original
    }
  })
})

