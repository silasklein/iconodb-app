/**
 * Tarefa 11 nas telas (Verbete.dc.html, GlossarioRevisar.dc.html, PC-Glossario.dc.html): editar a forma em uso de um
 * verbete (do livro ou do usuário), voltar à proposta original, aprovar (a ✓ da lista), excluir (do usuário) e o aviso
 * de "possível duplicado" na lista "a revisar".
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'
import { lerEdicaoDoVerbete } from './modelo'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

const edicao = (id: string) => {
  const r = estadoAtual().registro('verbete', id)
  return r ? lerEdicaoDoVerbete(r) : null
}
const campoDaForma = () => screen.getByRole('textbox', { name: 'Forma em português' }) as HTMLInputElement

describe('o verbete do livro: forma em uso, voltar à proposta e aprovar (Verbete.dc.html)', () => {
  it('mostra o campo com a forma de agora, "Proposta original: …", Aprovar e o texto de ajuda; sem "Voltar" enquanto nada mudou', async () => {
    renderizarRota('/verbete/GL-900007')
    expect(await screen.findByRole('heading', { level: 1, name: 'filhote de leão-de-teste' })).toBeInTheDocument()
    expect(campoDaForma()).toHaveValue('filhote de leão-de-teste')
    expect(screen.getByText('Proposta original: filhote de leão-de-teste')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
    expect(screen.getByText('A forma em uso aparece nas listas, nas hipóteses e no texto onde o termo está como no glossário; nas outras ocorrências, na dica.')).toBeInTheDocument()
    expect(screen.queryByText(/passa a valer em todas as traduções/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Voltar à proposta original' })).toBeNull()
    expect(screen.getByText('Conceito · a revisar')).toBeInTheDocument()
  })

  it('editar a forma e sair do campo grava `formaEmUso` (um campo, sem `forma`); o título e a etiqueta acompanham; aparece "Voltar à proposta original"', async () => {
    renderizarRota('/verbete/GL-900007')
    await screen.findByRole('heading', { level: 1, name: 'filhote de leão-de-teste' })
    await userEvent.clear(campoDaForma())
    await userEvent.type(campoDaForma(), '  cria   de leão ')
    await userEvent.tab()
    await waitFor(() => expect(edicao('GL-900007')?.formaEmUso).toBe('cria de leão'))
    expect(estadoAtual().registro('verbete', 'GL-900007')!.campos).toEqual({ formaEmUso: 'cria de leão' })
    expect(await screen.findByRole('heading', { level: 1, name: 'cria de leão' })).toBeInTheDocument()
    expect(campoDaForma()).toHaveValue('cria de leão')
    // a proposta original continua sendo a do pacote
    expect(screen.getByText('Proposta original: filhote de leão-de-teste')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voltar à proposta original' })).toHaveAttribute('data-tip', 'Voltar à proposta original')
    // "Copiar referência" e a busca usam o nome de agora
    expect(screen.getByRole('link', { name: 'Buscar objetos com este termo' }).getAttribute('href')).toContain(encodeURIComponent('cria de leão').replace(/%20/g, '+'))
  })

  it('apagar tudo e sair do campo não grava nada: o campo volta à forma de agora (uma forma vazia não é forma)', async () => {
    renderizarRota('/verbete/GL-900007')
    await screen.findByRole('heading', { level: 1, name: 'cria de leão' })
    const antes = (await import('../usuario/armazem')).todosEventos
    const n = (await antes()).length
    await userEvent.clear(campoDaForma())
    await userEvent.tab()
    await waitFor(() => expect(campoDaForma()).toHaveValue('cria de leão'))
    expect((await antes()).length).toBe(n)
  })

  it('"Voltar à proposta original" grava null, o campo e o título voltam, e "Desfazer" traz de volta a forma que valia', async () => {
    renderizarRota('/verbete/GL-900007')
    await screen.findByRole('heading', { level: 1, name: 'cria de leão' })
    await userEvent.click(screen.getByRole('button', { name: 'Voltar à proposta original' }))
    await waitFor(() => expect(edicao('GL-900007')?.formaEmUso).toBeNull())
    expect(await screen.findByRole('heading', { level: 1, name: 'filhote de leão-de-teste' })).toBeInTheDocument()
    expect(campoDaForma()).toHaveValue('filhote de leão-de-teste')
    expect(screen.queryByRole('button', { name: 'Voltar à proposta original' })).toBeNull()
    const aviso = screen.getByText(/Voltou à proposta original/).closest('p')!
    expect(aviso).toHaveAttribute('role', 'status')
    await userEvent.click(within(aviso).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(edicao('GL-900007')?.formaEmUso).toBe('cria de leão'))
    expect(await screen.findByRole('heading', { level: 1, name: 'cria de leão' })).toBeInTheDocument()
    // a forma que valia antes continua no histórico do campo
    expect(estadoAtual().historico('GL-900007', 'formaEmUso', 'verbete').map((h) => h.valor)).toContain(null)
  })

  it('escrever a forma original à mão é o mesmo que voltar à proposta (null)', async () => {
    renderizarRota('/verbete/GL-900007')
    await screen.findByRole('heading', { level: 1, name: 'cria de leão' })
    await userEvent.clear(campoDaForma())
    await userEvent.type(campoDaForma(), 'filhote de leão-de-teste')
    await userEvent.tab()
    await waitFor(() => expect(edicao('GL-900007')?.formaEmUso).toBeNull())
  })

  it('Aprovar: grava só o estado, a etiqueta diz "aprovado", o botão vira "Aprovado ✓" e "Voltar a revisar"; esta tira a aprovação', async () => {
    renderizarRota('/verbete/GL-900007')
    await screen.findByRole('heading', { level: 1, name: 'filhote de leão-de-teste' })
    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(edicao('GL-900007')?.status).toBe('approved'))
    // T17-B-9: a aprovação guarda a forma por extenso, nunca «null = o pt de agora»
    expect(edicao('GL-900007')?.formaAprovada).toBe('filhote de leão-de-teste')
    expect(await screen.findByText('Conceito · aprovado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull()
    expect(screen.getByText('Aprovado por você')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Voltar a revisar' }))
    await waitFor(() => expect(edicao('GL-900007')?.status).toBe('proposed'))
    expect(await screen.findByText('Conceito · a revisar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
  })

  it('Aprovar com texto ainda no campo (antes de o atraso gravar) grava a forma E a aprovação', async () => {
    renderizarRota('/verbete/GL-900008')
    const titulo = await screen.findByRole('heading', { level: 1 })
    const original = titulo.textContent!
    await userEvent.clear(campoDaForma())
    await userEvent.type(campoDaForma(), 'forma digitada na pressa')
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(edicao('GL-900008')).toEqual({ formaEmUso: 'forma digitada na pressa', status: 'approved', formaAprovada: 'forma digitada na pressa' }))
    expect(original).not.toBe('forma digitada na pressa')
  })
})

describe('a lista do Glossário: a forma em uso, a ✓ dos aprovados e o filtro "a revisar"', () => {
  const linhas = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('a.lista-linha'))
  const linha = (id: string) => linhas().find((a) => a.getAttribute('href')?.startsWith(`/verbete/${id}`))

  it('o nome na lista é a forma em uso, a antiga e a nova acham a linha, e aprovar põe a ✓ (no nome acessível "aprovado")', async () => {
    await registrar('verbete', 'GL-900002', 'alterar', { formaEmUso: 'figura serrilhada', status: 'approved', formaAprovada: 'figura serrilhada' })
    renderizarRota('/glossario')
    await waitFor(() => expect(linha('GL-900002')).toBeDefined())
    const a = linha('GL-900002')!
    expect(within(a).getByText('figura serrilhada')).toBeInTheDocument()
    expect(within(a).getByRole('img', { name: 'aprovado' })).toBeInTheDocument()
    // a de alemão continua embaixo
    expect(within(a).getByText('Zackenfigur')).toHaveAttribute('lang', 'de')
    const busca = screen.getByRole('searchbox', { name: 'Buscar no glossário' })
    await userEvent.type(busca, 'serrilhada')
    await waitFor(() => expect(linhas().map((x) => x.getAttribute('href')?.split('?')[0])).toEqual(['/verbete/GL-900002']))
    await userEvent.clear(busca)
    await userEvent.type(busca, 'figura denteada')
    await waitFor(() => expect(linha('GL-900002')).toBeDefined())
  })

  it('"a revisar" tira os que o usuário aprovou e põe de volta os que ele reabriu', async () => {
    await registrar('verbete', 'GL-900001', 'alterar', { status: 'proposed' }) // era aprovado no pacote
    renderizarRota('/glossario?revisar=1')
    await waitFor(() => expect(linha('GL-900001')).toBeDefined())
    expect(linha('GL-900002')).toBeUndefined() // aprovado por ele
    expect(linha('GL-900007')).toBeDefined()
    expect(within(linha('GL-900001')!).queryByRole('img', { name: 'aprovado' })).toBeNull()
  })
})

describe('o verbete do usuário: o mesmo editor, a forma criada é a proposta original, e excluir (reversível)', () => {
  beforeAll(async () => {
    await registrar('verbete', 'GL-editor01-1', 'criar', { forma: 'termo criado', status: 'proposed' })
    await registrar('nota', 'NT-editor01-1', 'criar', { texto: 'ver [[GL-editor01-1|termo]]', alvoTipo: 'objeto', alvo: 'CA00001' })
    await registrar('hipotese', 'HY-editor01-1', 'criar', { objeto: 'CA00001', sobre: 'objeto', elemento: null, elementoRotulo: '', termos: ['GL-editor01-1'], termosRotulos: ['termo criado'], nivel: 'iconographic', modalidade: 'probable', justificativa: '', ancora: null })
  })

  it('edita, volta à proposta (a forma criada) e aprova, como o do livro; a etiqueta e o título acompanham', async () => {
    renderizarRota('/verbete/GL-editor01-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'termo criado' })).toBeInTheDocument()
    expect(screen.getByText('Proposta original: termo criado')).toBeInTheDocument()
    await userEvent.clear(campoDaForma())
    await userEvent.type(campoDaForma(), 'termo renomeado')
    await userEvent.tab()
    await waitFor(() => expect(edicao('GL-editor01-1')?.formaEmUso).toBe('termo renomeado'))
    // o `criar` e a `forma` criada não são tocados
    expect(estadoAtual().registro('verbete', 'GL-editor01-1')!.campos.forma).toBe('termo criado')
    expect(await screen.findByRole('heading', { level: 1, name: 'termo renomeado' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(edicao('GL-editor01-1')?.status).toBe('approved'))
    expect(await screen.findByText('Verbete do SKC · aprovado')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Voltar à proposta original' }))
    await waitFor(() => expect(edicao('GL-editor01-1')?.formaEmUso).toBeNull())
    expect(await screen.findByRole('heading', { level: 1, name: 'termo criado' })).toBeInTheDocument()
    // M2: a forma aprovada era outra; a aprovação não vale para esta
    await waitFor(() => expect(edicao('GL-editor01-1')?.status).toBe('proposed'))
  })

  it('excluir pede a confirmação com o nome e conta hipóteses e notas; o foco vai a "Cancelar", volta ao botão e, depois de excluir, vai à lista, onde dá para restaurar', async () => {
    const r = renderizarRota('/verbete/GL-editor01-1')
    await screen.findByRole('heading', { level: 1, name: 'termo criado' })
    const gatilho = screen.getByRole('button', { name: 'Excluir o verbete' })
    await userEvent.click(gatilho)
    const pergunta = screen.getByRole('group', { name: 'Excluir o verbete «termo criado»?' })
    expect(pergunta).toHaveTextContent('Este termo é usado em 1 hipótese e 1 nota ou texto com link, que continuam mostrando o nome «termo criado». Dá para restaurar depois.')
    expect(within(pergunta).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    await userEvent.click(within(pergunta).getByRole('button', { name: 'Cancelar' }))
    expect(estadoAtual().registro('verbete', 'GL-editor01-1')!.excluido).toBe(false)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Excluir o verbete' })).toHaveFocus())
    await userEvent.click(screen.getByRole('button', { name: 'Excluir o verbete' }))
    await userEvent.click(within(screen.getByRole('group', { name: /^Excluir o verbete/ })).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(estadoAtual().registro('verbete', 'GL-editor01-1')!.excluido).toBe(true))
    // vai para a lista, com o aviso e o foco no "Restaurar"
    await waitFor(() => expect(screen.getByTestId('endereco')).toHaveTextContent(/^\/glossario/))
    const aviso = await screen.findByRole('status', { name: 'Verbete excluído' })
    expect(aviso).toHaveTextContent('Verbete «termo criado» excluído.')
    await waitFor(() => expect(within(aviso).getByRole('button', { name: 'Restaurar o verbete' })).toHaveFocus())
    // a hipótese continua apontando para ele (nada foi reescrito)
    expect(estadoAtual().registro('hipotese', 'HY-editor01-1')!.campos.termos).toEqual(['GL-editor01-1'])
    await userEvent.click(within(aviso).getByRole('button', { name: 'Restaurar o verbete' }))
    await waitFor(() => expect(estadoAtual().registro('verbete', 'GL-editor01-1')!.excluido).toBe(false))
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Verbete excluído' })).toBeNull())
    // m5: o foco não cai no corpo; vai para a linha do verbete restaurado, na lista
    await waitFor(() => expect(document.querySelector('a.lista-linha[href^="/verbete/GL-editor01-1"]')).toHaveFocus())
    r.unmount()
    // a página de um excluído (por endereço) continua oferecendo "Restaurar"
    await registrar('verbete', 'GL-editor01-1', 'excluir')
    renderizarRota('/verbete/GL-editor01-1')
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurar o verbete' }))
    await waitFor(() => expect(estadoAtual().registro('verbete', 'GL-editor01-1')!.excluido).toBe(false))
  })

  it('um verbete do livro não tem "Excluir"', async () => {
    renderizarRota('/verbete/GL-900007')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('button', { name: 'Excluir o verbete' })).toBeNull()
  })
})

describe('possível duplicado (dois aparelhos criaram o mesmo termo sem internet)', () => {
  beforeAll(async () => {
    await registrar('verbete', 'GL-dupa0001-1', 'criar', { forma: 'termo gêmeo', status: 'proposed' })
    await registrar('verbete', 'GL-dupb0001-1', 'criar', { forma: 'Termo Gemeo', status: 'proposed' })
    await registrar('verbete', 'GL-dupa0001-2', 'criar', { forma: 'sozinho do teste', status: 'proposed' })
  })
  const linhas = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('a.lista-linha'))
  const linha = (id: string) => linhas().find((a) => a.getAttribute('href')?.startsWith(`/verbete/${id}`))

  it('"a revisar" põe as duas linhas juntas, cada uma com "possível duplicado"; a que está sozinha não tem a nota', async () => {
    renderizarRota('/glossario?revisar=1')
    await waitFor(() => expect(linha('GL-dupa0001-1')).toBeDefined())
    const nomes = linhas().map((x) => x.getAttribute('href')?.split('?')[0])
    const i = nomes.indexOf('/verbete/GL-dupa0001-1')
    expect(nomes.slice(i, i + 2).sort()).toEqual(['/verbete/GL-dupa0001-1', '/verbete/GL-dupb0001-1'])
    for (const id of ['GL-dupa0001-1', 'GL-dupb0001-1']) expect(within(linha(id)!).getByText('possível duplicado')).toBeInTheDocument()
    expect(within(linha('GL-dupa0001-2')!).queryByText('possível duplicado')).toBeNull()
  })

  it('a página do verbete diz com quem pode ser o mesmo, com link; renomear um deles tira o aviso', async () => {
    renderizarRota('/verbete/GL-dupa0001-1')
    await screen.findByRole('heading', { level: 1, name: 'termo gêmeo' })
    const aviso = screen.getByRole('note', { name: 'Possível duplicado' })
    expect(within(aviso).getByRole('link', { name: 'Termo Gemeo' })).toHaveAttribute('href', '/verbete/GL-dupb0001-1')
    await userEvent.clear(campoDaForma())
    await userEvent.type(campoDaForma(), 'termo bem diferente')
    await userEvent.tab()
    await waitFor(() => expect(screen.queryByRole('note', { name: 'Possível duplicado' })).toBeNull())
  })
})


describe('revisão 1, M2: mudar a forma de um verbete aprovado o devolve a "a revisar"', () => {
  const AVISO = 'A forma mudou; aprove de novo quando quiser.'
  const avisoDeMudanca = () => screen.queryByText(AVISO)

  it('aprovar e depois editar a forma: o estado volta a "a revisar", com o aviso, e "Aprovar" reaparece', async () => {
    renderizarRota('/verbete/GL-900005')
    await screen.findByRole('heading', { level: 1, name: 'Tell Probe Teste' })
    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(edicao('GL-900005')?.status).toBe('approved'))
    expect(avisoDeMudanca()).toBeNull()
    await userEvent.clear(campoDaForma())
    await userEvent.type(campoDaForma(), 'Tell Teste')
    await userEvent.tab()
    await waitFor(() => expect(edicao('GL-900005')).toEqual({ formaEmUso: 'Tell Teste', status: 'proposed', formaAprovada: 'Tell Probe Teste' }))
    expect(await screen.findByText(AVISO)).toBeInTheDocument()
    expect(screen.getByText('Nome · a revisar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
    // o estado foi escrito ANTES da forma (uma queda no meio não deixa a forma nova "aprovada")
    const estado = estadoAtual()
    expect(estado.hlcDoCampo('verbete', 'GL-900005', 'status')! < estado.hlcDoCampo('verbete', 'GL-900005', 'formaEmUso')!).toBe(true)
  })

  it('"Voltar à proposta original" num aprovado também devolve a "a revisar", com o aviso', async () => {
    renderizarRota('/verbete/GL-900005')
    await screen.findByRole('heading', { level: 1, name: 'Tell Teste' })
    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(edicao('GL-900005')?.status).toBe('approved'))
    await userEvent.click(screen.getByRole('button', { name: 'Voltar à proposta original' }))
    await waitFor(() => expect(edicao('GL-900005')).toEqual({ formaEmUso: null, status: 'proposed', formaAprovada: 'Tell Teste' }))
    expect(await screen.findByText(AVISO)).toBeInTheDocument()
  })

  it('um verbete aprovado no pacote (sem escrita de estado) também reabre ao mudar a forma', async () => {
    renderizarRota('/verbete/GL-900006')
    await screen.findByRole('heading', { level: 1, name: 'gravação de teste' })
    expect(screen.getByText('Aprovado')).toBeInTheDocument()
    await userEvent.clear(campoDaForma())
    await userEvent.type(campoDaForma(), 'gravura de teste')
    await userEvent.tab()
    await waitFor(() => expect(edicao('GL-900006')).toEqual({ formaEmUso: 'gravura de teste', status: 'proposed', formaAprovada: null }))
    expect(await screen.findByText(AVISO)).toBeInTheDocument()
  })

  it('só não reabre quando a forma que passa a valer é a que foi aprovada: voltar a ela, depois de outro aparelho mudá-la, a devolve a "aprovado"', async () => {
    await registrar('verbete', 'GL-900004', 'alterar', { formaEmUso: 'Maḥteṣ de prova' })
    await registrar('verbete', 'GL-900004', 'alterar', { status: 'approved', formaAprovada: 'Maḥteṣ de prova' }) // a forma aprovada
    await registrar('verbete', 'GL-900004', 'alterar', { formaEmUso: 'Maḥteṣ de outro aparelho' }) // depois, sem reabrir (outro aparelho)
    renderizarRota('/verbete/GL-900004')
    await screen.findByRole('heading', { level: 1, name: 'Maḥteṣ de outro aparelho' })
    // o estado de agora é derivado: a aprovação é de outra forma
    expect(screen.getByText('Nome · a revisar')).toBeInTheDocument()
    expect(await screen.findByText(AVISO)).toBeInTheDocument()
    await userEvent.clear(campoDaForma())
    await userEvent.type(campoDaForma(), 'Maḥteṣ de prova')
    await userEvent.tab()
    await waitFor(() => expect(edicao('GL-900004')?.formaEmUso).toBe('Maḥteṣ de prova'))
    // não reescreveu o estado (nada a reabrir) e a aprovação voltou a valer
    expect(edicao('GL-900004')?.status).toBe('approved')
    expect(await screen.findByText('Nome · aprovado')).toBeInTheDocument()
    expect(screen.getByText('Aprovado por você')).toBeInTheDocument()
    // qualquer outra forma reabre
    await userEvent.clear(campoDaForma())
    await userEvent.type(campoDaForma(), 'Maḥteṣ Teste')
    await userEvent.tab()
    await waitFor(() => expect(edicao('GL-900004')?.status).toBe('proposed'))
    expect(await screen.findByText(AVISO)).toBeInTheDocument()
  })
})

describe('revisão 2, I-A: o estado de agora é derivado da forma aprovada, qualquer que seja a ordem em que os aparelhos escreveram', () => {
  const AVISO = 'A forma mudou; aprove de novo quando quiser.'
  const linhas = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('a.lista-linha'))
  const linha = (id: string) => linhas().find((a) => a.getAttribute('href')?.startsWith(`/verbete/${id}`))

  beforeAll(async () => {
    // Cenário 1, edição tardia: A aprovou F (a original); B, que via "a revisar", editou G depois (sem reabrir).
    await registrar('verbete', 'GL-r2aaaaaa-1', 'criar', { forma: 'forma F', status: 'proposed' })
    await registrar('verbete', 'GL-r2aaaaaa-1', 'alterar', { status: 'approved', formaAprovada: null })
    await registrar('verbete', 'GL-r2aaaaaa-1', 'alterar', { formaEmUso: 'forma G' })
    // Cenário 2, edição concorrente: A editou G (t1); B, que não a viu, aprovou a original (t2 > t1).
    await registrar('verbete', 'GL-r2bbbbbb-1', 'criar', { forma: 'forma H', status: 'proposed' })
    await registrar('verbete', 'GL-r2bbbbbb-1', 'alterar', { formaEmUso: 'forma I' })
    await registrar('verbete', 'GL-r2bbbbbb-1', 'alterar', { status: 'approved', formaAprovada: null })
    // Um verbete do pacote que o pacote traz aprovado, com uma forma em uso escrita depois.
    await registrar('verbete', 'GL-900009', 'alterar', { formaEmUso: 'selo de prova' })
  })

  it('cenário 1 e 2: a página diz "a revisar", com o aviso e "Aprovar"; nunca "Aprovado por você" ao lado de uma forma que ninguém aprovou', async () => {
    for (const [id, nome] of [['GL-r2aaaaaa-1', 'forma G'], ['GL-r2bbbbbb-1', 'forma I']] as const) {
      const r = renderizarRota(`/verbete/${id}`)
      await screen.findByRole('heading', { level: 1, name: nome })
      expect(screen.getByText('Verbete do SKC · a revisar')).toBeInTheDocument()
      expect(screen.queryByText('Aprovado por você')).toBeNull()
      expect(await screen.findByText(AVISO)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
      r.unmount()
    }
  })

  it('a lista: sem ✓, no filtro "a revisar", e fora da contagem dos aprovados; o do pacote aprovado cuja forma mudou também', async () => {
    const r = renderizarRota('/glossario')
    await waitFor(() => expect(linha('GL-r2aaaaaa-1')).toBeDefined())
    for (const id of ['GL-r2aaaaaa-1', 'GL-r2bbbbbb-1', 'GL-900009']) expect(within(linha(id)!).queryByRole('img', { name: 'aprovado' })).toBeNull()
    r.unmount()
    renderizarRota('/glossario?revisar=1')
    await waitFor(() => expect(linha('GL-r2aaaaaa-1')).toBeDefined())
    expect(linha('GL-r2bbbbbb-1')).toBeDefined()
    expect(linha('GL-900009')).toBeDefined()
  })

  it('aprovar de novo grava a forma que a pessoa vê (um evento) e então vale; a lista ganha a ✓', async () => {
    const r = renderizarRota('/verbete/GL-r2aaaaaa-1')
    await screen.findByRole('heading', { level: 1, name: 'forma G' })
    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    await waitFor(() => expect(edicao('GL-r2aaaaaa-1')).toMatchObject({ status: 'approved', formaAprovada: 'forma G', formaEmUso: 'forma G' }))
    expect(await screen.findByText('Verbete do SKC · aprovado')).toBeInTheDocument()
    expect(screen.queryByText(AVISO)).toBeNull()
    r.unmount()
    renderizarRota('/glossario')
    await waitFor(() => expect(linha('GL-r2aaaaaa-1')).toBeDefined())
    expect(within(linha('GL-r2aaaaaa-1')!).getByRole('img', { name: 'aprovado' })).toBeInTheDocument()
  })
})

describe('revisão 1, M3: "Desfazer" traz de volta a forma que acabou de ser digitada, não a que estava na tela antes', () => {
  it('digitar e voltar à proposta em seguida: o "Desfazer" restaura o que foi digitado', async () => {
    await registrar('verbete', 'GL-m3aaaaaa-1', 'criar', { forma: 'forma criada m3', status: 'proposed' })
    await registrar('verbete', 'GL-m3aaaaaa-1', 'alterar', { formaEmUso: 'forma mais velha' })
    renderizarRota('/verbete/GL-m3aaaaaa-1')
    await screen.findByRole('heading', { level: 1, name: 'forma mais velha' })
    await userEvent.clear(campoDaForma())
    await userEvent.type(campoDaForma(), 'abc')
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à proposta original' }))
    await waitFor(() => expect(edicao('GL-m3aaaaaa-1')?.formaEmUso).toBeNull())
    const aviso = (await screen.findByText(/Voltou à proposta original/)).closest('p')!
    await userEvent.click(within(aviso).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(edicao('GL-m3aaaaaa-1')?.formaEmUso).toBe('abc'))
  })
})

describe('revisão 1, M5: possível duplicado entre um verbete do usuário e um do livro', () => {
  const linhas = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('a.lista-linha'))
  const linha = (id: string) => linhas().find((a) => a.getAttribute('href')?.startsWith(`/verbete/${id}`))

  it('um verbete do usuário com a forma de um do livro: os dois são marcados na lista, e a página de cada um aponta para o outro', async () => {
    await registrar('verbete', 'GL-m5aaaaaa-1', 'criar', { forma: 'Leão-de-Teste', status: 'proposed' })
    const r = renderizarRota('/glossario')
    await waitFor(() => expect(linha('GL-m5aaaaaa-1')).toBeDefined())
    await waitFor(() => expect(within(linha('GL-900001')!).getByText('possível duplicado')).toBeInTheDocument())
    expect(within(linha('GL-m5aaaaaa-1')!).getByText('possível duplicado')).toBeInTheDocument()
    expect(within(linha('GL-900007')!).queryByText('possível duplicado')).toBeNull()
    r.unmount()
    renderizarRota('/verbete/GL-m5aaaaaa-1')
    await screen.findByRole('heading', { level: 1, name: 'Leão-de-Teste' })
    expect(await within(screen.getByRole('note', { name: 'Possível duplicado' })).findByRole('link', { name: 'leão-de-teste' })).toHaveAttribute('href', '/verbete/GL-900001')
  })

  it('e o contrário: um verbete do livro renomeado para a forma de um do usuário também é marcado, na lista e na página', async () => {
    await registrar('verbete', 'GL-m5bbbbbb-1', 'criar', { forma: 'termo único do m5', status: 'proposed' })
    await registrar('verbete', 'GL-900008', 'alterar', { formaEmUso: 'Termo Unico do M5' })
    const r = renderizarRota('/glossario')
    await waitFor(() => expect(linha('GL-900008')).toBeDefined())
    await waitFor(() => expect(within(linha('GL-900008')!).getByText('possível duplicado')).toBeInTheDocument())
    expect(within(linha('GL-m5bbbbbb-1')!).getByText('possível duplicado')).toBeInTheDocument()
    r.unmount()
    renderizarRota('/verbete/GL-900008')
    await screen.findByRole('heading', { level: 1, name: 'Termo Unico do M5' })
    expect(await within(screen.getByRole('note', { name: 'Possível duplicado' })).findByRole('link', { name: 'termo único do m5' })).toHaveAttribute('href', '/verbete/GL-m5bbbbbb-1')
  })
})

describe('revisão 2, m4: o aviso de duplicado fala conforme os verbetes envolvidos', () => {
  it('dois verbetes do livro (um renomeado para a forma do outro): nada de "outro aparelho" nem de "exclua"; a saída é renomear', async () => {
    await registrar('verbete', 'GL-900002', 'alterar', { formaEmUso: 'filhote de leão-de-teste' })
    renderizarRota('/verbete/GL-900002')
    await screen.findByRole('heading', { level: 1, name: 'filhote de leão-de-teste' })
    const aviso = await screen.findByRole('note', { name: 'Possível duplicado' })
    expect(within(aviso).getByRole('link', { name: 'filhote de leão-de-teste' })).toHaveAttribute('href', '/verbete/GL-900007')
    expect(aviso).toHaveTextContent('Renomeie um dos dois')
    expect(aviso).not.toHaveTextContent(/outro aparelho|exclua/)
  })

  it('um verbete seu: pode ser o mesmo termo, e dá para excluir ou renomear o seu', async () => {
    renderizarRota('/verbete/GL-m5aaaaaa-1')
    const aviso = await screen.findByRole('note', { name: 'Possível duplicado' })
    expect(aviso).toHaveTextContent('Pode ser o mesmo termo que')
    expect(aviso).toHaveTextContent('exclua ou renomeie o seu')
  })
})
