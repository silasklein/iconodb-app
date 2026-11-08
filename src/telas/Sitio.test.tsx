import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { RAIZ_DO_PACOTE_6 } from '../../tests/suporte/fonteDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { B, ev } from '../../tests/suporte/eventosDeTeste'
import { desfazerMescla } from '../sitios/operacoes'
import { estadoAtual, receberEventos, registrar } from '../usuario/estado'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

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
    // F1: o identificador sob o título de um sítio dos livros é o número do sítio, não o verbete-nome (GL-)
    expect(screen.getByText('TESTE-2 · 3 objetos')).toHaveClass('codigo')
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
    // TESTE-4 (mesclado em TESTE-2 no pacote 8) daria a coordenada dele (`dadosDoDestino`): sem ela também
    await executar('UPDATE pub_TESTE.site SET lat = NULL, lon = NULL WHERE id IN (2, 4)')
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    expect(screen.getByText('sem coordenada')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /mapa/ })).not.toBeInTheDocument()
  })

  it('sem coordenada, mas com um sítio mesclado nele que tem (TESTE-4): a dele, dita de onde vem (Parte 2C, bloco 2)', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar('UPDATE pub_TESTE.site SET lat = NULL, lon = NULL WHERE id = 2')
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    const coord = screen.getByRole('region', { name: 'Coordenada' })
    expect(await within(coord).findByText('31,91330 N · 35,20710 E')).toBeInTheDocument()
    expect(within(coord).getByText('a de Tel Probe Teste, mesclado aqui')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir no mapa' })).toHaveAttribute('href', '/sitios?foco=TESTE-2')
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
    await executar('UPDATE pub_TESTE.site SET lat = NULL, lon = NULL WHERE id = 4')
    renderizarRota('/sitio/TESTE-2')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    expect(screen.queryByRole('link', { name: 'Abrir no mapa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Abrir no OpenStreetMap' })).not.toBeInTheDocument()
    expect(screen.getByText('sem coordenada')).toBeInTheDocument()
    usarMotor(null)
  })
})

describe('F11: com o pacote do schema 6 de antes (o que está no Dropbox), a página e a lista dos sítios abrem como hoje', () => {
  beforeEach(async () => usarMotor(await bancoDeTeste({ raiz: RAIZ_DO_PACOTE_6 })))

  it('a página do sítio: nome, contagem, coordenada e objetos', async () => {
    renderizarRota('/sitio/TESTE-2')
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })).toBeInTheDocument()
    expect(screen.getByText('TESTE-2 · 3 objetos')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Coordenada' })).getByText('31,91320 N · 35,20710 E')).toBeInTheDocument()
    const objetos = screen.getByRole('region', { name: 'Objetos deste sítio' })
    expect(within(objetos).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/item/CA00003', '/item/CA00004', '/item/BA00002'])
  })

  it('a lista tem os três sítios do pacote 6; o SI-… publicado continua a levar ao do livro', async () => {
    const r = renderizarRota('/sitios')
    await screen.findAllByRole('link', { name: /^Tell Probe Teste/ })
    await waitFor(() =>
      expect(screen.getAllByRole('link').map((a) => a.getAttribute('href')).filter((h) => h?.startsWith('/sitio/'))).toEqual(['/sitio/TESTE-1', '/sitio/TESTE-2', '/sitio/TESTE-3']),
    )
    r.unmount()
    renderizarRota('/sitio/SI-teste123-2')
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })).toBeInTheDocument()
    expect(screen.getByTestId('endereco')).toHaveTextContent('/sitio/TESTE-2')
  })
})

/**
 * Parte 2C, bloco 2 (Tarefa 11): mesclar na página do sítio, «Mesclado aqui» com «desfazer», o aviso do endereço antigo e o de
 * conflito. O pacote 8 traz TESTE-4 «Tel Probe Teste» mesclado em TESTE-2 «Tell Probe Teste» (sem objetos), TESTE-5 «Área
 * Probe Teste» parte de TESTE-2 e TESTE-6 «Túmulo Probe Teste» parte de TESTE-5. TESTE-1 «Maḥteṣ Teste» tem 3 objetos e a grafia
 * dos livros «al-Maḥṭaṣ Teste».
 */
