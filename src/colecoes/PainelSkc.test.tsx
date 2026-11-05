import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Colecoes } from '../telas/Colecoes'
import { todosEventos } from '../usuario/armazem'
import { estadoAtual, registrar } from '../usuario/estado'
import { lerColecao } from './modelo'
import { criarColecao, excluirColecao } from './operacoes'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

function abrir(url = '/colecoes') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Colecoes />
    </MemoryRouter>,
  )
}
const regiao = (nome: string) => screen.getByRole('region', { name: nome })
const colecoesComNome = (nome: string) => [...(estadoAtual().registros.get('colecao')?.values() ?? [])].filter((r) => r.campos.nome === nome)

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

// Os testes compartilham a camada do usuário do arquivo: o primeiro vê tudo vazio.
describe('a aba SKC das Coleções: meus objetos e minhas coleções', () => {
  it('vazia: "Meus objetos" com o cartão "Novo objeto" e o estado vazio, e "Minhas coleções" que diz como criar a primeira', async () => {
    abrir()
    const objetos = regiao('Meus objetos')
    expect(within(objetos).getByRole('heading', { level: 2, name: 'Meus objetos' })).toBeInTheDocument()
    expect(within(objetos).getByText('0 · SKC')).toBeInTheDocument()
    expect(within(objetos).getByText(/Nenhum objeto SKC ainda/)).toBeInTheDocument()
    const novo = within(objetos).getByRole('link', { name: /Novo objeto/ })
    expect(novo).toHaveAttribute('href', '/objeto/novo')
    expect(novo).toHaveTextContent('de artigo, relatório ou achado')
    const colecoes = regiao('Minhas coleções')
    expect(within(colecoes).getByRole('heading', { level: 2, name: 'Minhas coleções' })).toBeInTheDocument()
    expect(within(colecoes).getByText(/Nenhuma coleção ainda/)).toBeInTheDocument()
    expect(within(colecoes).getByRole('button', { name: 'Criar coleção' })).toBeInTheDocument()
    // "Meus objetos" vem antes de "Minhas coleções"
    expect(objetos.compareDocumentPosition(colecoes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('criar coleção: o campo abre no lugar com o foco; Enter cria, a linha aparece, diz o que fez e o foco volta ao botão', async () => {
    abrir()
    const colecoes = regiao('Minhas coleções')
    await userEvent.click(within(colecoes).getByRole('button', { name: 'Criar coleção' }))
    const campo = within(colecoes).getByRole('textbox', { name: 'Nome da nova coleção' })
    expect(campo).toHaveFocus()
    await userEvent.type(campo, '  Remates de exemplo  {Enter}')
    await waitFor(() => expect(colecoesComNome('Remates de exemplo')).toHaveLength(1))
    const [r] = colecoesComNome('Remates de exemplo')
    const linha = await within(colecoes).findByRole('link', { name: /Remates de exemplo/ })
    expect(linha).toHaveAttribute('href', `/grupo/${r!.id}`)
    expect(linha).toHaveTextContent('0')
    // a linha aparece assim que o evento entra no estado; o aviso, o fechar do campo e o foco vêm logo depois
    await waitFor(() => {
      expect(within(colecoes).getByRole('status')).toHaveTextContent('Coleção «Remates de exemplo» criada')
      expect(within(colecoes).queryByRole('textbox')).toBeNull()
      expect(within(colecoes).getByRole('button', { name: 'Criar coleção' })).toHaveFocus()
    })
    expect(within(colecoes).queryByText(/Nenhuma coleção ainda/)).toBeNull()
    expect((await todosEventos()).filter((e) => e.reg === r!.id)).toHaveLength(1)
  })

  it('nome vazio: erro junto ao campo, o campo fica aberto, nada é gravado; Esc fecha', async () => {
    abrir()
    const colecoes = regiao('Minhas coleções')
    const antes = (await todosEventos()).length
    await userEvent.click(within(colecoes).getByRole('button', { name: 'Criar coleção' }))
    await userEvent.click(within(colecoes).getByRole('button', { name: 'Criar' }))
    expect(within(colecoes).getByRole('alert')).toHaveTextContent('Escreva um nome para a coleção.')
    const campo = within(colecoes).getByRole('textbox', { name: 'Nome da nova coleção' })
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveFocus()
    expect((await todosEventos()).length).toBe(antes)
    await userEvent.type(campo, 'x')
    expect(within(colecoes).queryByRole('alert')).toBeNull()
    await userEvent.keyboard('{Escape}')
    expect(within(colecoes).queryByRole('textbox')).toBeNull()
    expect(within(colecoes).getByRole('button', { name: 'Criar coleção' })).toHaveFocus()
    expect((await todosEventos()).length).toBe(antes)
  })

  it('lista as coleções da mais antiga à mais nova, com a contagem de objetos', async () => {
    const a = await criarColecao('Lista A', { membros: ['CA00001', 'CA00002', 'CA00003'] })
    const b = await criarColecao('Lista B', { membros: ['BA00001'] })
    abrir()
    const colecoes = regiao('Minhas coleções')
    const la = await within(colecoes).findByRole('link', { name: /Lista A/ })
    const lb = within(colecoes).getByRole('link', { name: /Lista B/ })
    expect(la).toHaveAttribute('href', `/grupo/${a}`)
    expect(la).toHaveTextContent('3')
    expect(lb).toHaveAttribute('href', `/grupo/${b}`)
    expect(lb).toHaveTextContent('1')
    expect(la.compareDocumentPosition(lb) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // a contagem tem a unidade para quem lê a tela
    expect(within(la).getByText('objetos')).toHaveClass('so-leitor')
    expect(within(lb).getByText('objeto')).toHaveClass('so-leitor')
  })

  it('meus objetos: os objetos SKC viram cartões (número, tipo, origem) e levam ao item; os excluídos ficam de fora', async () => {
    await registrar('objeto', 'OB-painel01-1', 'criar', { numero: 'CA00046', titulo: 'Cabeça de maça. Cobre.', obraRotulo: 'Artigo 2025', figura: '3' })
    await registrar('objeto', 'OB-painel02-1', 'criar', { numero: 'BA00125', titulo: 'Selo cilíndrico.', origemTipo: 'achado' })
    await registrar('objeto', 'OB-painel03-1', 'criar', { numero: 'BI00049', titulo: 'Jarro pintado.' })
    await registrar('objeto', 'OB-painel03-1', 'excluir')
    abrir()
    const objetos = regiao('Meus objetos')
    const cartao = await within(objetos).findByRole('link', { name: /CA00046/ })
    expect(cartao).toHaveAttribute('href', '/item/CA00046')
    expect(cartao).toHaveTextContent('Cabeça de maça')
    expect(within(objetos).getByRole('link', { name: /BA00125/ })).toBeInTheDocument()
    expect(within(objetos).queryByRole('link', { name: /BI00049/ })).toBeNull()
    expect(within(objetos).getByText('2 · SKC')).toBeInTheDocument()
    expect(within(objetos).queryByText(/Nenhum objeto SKC ainda/)).toBeNull()
    // o cartão "Novo objeto" continua ali, antes dos objetos
    const novo = within(objetos).getByRole('link', { name: /Novo objeto/ })
    expect(novo.compareDocumentPosition(cartao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('coleções excluídas saem da lista e ficam em "Excluídas", onde Restaurar as traz de volta', async () => {
    const id = await criarColecao('Para restaurar', { membros: ['CA00002'] })
    abrir()
    const colecoes = regiao('Minhas coleções')
    expect(await within(colecoes).findByRole('link', { name: /Para restaurar/ })).toBeInTheDocument()
    await excluirColecao(id)
    await waitFor(() => expect(within(colecoes).queryByRole('link', { name: /Para restaurar/ })).toBeNull())
    const excluidas = within(colecoes).getByRole('group', { name: 'Coleções excluídas' })
    expect(within(excluidas).getByText('Para restaurar')).toBeInTheDocument()
    await userEvent.click(within(excluidas).getByRole('button', { name: 'Restaurar Para restaurar' }))
    expect(await within(colecoes).findByRole('link', { name: /Para restaurar/ })).toBeInTheDocument()
    expect(estadoAtual().registro('colecao', id)!.excluido).toBe(false)
    expect(lerColecao(estadoAtual().registro('colecao', id)!).membros.map((m) => m.ref)).toEqual(['CA00002'])
    await waitFor(() => expect(within(colecoes).getByRole('status')).toHaveTextContent('Coleção «Para restaurar» restaurada'))
  })

  it('sem coleções excluídas não há a seção "Excluídas"', async () => {
    abrir()
    await within(regiao('Minhas coleções')).findByRole('link', { name: /Lista A/ })
    expect(screen.queryByRole('group', { name: 'Coleções excluídas' })).toBeNull()
  })

  it('a aba de uma obra do pacote não mostra nada disto', async () => {
    abrir('/colecoes?obra=TESTE-I')
    await screen.findByRole('link', { name: /Animais de teste/ })
    expect(screen.queryByRole('region', { name: 'Meus objetos' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Minhas coleções' })).toBeNull()
  })

  it('no computador a mesma aba, com o cartão "Novo objeto" ao lado dos objetos', async () => {
    instalarMatchMedia(1280)
    abrir()
    expect(within(regiao('Meus objetos')).getByRole('link', { name: /Novo objeto/ })).toHaveAttribute('href', '/objeto/novo')
    expect(within(regiao('Minhas coleções')).getByRole('button', { name: 'Criar coleção' })).toBeInTheDocument()
  })
})
