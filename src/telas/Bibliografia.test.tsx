import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { irPara, renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { chicagoEmTexto } from './Bibliografia'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
})
afterAll(() => usarMotor(null))
afterEach(() => {
  instalarMatchMedia(375)
  vi.restoreAllMocks()
})

const linhas = () => screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/obra/'))

function comAreaDeTransferencia() {
  const writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

describe('Bibliografia (celular)', () => {
  it('lista as obras pela citação curta, com o título e quantos objetos as citam', async () => {
    renderizarRota('/bibliografia')
    expect(screen.getByRole('heading', { level: 1, name: 'Bibliografia' })).toBeInTheDocument()
    await screen.findByRole('link', { name: /Autor 1999/ })
    expect(linhas().map((a) => a.getAttribute('href'))).toEqual(['/obra/BIB-900001', '/obra/BIB-900002'])
    const primeira = screen.getByRole('link', { name: /Autor 1999/ })
    expect(within(primeira).getByText('Achados de teste no vale de prova')).toBeInTheDocument()
    expect(within(primeira).getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2 obras · Chicago autor-data')).toBeInTheDocument()
  })

  it('busca por autor, ano ou título, com a dobra do pacote', async () => {
    renderizarRota('/bibliografia')
    const campo = await screen.findByRole('searchbox', { name: 'Buscar na bibliografia' })
    await userEvent.type(campo, 'marduk')
    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(screen.getByRole('link', { name: /Autora 2004/ })).toBeInTheDocument()
    await userEvent.clear(campo)
    await userEvent.type(campo, '1999')
    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(screen.getByRole('link', { name: /Autor 1999/ })).toBeInTheDocument()
    await userEvent.clear(campo)
    await userEvent.type(campo, 'zzzz')
    expect(await screen.findByText('Nenhuma obra encontrada.')).toBeInTheDocument()
  })

  it('o botão de ordem alterna entre autor e ano', async () => {
    renderizarRota('/bibliografia')
    await screen.findByRole('link', { name: /Autor 1999/ })
    await userEvent.click(screen.getByRole('button', { name: 'Ordenar por ano' }))
    expect(screen.getByRole('button', { name: 'Ordenar por autor' })).toBeInTheDocument()
    // a ordem escolhida segue nos links, para a lista continuar assim ao voltar da obra
    expect(linhas().map((a) => a.getAttribute('href'))).toEqual(['/obra/BIB-900001?ordem=ano', '/obra/BIB-900002?ordem=ano'])
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['1999', '2004'])
  })

  it('por ano a ordem segue o ano da citação, não o autor', async () => {
    usarMotor(await bancoDeTeste({ escrita: true }))
    await executar(`UPDATE main.bib_entry SET short_cites = '{"TESTE": ["Autor 2010"]}' WHERE id = 'BIB-900001'`)
    renderizarRota('/bibliografia?ordem=ano')
    await screen.findByRole('link', { name: /Autor 2010/ })
    expect(linhas().map((a) => a.getAttribute('href'))).toEqual(['/obra/BIB-900002?ordem=ano', '/obra/BIB-900001?ordem=ano'])
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['2004', '2010'])
    await userEvent.click(screen.getByRole('button', { name: 'Ordenar por autor' }))
    await waitFor(() => expect(linhas().map((a) => a.getAttribute('href'))).toEqual(['/obra/BIB-900001', '/obra/BIB-900002']))
    usarMotor(await bancoDeTeste())
  })

  it('a obra mostra a referência Chicago completa (com o itálico), de onde vem a citação e os objetos que a citam', async () => {
    renderizarRota('/obra/BIB-900002')
    expect(await screen.findByRole('heading', { level: 1, name: 'Autora 2004' })).toBeInTheDocument()
    const chicago = screen.getByText(/Autora, Beltrana Teste\. 2004\./)
    expect(chicago.textContent).toBe(
      "Autora, Beltrana Teste. 2004. “O leito de Marduk's Teste e outros objetos de prova.” Em Coletânea inventada de teste. Lugar Algum.",
    )
    expect(chicago.querySelector('i')?.textContent).toBe('Coletânea inventada de teste')
    expect(screen.getByText('BIB-900002')).toHaveClass('codigo')
    expect(screen.getByText(/Citada como «Autora 2004» no TESTE/)).toBeInTheDocument()
    const objetos = screen.getByRole('region', { name: 'Objetos que citam esta obra' })
    expect(within(objetos).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/item/BA00001', '/item/BA00002'])
    expect(screen.getByRole('link', { name: 'Voltar à bibliografia' })).toHaveAttribute('href', '#/bibliografia')
  })

  it('"Copiar referência" copia o Chicago em texto puro e avisa "Referência copiada"', async () => {
    const writeText = comAreaDeTransferencia()
    renderizarRota('/obra/BIB-900002')
    await userEvent.click(await screen.findByRole('button', { name: 'Copiar referência completa' }))
    expect(writeText).toHaveBeenCalledTimes(1)
    const copiado = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(copiado).toBe("Autora, Beltrana Teste. 2004. “O leito de Marduk's Teste e outros objetos de prova.” Em {Coletânea inventada de teste}. Lugar Algum.".replace(/[{}]/g, ''))
    expect(copiado).not.toMatch(/<|\{/)
    expect(await screen.findByRole('status')).toHaveTextContent('Referência copiada')
  })

  it('sem área de transferência: seleciona a referência e pede "Selecione e copie"', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    renderizarRota('/obra/BIB-900001')
    await userEvent.click(await screen.findByRole('button', { name: 'Copiar referência completa' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Selecione e copie')
    expect(window.getSelection()?.toString()).toContain('Achados de teste no vale de prova')
  })

  it('área de transferência recusada (sem permissão) cai no mesmo aviso', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => Promise.reject(new Error('negado'))) }, configurable: true })
    renderizarRota('/obra/BIB-900001')
    await userEvent.click(await screen.findByRole('button', { name: 'Copiar referência completa' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Selecione e copie')
  })

  it('obra que não existe: aviso', async () => {
    renderizarRota('/obra/BIB-000000')
    expect(await screen.findByRole('heading', { level: 1, name: 'Obra não encontrada' })).toBeInTheDocument()
  })
})

describe('Bibliografia (computador): lista e detalhe na mesma tela', () => {
  beforeEach(() => instalarMatchMedia(1280))

  it('em /bibliografia pede para escolher uma obra', async () => {
    renderizarRota('/bibliografia')
    await screen.findByRole('link', { name: /Autor 1999/ })
    expect(screen.getByText('Escolha uma obra na lista.')).toBeInTheDocument()
  })

  it('em /obra/:id a lista fica à esquerda com a obra marcada e a referência à direita; trocar de obra não remonta a lista', async () => {
    renderizarRota('/obra/BIB-900001')
    expect(await screen.findByRole('heading', { level: 2, name: 'Autor 1999' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Bibliografia' })).toBeInTheDocument()
    const lista = document.querySelector('.lista-rolagem')
    expect(screen.getAllByRole('link', { name: /Autor 1999/ })[0]).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('region', { name: 'Objetos que citam esta obra' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: /Autora 2004/ }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Autora 2004' })).toBeInTheDocument()
    expect(document.querySelector('.lista-rolagem')).toBe(lista)
    expect(screen.getByRole('link', { name: /Autora 2004/ })).toHaveAttribute('aria-current', 'page')
  })
})

describe('Bibliografia: filtro no endereço, contagens e seleção', () => {
  it('?filtro= vai para o campo e para a lista; digitar grava; Voltar devolve', async () => {
    renderizarRota('/bibliografia?filtro=marduk')
    expect(await screen.findByRole('searchbox', { name: 'Buscar na bibliografia' })).toHaveValue('marduk')
    await waitFor(() => expect(linhas()).toHaveLength(1))
    await userEvent.click(screen.getByRole('link', { name: /Autora 2004/ }))
    await screen.findByRole('heading', { level: 1, name: 'Autora 2004' })
    act(() => irPara(-1))
    expect(await screen.findByRole('searchbox', { name: 'Buscar na bibliografia' })).toHaveValue('marduk')
    await waitFor(() => expect(linhas()).toHaveLength(1))
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Buscar na bibliografia' }))
    await waitFor(() => expect(screen.getByTestId('endereco').textContent).toBe('/bibliografia'))
  })

  it('mudar a ordem não perde o texto do endereço', async () => {
    renderizarRota('/bibliografia?filtro=autor')
    await screen.findByRole('link', { name: /Autor 1999/ })
    await userEvent.click(screen.getByRole('button', { name: 'Ordenar por ano' }))
    await waitFor(() => expect(screen.getByTestId('endereco').textContent).toBe('/bibliografia?filtro=autor&ordem=ano'))
  })

  it('cada obra diz "n objetos" para o leitor de tela; a seção de objetos também', async () => {
    renderizarRota('/bibliografia')
    const primeira = await screen.findByRole('link', { name: /Autor 1999/ })
    expect(primeira.closest('a')).toHaveTextContent('4 objetos')
    expect(within(primeira).getByText('4')).toBeInTheDocument()
  })

  it('computador: escolher outra obra leva o painel ao topo e anuncia o título', async () => {
    instalarMatchMedia(1280)
    renderizarRota('/obra/BIB-900001')
    await screen.findByRole('heading', { level: 2, name: 'Autor 1999' })
    const painel = document.querySelector('.lista-principal') as HTMLElement
    painel.scrollTop = 90
    await userEvent.click(screen.getByRole('link', { name: /Autora 2004/ }))
    await screen.findByRole('heading', { level: 2, name: 'Autora 2004' })
    expect(painel.scrollTop).toBe(0)
    expect(document.querySelector('[data-anuncio]')).toHaveTextContent('Autora 2004')
  })

  it('computador: a obra anterior fica até a nova chegar', async () => {
    instalarMatchMedia(1280)
    const real = await bancoDeTeste()
    let solta: () => void = () => {}
    let segura = false
    const porta = new Promise<void>((r) => (solta = r))
    usarMotor({
      abrir: () => real.abrir(),
      reabrir: () => real.reabrir(),
      executar: async (sql, p) => {
        if (segura && sql.includes('SELECT * FROM main.bib_entry')) await porta
        return real.executar(sql, p)
      },
    })
    renderizarRota('/obra/BIB-900001')
    await screen.findByRole('heading', { level: 2, name: 'Autor 1999' })
    segura = true
    await userEvent.click(screen.getByRole('link', { name: /Autora 2004/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'Autor 1999' })).toBeInTheDocument()
    solta()
    expect(await screen.findByRole('heading', { level: 2, name: 'Autora 2004' })).toBeInTheDocument()
    usarMotor(await bancoDeTeste())
  })
})

describe('chicagoEmTexto (o texto que "Copiar referência" copia)', () => {
  it('sem Chicago em texto, tira a marcação do HTML e decodifica as entidades', () => {
    expect(chicagoEmTexto({ chicago: null, chicagoHtml: 'Autora &amp; Autor. <i>Título d&#39;Teste</i>. Lugar: Ed.&nbsp;Teste.', titulo: null, curta: null })).toBe(
      "Autora & Autor. Título d'Teste. Lugar: Ed.\u00a0Teste.",
    )
  })
  it('o Chicago em texto, quando há, vale como está', () => {
    expect(chicagoEmTexto({ chicago: 'A &amp; B', chicagoHtml: '<i>x</i>', titulo: null, curta: null })).toBe('A &amp; B')
  })
})