describe('mesclar e desfazer na página do sítio', () => {
  beforeAll(async () => {
    usarMotor(await bancoDeTeste())
    await registrar('sitio', 'SI-mesclaaa-1', 'criar', { nome: 'Tell Excluído Teste' })
    await registrar('sitio', 'SI-mesclaaa-1', 'excluir')
  })
  beforeEach(async () => usarMotor(await bancoDeTeste()))

  const grupo = (nome: string | RegExp) => screen.findByRole('group', { name: nome })
  const opcoes = () => screen.queryAllByRole('option').map((o) => o.querySelector('.form-escolha-rotulo')!.textContent)

  it('o link «Mesclar com outro sítio…» abaixo dos botões; num sítio excluído, não', async () => {
    const r = renderizarRota('/sitio/TESTE-2')
    expect(await screen.findByRole('button', { name: 'Mesclar com outro sítio…' })).toHaveAttribute('aria-expanded', 'false')
    r.unmount()
    renderizarRota('/sitio/SI-mesclaaa-1')
    await screen.findByText(/Este sítio foi excluído/)
    expect(screen.queryByRole('button', { name: 'Mesclar com outro sítio…' })).not.toBeInTheDocument()
  })

  it('passo a: o foco no campo; sem o próprio sítio, os mesclados, os excluídos e as partes; a parte digitada explica por quê', async () => {
    renderizarRota('/sitio/TESTE-2')
    await userEvent.click(await screen.findByRole('button', { name: 'Mesclar com outro sítio…' }))
    const caixa = await grupo('Mesclar Tell Probe Teste com outro sítio')
    const campo = within(caixa).getByRole('combobox', { name: 'Com qual sítio?' })
    await waitFor(() => expect(campo).toHaveFocus())
    expect(within(caixa).getByText('Procura no nome, no nome do livro e nas outras grafias, com ou sem diacríticos.')).toBeInTheDocument()
    await userEvent.type(campo, 'teste')
    await waitFor(() => expect(opcoes()).toContain('Maḥteṣ Teste'))
    expect(opcoes()).not.toContain('Tell Probe Teste')
    expect(opcoes()).not.toContain('Tel Probe Teste')
    expect(opcoes()).not.toContain('Área Probe Teste')
    expect(opcoes()).not.toContain('Túmulo Probe Teste')
    expect(opcoes()).not.toContain('Tell Excluído Teste')
    await userEvent.clear(campo)
    await userEvent.type(campo, 'tumulo')
    expect(await within(caixa).findByText('Túmulo Probe Teste é parte de Tell Probe Teste: para juntá-los, primeiro solte a parte.')).toHaveAttribute('role', 'status')
    expect(opcoes()).toEqual([])
    await userEvent.click(within(caixa).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('group', { name: /Mesclar Tell Probe Teste/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mesclar com outro sítio…' })).toHaveFocus()
  })

  it('numa parte, o todo acima dela não se oferece: a lista explica', async () => {
    renderizarRota('/sitio/TESTE-6')
    await userEvent.click(await screen.findByRole('button', { name: 'Mesclar com outro sítio…' }))
    const caixa = await grupo('Mesclar Túmulo Probe Teste com outro sítio')
    await userEvent.type(within(caixa).getByRole('combobox'), 'tell probe')
    expect(await within(caixa).findByText('Túmulo Probe Teste é parte de Tell Probe Teste: para juntá-los, primeiro solte a parte.')).toBeInTheDocument()
    expect(opcoes()).toEqual([])
  })

  it('b e c numa caixa: a sugestão marcada, o foco em «Cancelar», o texto que muda com a escolha; «Mesclar» grava mescladoEm no que entra', async () => {
    renderizarRota('/sitio/TESTE-2')
    await userEvent.click(await screen.findByRole('button', { name: 'Mesclar com outro sítio…' }))
    await userEvent.type(within(await grupo(/com outro sítio/)).getByRole('combobox'), 'mahtes')
    await userEvent.click(await screen.findByRole('option', { name: /^Maḥteṣ Teste/ }))
    const caixa = await grupo('Mesclar Tell Probe Teste e Maḥteṣ Teste')
    await waitFor(() => expect(within(caixa).getByRole('button', { name: 'Cancelar' })).toHaveFocus())
    expect(within(caixa).getByRole('group', { name: 'Qual fica?' })).toBeInTheDocument()
    expect(within(caixa).getByText('Sugestão: o de número menor, que entrou primeiro.')).toBeInTheDocument()
    const t1 = within(caixa).getByRole('radio', { name: /Maḥteṣ Teste/ })
    const t2 = within(caixa).getByRole('radio', { name: /Tell Probe Teste/ })
    expect(t1).toBeChecked()
    expect(t1.closest('label')).toHaveTextContent('Maḥteṣ Testedos livrosTESTE-13 objetos')
    expect(within(caixa).getByText('Maḥteṣ Teste fica. Tell Probe Teste entra nele:')).toBeInTheDocument()
    const lista = () => within(caixa).getAllByRole('listitem').map((li) => li.textContent)
    expect(lista()).toEqual([
      'o nome «Tell Probe Teste» e a grafia «Tel Probe Teste» passam a ser grafias de Maḥteṣ Teste;',
      'os 3 objetos e a parte de Tell Probe Teste passam a contar em Maḥteṣ Teste;',
      'a coordenada que vale é a de Maḥteṣ Teste.',
    ])
    await userEvent.click(t2)
    expect(within(caixa).getByText('Tell Probe Teste fica. Maḥteṣ Teste entra nele:')).toBeInTheDocument()
    expect(lista()).toEqual([
      'o nome «Maḥteṣ Teste» e a grafia «al-Maḥṭaṣ Teste» passam a ser grafias de Tell Probe Teste;',
      'os 3 objetos de Maḥteṣ Teste passam a contar em Tell Probe Teste;',
      'a coordenada que vale é a de Tell Probe Teste.',
    ])
    expect(within(caixa).getByText('Nada é copiado. Dá para desfazer depois, na página de Tell Probe Teste.')).toBeInTheDocument()
    expect(estadoAtual().registro('sitio', 'TESTE-1')?.campos.mescladoEm).toBeUndefined()
    await userEvent.click(within(caixa).getByRole('button', { name: 'Mesclar' }))
    await waitFor(() => expect(estadoAtual().registro('sitio', 'TESTE-1')?.campos.mescladoEm).toBe('TESTE-2'))
    try {
      // a página que ficou: «Mesclado aqui», a contagem e a grade com os objetos do que entrou
      await waitFor(() => expect(screen.getByText('TESTE-2 · 6 objetos')).toBeInTheDocument())
      const objetos = screen.getByRole('region', { name: 'Objetos deste sítio' })
      await waitFor(() => expect(within(objetos).getAllByRole('link')).toHaveLength(6))
      const dados = screen.getByRole('region', { name: 'Dados do sítio' })
      expect(within(dados).getByText('Mesclado aqui')).toBeInTheDocument()
      const linhas = [...dados.querySelectorAll('.sitio-mesclado')].map((l) => l.textContent)
      // um por absorvido, em ordem de id (TESTE-1, TESTE-4)
      expect(linhas).toEqual(['Maḥteṣ Teste(dos livros)desfazer', 'Tel Probe Teste(dos livros)desfazer'])
    } finally {
      await act(() => desfazerMescla('TESTE-1', []))
    }
  })

  it('Tarefa 15: `?mesclar=<id>` (o «Mesclar…» da Revisão) abre já em «Qual fica?» com o par; fechar tira o parâmetro', async () => {
    renderizarRota('/sitio/TESTE-1?mesclar=TESTE-7')
    const caixa = await grupo('Mesclar Maḥteṣ Teste e Maḥtiṣ Teste')
    await waitFor(() => expect(within(caixa).getByRole('button', { name: 'Cancelar' })).toHaveFocus())
    expect(within(caixa).getByRole('radio', { name: /Maḥteṣ Teste/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Mesclar com outro sítio…' })).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(within(caixa).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('group', { name: /Mesclar Maḥteṣ Teste/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('endereco')).toHaveTextContent(/^\/sitio\/TESTE-1$/)
    expect(screen.getByRole('button', { name: 'Mesclar com outro sítio…' })).toHaveFocus()
  })

  it('Tarefa 15: «Mesclar» a partir de `?mesclar=` grava e tira o parâmetro; ficar com o outro não leva o parâmetro junto', async () => {
    renderizarRota('/sitio/TESTE-1?mesclar=TESTE-7')
    const caixa = await grupo('Mesclar Maḥteṣ Teste e Maḥtiṣ Teste')
    await userEvent.click(within(caixa).getByRole('radio', { name: /Maḥtiṣ Teste/ }))
    await userEvent.click(within(caixa).getByRole('button', { name: 'Mesclar' }))
    try {
      await screen.findByRole('heading', { level: 1, name: 'Maḥtiṣ Teste' })
      await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent(/^\/sitio\/TESTE-7$/))
      expect(screen.queryByRole('group', { name: /^Mesclar / })).not.toBeInTheDocument()
    } finally {
      await act(() => desfazerMescla('TESTE-1', []))
    }
  })

  it('M1: ficar com o OUTRO sítio leva a ele sem «Você abriu…», com «A e B agora são um só.» e o foco no título', async () => {
    renderizarRota('/sitio/TESTE-2')
    await userEvent.click(await screen.findByRole('button', { name: 'Mesclar com outro sítio…' }))
    await userEvent.type(within(await grupo(/com outro sítio/)).getByRole('combobox'), 'mahtes')
    await userEvent.click(await screen.findByRole('option', { name: /^Maḥteṣ Teste/ }))
    const caixa = await grupo('Mesclar Tell Probe Teste e Maḥteṣ Teste')
    // a sugestão (o de número menor) é Maḥteṣ Teste: Tell Probe Teste, o desta página, entra nele
    expect(within(caixa).getByRole('radio', { name: /Maḥteṣ Teste/ })).toBeChecked()
    await userEvent.click(within(caixa).getByRole('button', { name: 'Mesclar' }))
    try {
      const titulo = await screen.findByRole('heading', { level: 1, name: 'Maḥteṣ Teste' })
      expect(screen.getByTestId('endereco')).toHaveTextContent(/^\/sitio\/TESTE-1$/)
      expect(await screen.findByText('Maḥteṣ Teste e Tell Probe Teste agora são um só.')).toHaveAttribute('role', 'status')
      expect(screen.queryByText(/Você abriu/)).not.toBeInTheDocument()
      await waitFor(() => expect(titulo).toHaveFocus())
    } finally {
      await act(() => desfazerMescla('TESTE-2', []))
    }
  })

  it('«desfazer»: a confirmação no lugar com o que volta, o foco em «Cancelar»; «Desfazer» grava null e a mensagem leva ao que voltou', async () => {
    await registrar('sitio', 'TESTE-1', 'alterar', { mescladoEm: 'TESTE-2' })
    renderizarRota('/sitio/TESTE-2')
    const desfazer = await screen.findByRole('button', { name: 'desfazer a mesclagem de Maḥteṣ Teste' })
    await userEvent.click(desfazer)
    const caixa = await grupo('Desfazer a mesclagem de Maḥteṣ Teste?')
    expect(within(caixa).getByText(
      'Desfazer a mesclagem de Maḥteṣ Teste? Ele volta a ser um sítio à parte, com o nome, a grafia e os 3 objetos que tinha. Tell Probe Teste fica como estava antes dele.',
    )).toBeInTheDocument()
    await waitFor(() => expect(within(caixa).getByRole('button', { name: 'Cancelar' })).toHaveFocus())
    await userEvent.click(within(caixa).getByRole('button', { name: 'Cancelar' }))
    expect(desfazer).toHaveFocus()
    await userEvent.click(desfazer)
    await userEvent.click(within(await grupo('Desfazer a mesclagem de Maḥteṣ Teste?')).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(estadoAtual().registro('sitio', 'TESTE-1')?.campos.mescladoEm).toBeNull())
    const mensagem = await screen.findByText('Maḥteṣ Teste voltou a ser um sítio à parte.')
    const ver = within(mensagem.closest('p')!).getByRole('link', { name: 'Ver' })
    expect(ver).toHaveAttribute('href', '/sitio/TESTE-1')
    await waitFor(() => expect(ver).toHaveFocus())
    expect(screen.queryByRole('button', { name: 'desfazer a mesclagem de Maḥteṣ Teste' })).not.toBeInTheDocument()
  })

  it('o endereço antigo: o aviso logo abaixo do título, só na chegada; some ao abrir «Corrigir»', async () => {
    renderizarRota('/sitio/TESTE-4')
    const aviso = await screen.findByText('Você abriu Tel Probe Teste, que foi mesclado em Tell Probe Teste.')
    expect(aviso).toHaveAttribute('role', 'status')
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    expect(screen.queryByText(/Você abriu Tel Probe Teste/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Corrigir' }))
    expect(screen.queryByText(/Você abriu Tel Probe Teste/)).not.toBeInTheDocument()
  })

  it('as notas e a coordenada dos mesclados: um sítio seu com coordenada mesclado numa parte sem coordenada', async () => {
    await registrar('sitio', 'SI-mesclaaa-2', 'criar', { nome: 'Tell Coordenado Teste', lat: 31.5, lon: 35.25, regiao: 'Região Herdada' })
    await registrar('nota', 'NT-mesclaaa-1', 'criar', { texto: 'Nota feita no sítio que entrou', alvoTipo: 'sitio', alvo: 'SI-mesclaaa-2' })
    await registrar('sitio', 'SI-mesclaaa-2', 'alterar', { mescladoEm: 'TESTE-5' })
    try {
      renderizarRota('/sitio/TESTE-5')
      await screen.findByRole('heading', { level: 1, name: 'Área Probe Teste' })
      const coord = screen.getByRole('region', { name: 'Coordenada' })
      expect(await within(coord).findByText('31,5 N · 35,25 E')).toBeInTheDocument()
      expect(within(coord).getByText('a de Tell Coordenado Teste, mesclado aqui')).toBeInTheDocument()
      // M4: a região que veio do mesclado diz de onde, como a coordenada
      const dados = screen.getByRole('region', { name: 'Dados do sítio' })
      const regiao = within(dados).getByText('Região Herdada').closest('dd')!
      expect(regiao).toHaveTextContent('Região Herdadade Tell Coordenado Teste, mesclado aqui')
      expect(screen.getByRole('link', { name: 'Abrir no mapa' })).toHaveAttribute('href', '/sitios?foco=TESTE-5')
      expect(await screen.findByText('Nota feita no sítio que entrou')).toBeInTheDocument()
    } finally {
      await registrar('sitio', 'SI-mesclaaa-2', 'alterar', { mescladoEm: null })
    }
  })
})

describe('o aviso de conflito (dois aparelhos decidiram o contrário)', () => {
  beforeEach(async () => {
    usarMotor(await bancoDeTeste())
    try {
      localStorage.clear()
    } catch {
      // sem armazenamento
    }
  })

  it('só no aparelho que perdeu: o texto, «Ver no histórico» e «Entendi», que o esconde para sempre neste aparelho', async () => {
    await registrar('sitio', 'SI-conflaaa-1', 'criar', { nome: 'Tell Exemplo' })
    await registrar('sitio', 'SI-conflaaa-2', 'criar', { nome: 'Khirbet Modelo' })
    await registrar('sitio', 'SI-conflaaa-1', 'alterar', { mescladoEm: 'SI-conflaaa-2' })
    // outro aparelho, depois: o contrário
    await receberEventos([ev({ ap: B, seq: 900, ms: Date.now() + 3_600_000, tipo: 'sitio', reg: 'SI-conflaaa-2', op: 'alterar', campos: { mescladoEm: 'SI-conflaaa-1' } })])
    const r = renderizarRota('/sitio/SI-conflaaa-2')
    // o que ficou é Tell Exemplo (a decisão mais recente: Khirbet Modelo entrou nele)
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell Exemplo' })).toBeInTheDocument()
    const texto = await screen.findByText(
      'Neste aparelho você mesclou Tell Exemplo em Khirbet Modelo, mas outro aparelho mesclou Khirbet Modelo em Tell Exemplo depois; ficou a mais recente.',
    )
    const aviso = texto.closest('[role="status"]')!
    const historico = within(aviso as HTMLElement).getByRole('link', { name: 'Ver no histórico' })
    expect(historico).toHaveAttribute('href', '/sincronizacao#sync-hist')
    // M3: chega à Sincronização e rola até o histórico recente
    const rolar = vi.fn()
    const antes = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = rolar
    onTestFinished(() => {
      Element.prototype.scrollIntoView = antes
    })
    await userEvent.click(historico)
    const titulo = await screen.findByRole('heading', { name: 'Histórico recente' })
    expect(screen.getByTestId('endereco')).toHaveTextContent(/^\/sincronizacao$/)
    await waitFor(() => expect(rolar).toHaveBeenCalled())
    expect(rolar.mock.contexts[0]).toBe(titulo)
    expect(titulo).toHaveAttribute('id', 'sync-hist')
    r.unmount()
    const r2 = renderizarRota('/sitio/SI-conflaaa-2')
    const titulo2 = await screen.findByRole('heading', { level: 1, name: 'Tell Exemplo' })
    await userEvent.click(await screen.findByRole('button', { name: 'Entendi' }))
    expect(screen.queryByText(/Neste aparelho você mesclou/)).not.toBeInTheDocument()
    // M2: o foco vai ao título, não ao <body>
    expect(titulo2).toHaveFocus()
    r2.unmount()
    renderizarRota('/sitio/SI-conflaaa-1')
    await screen.findByRole('heading', { level: 1, name: 'Tell Exemplo' })
    expect(screen.queryByText(/Neste aparelho você mesclou/)).not.toBeInTheDocument()
  })

  it('o aparelho que venceu não vê aviso', async () => {
    await registrar('sitio', 'SI-conflbbb-1', 'criar', { nome: 'Tell Vencedor' })
    await registrar('sitio', 'SI-conflbbb-2', 'criar', { nome: 'Khirbet Perdedor' })
    // o outro aparelho decidiu ANTES; este decide depois (vence)
    await receberEventos([ev({ ap: B, seq: 901, ms: Date.now() - 3_600_000, tipo: 'sitio', reg: 'SI-conflbbb-1', op: 'alterar', campos: { mescladoEm: 'SI-conflbbb-2' } })])
    await registrar('sitio', 'SI-conflbbb-2', 'alterar', { mescladoEm: 'SI-conflbbb-1' })
    renderizarRota('/sitio/SI-conflbbb-1')
    await screen.findByRole('heading', { level: 1, name: 'Tell Vencedor' })
    await screen.findByText('Mesclado aqui')
    expect(screen.queryByText(/Neste aparelho você/)).not.toBeInTheDocument()
  })
})
