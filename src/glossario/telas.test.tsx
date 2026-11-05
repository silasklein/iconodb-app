/**
 * Decisão 41 nas telas: o verbete do usuário no Glossário (marca SKC, "a revisar", com os do livro e no filtro "a
 * revisar"; dois "iguais" de dois aparelhos aparecem os dois) e a página dele em /verbete/<id> (forma, SKC, "a revisar"
 * e as hipóteses SKC que o usam; as seções que só os verbetes dos livros têm não aparecem).
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { verbetes } from '../banco/consultas'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
  // Dois aparelhos criaram o "mesmo" termo sem internet: dois verbetes. Um terceiro é usado por duas hipóteses.
  await registrar('verbete', 'GL-aaaaaaaa-1', 'criar', { forma: 'termo-novo-de-teste', status: 'proposed' })
  await registrar('verbete', 'GL-bbbbbbbb-1', 'criar', { forma: 'Termo-Novo-de-Teste', status: 'proposed' })
  await registrar('verbete', 'GL-aaaaaaaa-2', 'criar', { forma: 'zebu-de-teste', status: 'proposed' })
  await registrar('hipotese', 'HY-aaaaaaaa-1', 'criar', {
    objeto: 'CA00001',
    sobre: 'objeto',
    elemento: null,
    elementoRotulo: '',
    termos: ['GL-900001', 'GL-aaaaaaaa-1'],
    termosRotulos: ['leão-de-teste', 'termo-novo-de-teste'],
    nivel: 'iconological',
    modalidade: 'possible',
    justificativa: '',
    ancora: null,
  })
  await registrar('hipotese', 'HY-aaaaaaaa-2', 'criar', { objeto: 'CA00002', sobre: 'objeto', termos: ['GL-aaaaaaaa-1'], termosRotulos: ['termo-novo-de-teste'], nivel: 'iconographic', modalidade: 'probable', justificativa: '', ancora: null })
  // excluída: não conta
  await registrar('hipotese', 'HY-aaaaaaaa-3', 'criar', { objeto: 'CA00003', sobre: 'objeto', termos: ['GL-aaaaaaaa-1'], termosRotulos: ['termo-novo-de-teste'], nivel: 'iconographic', modalidade: 'probable', justificativa: '', ancora: null })
  await registrar('hipotese', 'HY-aaaaaaaa-3', 'excluir')
  await registrar('verbete', 'GL-aaaaaaaa-9', 'criar', { forma: 'termo-excluido', status: 'proposed' })
  await registrar('verbete', 'GL-aaaaaaaa-9', 'excluir')
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

const linhas = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('a.lista-linha'))
const linha = (id: string) => linhas().find((a) => a.getAttribute('href')?.startsWith(`/verbete/${id}`))

describe('o verbete do usuário no Glossário', () => {
  it('aparece na ordem, com a marca SKC, "a revisar" e a contagem de objetos; os dois "iguais" aparecem; o excluído não', async () => {
    renderizarRota('/glossario')
    await screen.findAllByRole('link', { name: /leão-de-teste/ })
    await waitFor(() => expect(linha('GL-aaaaaaaa-1')).toBeDefined())
    expect(linhas()).toHaveLength(13) // com o GL-900010, publicado da camada do usuário (Tarefa 16)
    const a = linha('GL-aaaaaaaa-1')!
    expect(within(a).getByText('SKC')).toHaveClass('marca-skc')
    expect(within(a).getByText('a revisar')).toBeInTheDocument()
    expect(within(a).getByText('2')).toBeInTheDocument() // CA00001 e CA00002 (a hipótese excluída não conta)
    expect(linha('GL-bbbbbbbb-1')).toBeDefined()
    expect(linha('GL-aaaaaaaa-9')).toBeUndefined()
    // em ordem alfabética com os do livro: "termo…" depois de "tell…", "zebu" por último
    const nomes = linhas().map((x) => x.querySelector('.glossario-pt')?.textContent)
    expect(nomes.at(-1)).toBe('zebu-de-teste')
    const aprovados = (await verbetes()).filter((v) => v.status === 'approved').length
    expect(await screen.findByText(`13 verbetes · ${aprovados} aprovados`)).toBeInTheDocument()
  })

  it('"a revisar" lista os dois; as abas de tipo, não (o verbete do usuário ainda não tem tipo)', async () => {
    const r = renderizarRota('/glossario?revisar=1')
    await waitFor(() => expect(linha('GL-aaaaaaaa-1')).toBeDefined())
    expect(linha('GL-bbbbbbbb-1')).toBeDefined()
    expect(linha('GL-aaaaaaaa-2')).toBeDefined()
    r.unmount()
    renderizarRota('/glossario?tipo=conceitos')
    await screen.findAllByRole('link', { name: /leão-de-teste/ })
    expect(linhas().some((x) => x.getAttribute('href')?.includes('GL-aaaaaaaa'))).toBe(false)
  })

  it('o filtro da lista acha o verbete do usuário sem acento e sem caixa', async () => {
    renderizarRota('/glossario')
    await waitFor(() => expect(linha('GL-aaaaaaaa-1')).toBeDefined())
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar no glossário' }), 'TERMO NOVO')
    await waitFor(() => expect(linhas().map((x) => x.getAttribute('href')?.split('?')[0])).toEqual(['/verbete/GL-aaaaaaaa-1', '/verbete/GL-bbbbbbbb-1']))
  })
})

describe('a página do verbete do usuário (/verbete/<id>)', () => {
  it('celular: forma, SKC e "a revisar"; as hipóteses SKC que o usam, com link para o objeto; nada das seções dos livros', async () => {
    renderizarRota('/verbete/GL-aaaaaaaa-1')
    const titulo = await screen.findByRole('heading', { level: 1, name: 'termo-novo-de-teste' })
    expect(titulo).toBeInTheDocument()
    expect(screen.getByText('Verbete do SKC · a revisar')).toBeInTheDocument()
    expect(screen.getAllByText('SKC').some((x) => x.classList.contains('marca-skc'))).toBe(true)
    expect(screen.getByText('GL-aaaaaaaa-1')).toBeInTheDocument()
    const hipoteses = screen.getByRole('region', { name: 'Hipóteses com este termo' })
    const ls = within(hipoteses).getAllByRole('link')
    expect(ls.map((l) => l.getAttribute('href'))).toEqual(['/item/CA00001?hipotese=HY-aaaaaaaa-1', '/item/CA00002?hipotese=HY-aaaaaaaa-2'])
    expect(ls[0]).toHaveTextContent('CA00001')
    expect(ls[0]).toHaveTextContent('iconológico · possível · SKC')
    // só o que um verbete do usuário tem: nada de alemão, Iconclass, SSSL, objetos com miniatura, "—" vazio
    for (const rotulo of ['Alemão', 'Inglês', 'Iconclass', 'SSSL', 'Definição', 'Proposta original']) expect(screen.queryByText(rotulo)).toBeNull()
    expect(screen.queryByRole('region', { name: 'Objetos com este termo' })).toBeNull()
    expect(screen.getByText('Forma em português')).toBeInTheDocument()
    expect(screen.getByText('Criado em')).toBeInTheDocument()
    // a busca pelo termo e copiar a referência, como os outros
    expect(screen.getByRole('link', { name: 'Buscar objetos com este termo' })).toHaveAttribute('href', expect.stringContaining('termo-novo-de-teste'))
  })

  it('computador: no painel ao lado da lista; sem hipótese viva, diz que não há', async () => {
    instalarMatchMedia(1280)
    renderizarRota('/verbete/GL-aaaaaaaa-2')
    expect(await screen.findByRole('heading', { level: 2, name: 'zebu-de-teste' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Hipóteses com este termo' })).getByText('Nenhuma hipótese com este termo.')).toBeInTheDocument()
    expect(linha('GL-aaaaaaaa-2')).toHaveAttribute('aria-current', 'page')
  })

  it('excluído: diz que foi excluído e pode ser restaurado; um id do usuário que não existe: não encontrado', async () => {
    const r = renderizarRota('/verbete/GL-aaaaaaaa-9')
    expect(await screen.findByText(/Este verbete foi excluído/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar o verbete' }))
    await waitFor(() => expect(estadoAtual().registro('verbete', 'GL-aaaaaaaa-9')!.excluido).toBe(false))
    await waitFor(() => expect(screen.queryByText(/Este verbete foi excluído/)).toBeNull())
    await registrar('verbete', 'GL-aaaaaaaa-9', 'excluir')
    r.unmount()
    renderizarRota('/verbete/GL-zzzzzzzz-1')
    expect(await screen.findByRole('heading', { name: 'Verbete não encontrado' })).toBeInTheDocument()
  })
})
