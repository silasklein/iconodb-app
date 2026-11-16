/**
 * Fix round 1 da Tarefa 12 (R1 e M1): o verbete do usuário já publicado continua editável. A página do verbete dos livros que
 * o pacote CRIOU de verbetes seus (redirecionamento com `criado`) tem «Editar os dados»; com uma origem viva, a escrita vai
 * para o registro dela, com duas ou mais, para o registro com o id do livro (o `user-import` lê os dois, `dados_do_verbete`);
 * a leitura mostra, campo a campo, a escrita mais nova da camada sobre o pacote. O verbete que só redireciona para um que já
 * era dos livros, e o verbete puro dos livros, não se editam. E o filtro do Glossário acha um verbete dos livros pelo
 * árabe, pelo hebraico e pelas outras línguas. Dados sintéticos.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { executar, usarMotor } from '../banco/cliente'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'
import { alterarCamposDoVerbete } from './operacoes'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

// O pacote sintético já traz GL-teste123-1 → GL-900010 (criado) e GL-teste123-2 → GL-900002 (só redireciona). Aqui,
// mais duas origens que criaram juntas o GL-900008.
const DUAS = ['GL-cccccccc-8', 'GL-dddddddd-8']

beforeAll(async () => {
  usarMotor(await bancoDeTeste({ escrita: true }))
  usarFoldDoPacoteSintetico()
  for (const de of DUAS) await executar(`INSERT INTO main.redirecionamento (de, para, tipo, criado) VALUES ('${de}', 'GL-900008', 'verbete', 1)`)
  await registrar('verbete', 'GL-teste123-1', 'criar', { forma: 'amuleto de prova', status: 'proposed' })
  await registrar('verbete', 'GL-teste123-2', 'criar', { forma: 'figura denteada', status: 'proposed' })
  for (const de of DUAS) await registrar('verbete', de, 'criar', { forma: 'estrela de prova', status: 'proposed' })
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

const gravado = (id: string) => estadoAtual().registro('verbete', id)?.campos ?? {}
const dd = (rotulo: string) => screen.getByText(rotulo, { selector: 'dt' }).nextElementSibling as HTMLElement
const editar = () => screen.getByRole('button', { name: 'Editar os dados' })

describe('o verbete publicado que veio de você continua editável', () => {
  it('uma origem: «Editar os dados» grava no registro dela; a leitura mostra a edição sobre o pacote, e continua depois de reabrir', async () => {
    const r = renderizarRota('/verbete/GL-900010')
    await screen.findByRole('heading', { level: 1, name: 'amuleto de prova' })
    await userEvent.click(await screen.findByRole('button', { name: 'Editar os dados' }))
    const form = screen.getByRole('region', { name: 'Dados do verbete' })
    // o formulário começa com os valores do pacote
    expect(within(form).getByLabelText('Árabe')).toHaveValue('تميمة تجريبية')
    expect(within(form).getByRole('textbox', { name: 'Outra língua 1: a língua' })).toHaveValue('grego')

    await userEvent.type(within(form).getByLabelText('Alemão'), 'Probeamulett')
    await userEvent.tab()
    await waitFor(() => expect(gravado('GL-teste123-1').de).toBe('Probeamulett'))
    // apagar um valor do pacote limpa o campo (null: o user-import o tira)
    await userEvent.clear(within(form).getByLabelText('Árabe'))
    await userEvent.tab()
    await waitFor(() => expect(gravado('GL-teste123-1').ar).toBeNull())
    await userEvent.selectOptions(within(form).getByLabelText('Gênero'), 'masculino')
    await waitFor(() => expect(gravado('GL-teste123-1').genero).toBe('m'))
    // nada no registro com o id do livro
    expect(estadoAtual().registro('verbete', 'GL-900010')).toBeUndefined()

    // o próprio verbete (pelo id do livro) não é opção de termo mais geral, nem a operação o aceita
    const pai = within(form).getByRole('combobox', { name: 'Termo mais geral' })
    await userEvent.type(pai, 'amuleto')
    expect(within(form).queryByRole('option', { name: /amuleto de prova/ })).toBeNull()
    await userEvent.clear(pai)
    await expect(alterarCamposDoVerbete('GL-teste123-1', { pai: 'GL-900010' })).rejects.toThrow(/termo mais geral dele mesmo/)

    await userEvent.click(editar())
    expect(dd('Alemão')).toHaveTextContent('Probeamulett')
    expect(screen.queryByText('Árabe', { selector: 'dt' })).toBeNull()
    expect(dd('Hebraico')).toHaveTextContent('קמע ניסיון') // o do pacote, não mexido
    expect(dd('Gênero')).toHaveTextContent('masculino')

    // reabrir a página: a edição continua valendo sobre o pacote
    r.unmount()
    renderizarRota('/verbete/GL-900010')
    await screen.findByRole('heading', { level: 1, name: 'amuleto de prova' })
    await waitFor(() => expect(dd('Alemão')).toHaveTextContent('Probeamulett'))
    expect(screen.queryByText('Árabe', { selector: 'dt' })).toBeNull()
    expect(dd('Gênero')).toHaveTextContent('masculino')
  })

  it('duas origens: a escrita vai para o registro com o id do livro, que o user-import lê junto com cada uma', async () => {
    const r = renderizarRota('/verbete/GL-900008')
    await screen.findByRole('heading', { level: 1, name: 'estrela de prova' })
    await userEvent.click(await screen.findByRole('button', { name: 'Editar os dados' }))
    const form = screen.getByRole('region', { name: 'Dados do verbete' })
    await userEvent.clear(within(form).getByLabelText('Inglês'))
    await userEvent.type(within(form).getByLabelText('Inglês'), 'trial star')
    await userEvent.tab()
    await waitFor(() => expect(gravado('GL-900008').en).toBe('trial star'))
    for (const o of DUAS) expect(gravado(o).en).toBeUndefined()
    await userEvent.click(within(form).getByRole('radio', { name: 'Nome' }))
    await waitFor(() => expect(gravado('GL-900008').tipo).toBe('name'))
    r.unmount()
    renderizarRota('/verbete/GL-900008')
    await screen.findByRole('heading', { level: 1, name: 'estrela de prova' })
    await waitFor(() => expect(dd('Inglês')).toHaveTextContent('trial star'))
    expect(screen.getByText(/^Nome · /)).toBeInTheDocument()
  })

  it('a escrita mais nova da camada vale, entre a origem e o registro com o id do livro', async () => {
    await registrar('verbete', 'GL-900008', 'alterar', { de: 'Probestern-A' })
    await registrar('verbete', DUAS[0]!, 'alterar', { de: 'Probestern-B' })
    renderizarRota('/verbete/GL-900008')
    await screen.findByRole('heading', { level: 1, name: 'estrela de prova' })
    await waitFor(() => expect(dd('Alemão')).toHaveTextContent('Probestern-B'))
  })

  it('sem «Editar os dados»: o verbete que só redireciona para um que já era dos livros, o puro dos livros, e o de origem excluída', async () => {
    const a = renderizarRota('/verbete/GL-900002')
    await screen.findByRole('heading', { level: 1, name: 'figura denteada' })
    expect(screen.queryByRole('button', { name: 'Editar os dados' })).toBeNull()
    await expect(alterarCamposDoVerbete('GL-900002', { de: 'x' })).rejects.toThrow(/não veio de um verbete seu/)
    a.unmount()
    const b = renderizarRota('/verbete/GL-900001')
    await screen.findByRole('heading', { level: 1, name: 'leão-de-teste' })
    expect(screen.queryByRole('button', { name: 'Editar os dados' })).toBeNull()
    b.unmount()
    await registrar('verbete', 'GL-teste123-1', 'excluir')
    renderizarRota('/verbete/GL-900010')
    await screen.findByRole('heading', { level: 1, name: 'amuleto de prova' })
    expect(screen.queryByRole('button', { name: 'Editar os dados' })).toBeNull()
    // excluída a origem, vale o pacote (o verbete sai dos livros no próximo build)
    expect(screen.queryByText('Alemão', { selector: 'dt' })).toBeNull()
    expect(dd('Árabe')).toHaveTextContent('تميمة تجريبية')
    await registrar('verbete', 'GL-teste123-1', 'restaurar')
  })
})

describe('M1: o filtro do Glossário acha um verbete dos livros pelo árabe, pelo hebraico e pelas outras línguas', () => {
  const linhas = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('a.lista-linha')).map((a) => a.getAttribute('href')?.split('?')[0])
  it.each([
    ['o grego dobrado', 'φυλακτηριον'],
    ['o latim', 'amuletum'],
    ['o árabe', 'تميمة'],
    ['o hebraico', 'קמע'],
  ])('%s', async (_, consulta) => {
    renderizarRota('/glossario')
    await waitFor(() => expect(linhas()).toContain('/verbete/GL-900010'))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar no glossário' }), consulta)
    await waitFor(() => expect(linhas()).toEqual(['/verbete/GL-900010']))
  })
})
