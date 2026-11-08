/**
 * Tarefa 12: o formulário "Novo sítio" (NovoSitio.dc.html, PC-NovoSitio.dc.html): nome, outras grafias, região ou país,
 * coordenada (digitada ou colada; sem mapa nem rede), nota; o aviso de nome repetido; e o rascunho, que Esc e uma
 * navegação sem querer não descartam.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'
import { lerSitioSkc } from './modelo'
import { CHAVE_DO_RASCUNHO_DO_SITIO } from './rascunho'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
  await registrar('sitio', 'SI-aaaaaaaa-1', 'criar', { nome: 'Tell Inventado', variantes: ['Tall Inventada'], regiao: 'Negev' })
})
afterAll(() => usarMotor(null))
beforeEach(() => {
  localStorage.clear()
  instalarMatchMedia(375)
})

// o rótulo pode levar "(opcional)" depois do nome
const campo = (nome: string) => screen.getByRole('textbox', { name: new RegExp(`^${nome}( \\(opcional\\))?$`) })
const novos = () => [...(estadoAtual().registros.get('sitio')?.values() ?? [])].filter((r) => r.id !== 'SI-aaaaaaaa-1' && /^SI-/.test(r.id))
const rascunho = () => localStorage.getItem(CHAVE_DO_RASCUNHO_DO_SITIO)

describe('Novo sítio: registrar', () => {
  it('o formulário tem os campos do quadro e o botão "Registrar sítio"; nada é gravado até registrar', async () => {
    renderizarRota('/sitios/novo')
    expect(await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })).toBeInTheDocument()
    for (const n of ['Nome', 'Outras grafias', 'Região ou país', 'Latitude', 'Longitude', 'Nota']) expect(campo(n)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar sítio' })).toBeEnabled()
    expect(screen.getByText('Fica na sua camada (SKC) e já pode ser escolhido na ficha de qualquer objeto.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Fechar (o rascunho fica guardado)' })).toHaveAttribute('href', '#/sitios')
  })

  it('sem nome: o erro em linha, o foco no campo, nada gravado', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.click(screen.getByRole('button', { name: 'Registrar sítio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Dê um nome ao sítio.')
    expect(campo('Nome')).toHaveFocus()
    expect(campo('Nome')).toHaveAttribute('aria-invalid', 'true')
    expect(novos()).toHaveLength(0)
  })

  it('registra tudo: nome, grafias, região, coordenada colada em "lat; lon" e nota; abre a página do sítio; apaga o rascunho', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.type(campo('Nome'), '  Tell   Novo ')
    await userEvent.type(campo('Outras grafias'), 'Tall Naw{Enter}')
    await userEvent.type(campo('Outras grafias'), 'Tell Nuovo{Enter}')
    expect(screen.getByRole('button', { name: 'Tirar a grafia Tall Naw' })).toBeInTheDocument()
    await userEvent.type(campo('Região ou país'), 'Negev')
    await userEvent.click(campo('Latitude'))
    await userEvent.paste('31,77; 35,21')
    expect(campo('Latitude')).toHaveValue('31,77')
    expect(campo('Longitude')).toHaveValue('35,21')
    await userEvent.type(campo('Nota'), 'Coordenada do artigo.')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar sítio' }))
    await waitFor(() => expect(screen.getByTestId('endereco').textContent).toMatch(/^\/sitio\/SI-/))
    const id = decodeURIComponent(screen.getByTestId('endereco').textContent!.slice('/sitio/'.length))
    expect(estadoAtual().registro('sitio', id)!.campos).toEqual({ nome: 'Tell Novo', grafias: [{ texto: 'Tall Naw' }, { texto: 'Tell Nuovo' }], regiao: 'Negev', lat: 31.77, lon: 35.21, nota: 'Coordenada do artigo.' })
    expect(lerSitioSkc(estadoAtual().registro('sitio', id)!)).toMatchObject({ nomeDeAgora: 'Tell Novo', excluido: false })
    expect(rascunho()).toBeNull()
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell Novo' })).toBeInTheDocument()
  })

  it('só o nome: grava só o nome (os campos vazios não entram)', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    const antes = novos().length
    await userEvent.type(campo('Nome'), 'Só o nome{Enter}')
    // Enter no nome não envia (a grafia usa Enter); o botão sim
    expect(novos()).toHaveLength(antes)
    await userEvent.click(screen.getByRole('button', { name: 'Registrar sítio' }))
    await waitFor(() => expect(novos()).toHaveLength(antes + 1))
    expect(novos().find((r) => r.campos.nome === 'Só o nome')!.campos).toEqual({ nome: 'Só o nome' })
  })

  it('Ctrl+Enter registra, de dentro de um campo', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.type(campo('Nome'), 'Pelo atalho')
    fireEvent.keyDown(campo('Nome'), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(novos().some((r) => r.campos.nome === 'Pelo atalho')).toBe(true))
  })

  it('r2: Ctrl+Enter com o par inteiro ainda num campo só: a mensagem específica (ambígua), não a genérica; nada gravado', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    const antes = novos().length
    await userEvent.type(campo('Nome'), 'Par num campo só')
    await userEvent.type(campo('Latitude'), '31,77,35,21') // o foco fica no campo: nenhum blur
    fireEvent.keyDown(campo('Latitude'), { key: 'Enter', metaKey: true })
    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('«31,77,35,21» é ambígua: não dá para saber onde a vírgula separa a latitude da longitude.')
    expect(aviso).not.toHaveTextContent('Escreva a latitude como um número')
    expect(novos()).toHaveLength(antes)
  })

  it('r2: Ctrl+Enter com um par válido inteiro num campo só: registra com os dois números', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.type(campo('Nome'), 'Par colado e registrado')
    await userEvent.type(campo('Longitude'), '31.5, 35.5')
    fireEvent.keyDown(campo('Longitude'), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(novos().some((r) => r.campos.nome === 'Par colado e registrado')).toBe(true))
    expect(novos().find((r) => r.campos.nome === 'Par colado e registrado')!.campos).toMatchObject({ lat: 31.5, lon: 35.5 })
  })

  it('um clique duplo em "Registrar" cria um sítio só', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.type(campo('Nome'), 'Clique duplo')
    const b = screen.getByRole('button', { name: 'Registrar sítio' })
    await userEvent.dblClick(b)
    await waitFor(() => expect(screen.getByTestId('endereco').textContent).toMatch(/^\/sitio\/SI-/))
    expect(novos().filter((r) => r.campos.nome === 'Clique duplo')).toHaveLength(1)
  })

  it('as regiões que já existem aparecem como atalhos; tocar numa preenche o campo', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    const grupo = screen.getByRole('group', { name: 'Regiões existentes' })
    await userEvent.click(within(grupo).getByRole('button', { name: 'Negev' }))
    expect(campo('Região ou país')).toHaveValue('Negev')
  })
})

describe('Novo sítio: a coordenada (sem mapa, sem rede)', () => {
  it('colar um link do OpenStreetMap ou do Google Maps preenche latitude e longitude; vírgula decimal vira número', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.click(campo('Longitude'))
    await userEvent.paste('https://www.openstreetmap.org/?mlat=31.9132&mlon=35.2071#map=12/31.9/35.2')
    expect(campo('Latitude')).toHaveValue('31,9132')
    expect(campo('Longitude')).toHaveValue('35,2071')
    await userEvent.click(campo('Latitude'))
    await userEvent.clear(campo('Latitude'))
    await userEvent.paste('https://www.google.com/maps/@31.7683,35.2137,15z')
    expect(campo('Latitude')).toHaveValue('31,7683')
    expect(campo('Longitude')).toHaveValue('35,2137')
  })

  it('latitude fora da faixa, ambígua ou só uma das duas: a mensagem em português diz o formato; nada é gravado', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.type(campo('Nome'), 'Com coordenada ruim')
    await userEvent.type(campo('Latitude'), '131,2')
    await userEvent.type(campo('Longitude'), '35,2')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar sítio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Latitude entre −90 e 90 (recebi 131,2).')
    expect(campo('Latitude')).toHaveAttribute('aria-invalid', 'true')
    expect(campo('Latitude')).toHaveFocus()
    await userEvent.clear(campo('Latitude'))
    await userEvent.type(campo('Latitude'), '31,2')
    await userEvent.clear(campo('Longitude'))
    await userEvent.click(screen.getByRole('button', { name: 'Registrar sítio' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escreva a longitude.')
    expect(campo('Longitude')).toHaveFocus()
    expect(novos().filter((r) => r.campos.nome === 'Com coordenada ruim')).toHaveLength(0)
  })

  it('colar o ambíguo «31,77,35,21»: nada é colado e a mensagem diz que é ambígua e quais formatos valem', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.click(campo('Latitude'))
    await userEvent.paste('31,77,35,21')
    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('«31,77,35,21» é ambígua: não dá para saber onde a vírgula separa a latitude da longitude.')
    expect(aviso).toHaveTextContent('Use «31.77, 35.21», «31,77; 35,21», um link do OpenStreetMap (com #map=… ou mlat e mlon) ou um link do Google Maps (com @latitude,longitude).')
    expect(campo('Latitude')).toHaveValue('')
    expect(campo('Longitude')).toHaveValue('')
    expect(campo('Latitude')).toHaveAttribute('aria-invalid', 'true')
  })

  it('colar um link do OpenStreetMap fora da faixa diz qual valor está fora; o link não vai para o campo', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.click(campo('Longitude'))
    await userEvent.paste('https://www.openstreetmap.org/#map=12/95/35')
    expect(await screen.findByRole('alert')).toHaveTextContent('Latitude entre −90 e 90 (recebi 95).')
    expect(campo('Latitude')).toHaveValue('')
    expect(campo('Longitude')).toHaveValue('')
  })

  it('colar um link curto do Google Maps (maps.app.goo.gl, o do iPhone): diz que não dá para ler sem a internet e manda copiar as coordenadas', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.click(campo('Latitude'))
    await userEvent.paste('https://maps.app.goo.gl/AbC123xyz')
    const aviso = await screen.findByRole('alert')
    expect(aviso).toHaveTextContent('link curto do Google Maps')
    expect(aviso).toHaveTextContent('não consulta a internet')
    expect(aviso).toHaveTextContent('copie as coordenadas')
    expect(campo('Latitude')).toHaveValue('')
  })

  it('um link do Google sem coordenada (@…): a lista dos formatos que valem', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.click(campo('Latitude'))
    await userEvent.paste('https://www.google.com/maps/place/Tell+Teste')
    expect(await screen.findByRole('alert')).toHaveTextContent('Google Maps (com @latitude,longitude)')
  })

  it('DIGITAR o par inteiro num campo e sair: o par se preenche, ou a mensagem específica aparece', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.type(campo('Latitude'), '31,77,35,21')
    await userEvent.tab()
    expect(await screen.findByRole('alert')).toHaveTextContent('«31,77,35,21» é ambígua')
    expect(campo('Latitude')).toHaveValue('31,77,35,21') // o que foi digitado continua, para a pessoa corrigir
    await userEvent.clear(campo('Latitude'))
    await userEvent.type(campo('Latitude'), '31.77, 35.21')
    await userEvent.tab()
    await waitFor(() => expect(campo('Latitude')).toHaveValue('31,77'))
    expect(campo('Longitude')).toHaveValue('35,21')
    expect(screen.queryByRole('alert')).toBeNull()
    // um número só, fora da faixa, no outro campo: a mensagem da faixa
    await userEvent.clear(campo('Longitude'))
    await userEvent.type(campo('Longitude'), '200')
    await userEvent.tab()
    expect(await screen.findByRole('alert')).toHaveTextContent('Longitude entre −180 e 180 (recebi 200).')
  })

  it('a conferência vem ao sair do campo, com o mesmo texto', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.type(campo('Latitude'), '95')
    await userEvent.tab()
    expect(await screen.findByRole('alert')).toHaveTextContent('Latitude entre −90 e 90 (recebi 95).')
    await userEvent.clear(campo('Latitude'))
    await userEvent.type(campo('Latitude'), '31,5')
    await userEvent.tab()
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})

describe('Novo sítio: nome repetido (não bloqueia)', () => {
  it('um nome que é o de um sítio do livro, ou a grafia de um seu, mostra o aviso com o link; registrar continua possível', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.type(campo('Nome'), 'mahtes TESTE')
    const aviso = await screen.findByRole('note', { name: 'Possível duplicado' })
    expect(within(aviso).getByRole('link', { name: 'Maḥteṣ Teste' })).toHaveAttribute('href', '/sitio/TESTE-1')
    expect(aviso).toHaveTextContent('dos livros')
    await userEvent.clear(campo('Nome'))
    await userEvent.type(campo('Nome'), 'tall inventada')
    expect(within(await screen.findByRole('note', { name: 'Possível duplicado' })).getByRole('link', { name: 'Tell Inventado' })).toHaveAttribute('href', '/sitio/SI-aaaaaaaa-1')
    await userEvent.click(screen.getByRole('button', { name: 'Registrar sítio' }))
    await waitFor(() => expect(novos().some((r) => r.campos.nome === 'tall inventada')).toBe(true))
  })

  it('uma outra grafia repetida também avisa', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.type(campo('Outras grafias'), 'Tell Probe Teste')
    expect(await screen.findByRole('note', { name: 'Possível duplicado' })).toHaveTextContent('Tell Probe Teste')
  })
})

describe('Novo sítio: o rascunho não se perde', () => {
  it('cada mudança vai ao rascunho na hora; ao voltar à tela, tudo volta, com o aviso e "Descartar o rascunho"', async () => {
    const primeira = renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.type(campo('Nome'), 'Meio preenchido')
    await userEvent.type(campo('Outras grafias'), 'Meia grafia{Enter}')
    await userEvent.type(campo('Região ou país'), 'Negev')
    await userEvent.type(campo('Latitude'), '31,')
    expect(JSON.parse(rascunho()!)).toMatchObject({ nome: 'Meio preenchido', variantes: ['Meia grafia'], regiao: 'Negev', lat: '31,' })
    primeira.unmount()
    renderizarRota('/sitios/novo')
    expect(await screen.findByRole('status', { name: 'Rascunho recuperado' })).toHaveTextContent('Rascunho recuperado')
    expect(campo('Nome')).toHaveValue('Meio preenchido')
    expect(screen.getByRole('button', { name: 'Tirar a grafia Meia grafia' })).toBeInTheDocument()
    expect(campo('Latitude')).toHaveValue('31,')
    await userEvent.click(screen.getByRole('button', { name: 'Descartar o rascunho' }))
    expect(rascunho()).toBeNull()
    expect(campo('Nome')).toHaveValue('')
    expect(screen.queryByRole('status', { name: 'Rascunho recuperado' })).toBeNull()
  })

  it('Esc fecha a tela e GUARDA o rascunho (não descarta); uma navegação sem querer também', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.type(campo('Nome'), 'Não perder')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByTestId('endereco').textContent).toBe('/sitios'))
    expect(JSON.parse(rascunho()!).nome).toBe('Não perder')
    // voltar a "Novo sítio" traz tudo de volta
    await userEvent.click(await screen.findByRole('link', { name: 'Novo sítio' }))
    expect(await screen.findByRole('status', { name: 'Rascunho recuperado' })).toBeInTheDocument()
    expect(campo('Nome')).toHaveValue('Não perder')
  })

  it('um formulário vazio não deixa rascunho', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.type(campo('Nome'), 'x')
    await userEvent.clear(campo('Nome'))
    expect(rascunho()).toBeNull()
  })

  it('Registrar apaga o rascunho; um rascunho de outra aba (outro conteúdo) é perguntado, não sobrescrito', async () => {
    renderizarRota('/sitios/novo')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.type(campo('Nome'), 'Daqui')
    // outra aba grava outro rascunho
    localStorage.setItem(CHAVE_DO_RASCUNHO_DO_SITIO, JSON.stringify({ nome: 'Da outra aba', variantes: [], regiao: '', lat: '', lon: '', nota: '', para: null }))
    fireEvent(window, new StorageEvent('storage', { key: CHAVE_DO_RASCUNHO_DO_SITIO }))
    const aviso = await screen.findByRole('alert', { name: 'Rascunho de outra aba' })
    expect(aviso).toHaveTextContent('Da outra aba')
    await userEvent.click(within(aviso).getByRole('button', { name: 'Manter o desta aba' }))
    expect(JSON.parse(rascunho()!).nome).toBe('Daqui')
  })
})

describe('Novo sítio vindo de outro lugar (?nome=…&para=…)', () => {
  it('?nome= preenche o nome; ?para=<número> liga o objeto do livro ao sítio novo na mesma gravação e volta ao objeto', async () => {
    renderizarRota('/sitios/novo?nome=Tell%20Ligado&para=CA00001')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    expect(campo('Nome')).toHaveValue('Tell Ligado')
    expect(screen.getByText(/Ao registrar, o objeto CA00001 passa a ter este sítio/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Registrar sítio' }))
    await waitFor(() => expect(screen.getByTestId('endereco').textContent).toBe('/item/CA00001'))
    const sitio = novos().find((r) => r.campos.nome === 'Tell Ligado')!
    expect(estadoAtual().registro('item-sitio', 'CA00001')!.campos).toEqual({ sitio: sitio.id, sitioNome: 'Tell Ligado' })
  })

  it('?para=<OB-…> liga a ficha do objeto SKC', async () => {
    await registrar('objeto', 'OB-aaaaaaaa-1', 'criar', { periodo: 'CA', titulo: 'x', sitio: '', sitioNome: '', origemTipo: 'achado' })
    renderizarRota('/sitios/novo?nome=Tell%20SKC&para=OB-aaaaaaaa-1')
    await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
    await userEvent.click(screen.getByRole('button', { name: 'Registrar sítio' }))
    await waitFor(() => expect(screen.getByTestId('endereco').textContent).toBe('/item/OB-aaaaaaaa-1'))
    const sitio = novos().find((r) => r.campos.nome === 'Tell SKC')!
    expect(estadoAtual().registro('objeto', 'OB-aaaaaaaa-1')!.campos).toMatchObject({ sitio: sitio.id, sitioNome: 'Tell SKC' })
  })

  it('?para= que não é um número de objeto nem um id de objeto SKC é ignorado: o sítio é criado sozinho, sem ligar nada', async () => {
    for (const ruim of ['qualquer', 'SI-aaaaaaaa-1', 'CA1', '../item', 'OB-x']) {
      localStorage.clear()
      const antes = estadoAtual().registros.get('item-sitio')?.size ?? 0
      const { unmount } = renderizarRota(`/sitios/novo?nome=Tell%20Solto&para=${encodeURIComponent(ruim)}`)
      await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })
      expect(campo('Nome')).toHaveValue('Tell Solto')
      expect(screen.queryByText(/Ao registrar, o objeto/)).toBeNull()
      expect(screen.getByRole('link', { name: 'Fechar (o rascunho fica guardado)' })).toHaveAttribute('href', '#/sitios')
      await userEvent.click(screen.getByRole('button', { name: 'Registrar sítio' }))
      await waitFor(() => expect(screen.getByTestId('endereco').textContent).toMatch(/^\/sitio\/SI-/))
      expect(estadoAtual().registros.get('item-sitio')?.size ?? 0, ruim).toBe(antes)
      expect(estadoAtual().registro('item-sitio', ruim), ruim).toBeUndefined()
      unmount()
    }
  })

  it('com um rascunho de outro sítio guardado, pergunta qual manter em vez de trocar o que a pessoa escreveu', async () => {
    localStorage.setItem(CHAVE_DO_RASCUNHO_DO_SITIO, JSON.stringify({ nome: 'Rascunho antigo', variantes: [], regiao: '', lat: '', lon: '', nota: '', para: null }))
    renderizarRota('/sitios/novo?nome=Outro%20nome&para=CA00002')
    const aviso = await screen.findByRole('alert', { name: 'Há um rascunho guardado' })
    expect(campo('Nome')).toHaveValue('Rascunho antigo')
    await userEvent.click(within(aviso).getByRole('button', { name: /Começar um novo com «Outro nome»/ }))
    expect(campo('Nome')).toHaveValue('Outro nome')
    expect(JSON.parse(rascunho()!)).toMatchObject({ nome: 'Outro nome', para: 'CA00002' })
  })
})

describe('Novo sítio no computador', () => {
  it('a página inteira, com o mesmo formulário', async () => {
    instalarMatchMedia(1280)
    renderizarRota('/sitios/novo')
    expect(await screen.findByRole('heading', { level: 1, name: /^Novo sítio/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Registrar sítio' }).length).toBeGreaterThan(0)
  })
})
