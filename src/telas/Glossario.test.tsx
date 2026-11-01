import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { verbetes } from '../banco/consultas'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

const linhas = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('a.lista-linha'))
const linha = (id: string) => linhas().find((a) => a.getAttribute('href')?.startsWith(`/verbete/${id}`))!
const nomes = () => linhas().map((a) => a.querySelector('.glossario-pt')?.textContent)

describe('Glossário (celular)', () => {
  it('lista os verbetes em ordem alfabética, por letra, com o link, o alemão e a contagem de objetos', async () => {
    renderizarRota('/glossario')
    expect(screen.getByRole('heading', { level: 1, name: 'Glossário' })).toBeInTheDocument()
    await screen.findAllByRole('link', { name: /leão-de-teste/ })
    expect(linhas()).toHaveLength(9)
    expect(nomes()).toEqual((await verbetes()).map((v) => v.pt))
    const leao = linha('GL-900001')
    expect(leao).toHaveAttribute('href', '/verbete/GL-900001')
    expect(within(leao).getByText('Testlöwe')).toBeInTheDocument()
    expect(within(leao).getByText('2')).toBeInTheDocument()
    // um cabeçalho por letra, em ordem
    const letras = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(letras).toEqual([...letras].sort((a, b) => a.localeCompare(b, 'pt')))
    expect(letras).toContain('L')
  })

  it('resume o total e quantos estão aprovados', async () => {
    renderizarRota('/glossario')
    const aprovados = (await verbetes()).filter((v) => v.status === 'approved').length
    expect(await screen.findByText(`9 verbetes · ${aprovados} aprovados`)).toBeInTheDocument()
  })

  it('as abas são só por tipo (Todos, Conceitos, Nomes, Técnicos), sem aba de estado', async () => {
    renderizarRota('/glossario')
    const abas = screen.getByRole('navigation', { name: 'Tipos' })
    expect(within(abas).getAllByRole('link').map((a) => a.textContent)).toEqual(['Todos', 'Conceitos', 'Nomes', 'Técnicos'])
    expect(within(abas).getByRole('link', { name: 'Todos' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(within(abas).getByRole('link', { name: 'Nomes' }))
    await waitFor(() => expect(nomes()).toEqual(['Maḥraṣ Teste', 'Tell Probe Teste']))
    expect(within(abas).getByRole('link', { name: 'Nomes' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(within(abas).getByRole('link', { name: 'Técnicos' }))
    await waitFor(() => expect(nomes()).toEqual(['gravação de teste']))
    await userEvent.click(within(abas).getByRole('link', { name: 'Conceitos' }))
    await waitFor(() => expect(linhas()).toHaveLength(6))
  })

  it('o tipo vem do endereço (?tipo=nomes)', async () => {
    renderizarRota('/glossario?tipo=nomes')
    await waitFor(() => expect(linhas()).toHaveLength(2))
  })

  it('"a revisar" fica no ícone de filtro (liga e desliga) e mostra a etiqueta do filtro', async () => {
    renderizarRota('/glossario')
    const filtro = await screen.findByRole('button', { name: /Filtrar verbetes por estado/ })
    expect(filtro).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('link', { name: 'A revisar' })).not.toBeInTheDocument()
    const proposta = (await verbetes()).filter((v) => v.status === 'proposed')
    await userEvent.click(filtro)
    await waitFor(() => expect(linhas()).toHaveLength(proposta.length))
    expect(nomes()).toEqual(proposta.map((v) => v.pt))
    expect(filtro).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Tirar o filtro Estado: a revisar' })).toBeInTheDocument()
    expect(screen.getByText(`${proposta.length} a revisar · de 9 verbetes`)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    await waitFor(() => expect(linhas()).toHaveLength(9))
    expect(screen.getByRole('button', { name: /Filtrar verbetes por estado/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('a marca ✓ aparece só nos aprovados', async () => {
    renderizarRota('/glossario')
    await screen.findAllByRole('link', { name: /leão-de-teste/ })
    const todos = await verbetes()
    expect(screen.getAllByRole('img', { name: 'aprovado' })).toHaveLength(todos.filter((v) => v.status === 'approved').length)
    expect(within(linha('GL-900001')).getByRole('img', { name: 'aprovado' })).toBeInTheDocument()
    expect(within(linha('GL-900002')).queryByRole('img', { name: 'aprovado' })).not.toBeInTheDocument()
  })

  it('o filtro de texto usa a dobra do pacote: "mahras" acha "Maḥraṣ", "testlowe" acha "Testlöwe"; sem acerto, avisa', async () => {
    renderizarRota('/glossario')
    const campo = await screen.findByRole('searchbox', { name: 'Buscar no glossário' })
    await userEvent.type(campo, 'mahras')
    await waitFor(() => expect(nomes()).toEqual(['Maḥraṣ Teste']))
    await userEvent.clear(campo)
    await userEvent.type(campo, 'TESTLOWE')
    await waitFor(() => expect(nomes()).toEqual(['filhote de leão-de-teste', 'leão-de-teste']))
    await userEvent.clear(campo)
    await userEvent.type(campo, 'test lion')
    await waitFor(() => expect(nomes()).toEqual(['filhote de leão-de-teste', 'leão-de-teste']))
    await userEvent.clear(campo)
    await userEvent.type(campo, 'zzzz')
    expect(await screen.findByText('Nenhum verbete encontrado.')).toBeInTheDocument()
    await userEvent.clear(campo)
    await waitFor(() => expect(linhas()).toHaveLength(9))
  })

  it('uma linha leva ao verbete, que no celular ocupa a tela (sem a lista) e volta ao glossário', async () => {
    renderizarRota('/glossario?tipo=nomes')
    await userEvent.click(await screen.findByRole('link', { name: /Tell Probe Teste/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar ao glossário' })).toHaveAttribute('href', '#/glossario?tipo=nomes')
  })

  it('sem pacote no aparelho mostra o aviso, não uma lista vazia', async () => {
    // O motor responde "sem pacote", como o worker antes da primeira sincronização completa.
    usarMotor({ abrir: async () => ({ estado: 'sem-pacote' }), reabrir: async () => ({ estado: 'sem-pacote' }), executar: async () => [] })
    try {
      renderizarRota('/glossario')
      expect(await screen.findByRole('alert')).toHaveTextContent('O banco ainda não está no aparelho.')
      expect(linhas()).toHaveLength(0)
    } finally {
      usarMotor(await bancoDeTeste())
    }
  })
})

describe('Glossário (computador): lista e detalhe na mesma tela', () => {
  beforeEach(() => instalarMatchMedia(1280))

  it('em /glossario o detalhe pede para escolher um verbete', async () => {
    renderizarRota('/glossario')
    await screen.findAllByRole('link', { name: /leão-de-teste/ })
    expect(screen.getByRole('heading', { level: 1, name: 'Glossário' })).toBeInTheDocument()
    expect(screen.getByText('Escolha um verbete na lista.')).toBeInTheDocument()
  })

  it('em /verbete/:id a lista fica à esquerda com o verbete marcado e o detalhe à direita', async () => {
    renderizarRota('/verbete/GL-900001')
    expect(await screen.findByRole('heading', { level: 2, name: 'leão-de-teste' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Glossário' })).toBeInTheDocument()
    expect(linhas()).toHaveLength(9)
    const atual = linha('GL-900001')
    expect(atual).toHaveAttribute('aria-current', 'page')
    expect(linha('GL-900002')).not.toHaveAttribute('aria-current')
  })

  it('escolher outro verbete troca o detalhe sem remontar a lista: o texto do filtro e a rolagem ficam', async () => {
    renderizarRota('/glossario')
    const campo = await screen.findByRole('searchbox', { name: 'Buscar no glossário' })
    const lista = document.querySelector('.lista-rolagem') as HTMLElement
    await userEvent.type(campo, 'test')
    await waitFor(() => expect(linhas().length).toBeGreaterThan(1))
    lista.scrollTop = 37
    await userEvent.click(linha('GL-900009'))
    expect(await screen.findByRole('heading', { level: 2, name: 'selo de teste' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar no glossário' })).toBe(campo)
    expect(campo).toHaveValue('test')
    expect(document.querySelector('.lista-rolagem')).toBe(lista)
    expect(lista.scrollTop).toBe(37)
    await userEvent.click(linha('GL-900001'))
    expect(await screen.findByRole('heading', { level: 2, name: 'leão-de-teste' })).toBeInTheDocument()
    expect(document.querySelector('.lista-rolagem')).toBe(lista)
    expect(screen.getByTestId('endereco')).toHaveTextContent('/verbete/GL-900001')
  })

  it('o tipo escolhido segue nos links (a lista não muda ao abrir um verbete)', async () => {
    renderizarRota('/glossario?tipo=nomes')
    await userEvent.click(await screen.findByRole('link', { name: /Tell Probe Teste/ }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Tell Probe Teste' })).toBeInTheDocument()
    expect(screen.getByTestId('endereco')).toHaveTextContent('/verbete/GL-900005?tipo=nomes')
    expect(linhas()).toHaveLength(2)
  })
})
