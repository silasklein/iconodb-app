import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { atalhoRegistrado } from '../app/atalhos'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { renderizarRota } from '../test/renderizarRota'
import { teclasNaoDeclaradas } from '../test/atalhosDeclarados'
import { todosEventos } from '../usuario/armazem'
import { estadoAtual } from '../usuario/estado'
import { lerColecao } from './modelo'
import { acrescentarMembros, criarColecao, excluirColecao } from './operacoes'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => usarMotor(null))
afterEach(() => instalarMatchMedia(375))

const membrosDe = (id: string) => lerColecao(estadoAtual().registro('colecao', id)!).membros.map((m) => m.ref)
const colecoesComNome = (nome: string) => [...(estadoAtual().registros.get('colecao')?.values() ?? [])].filter((r) => r.campos.nome === nome && !r.excluido)

async function abrirFolha(numero = 'CA00001') {
  renderizarRota(`/item/${numero}`)
  const botao = await screen.findByRole('button', { name: 'Adicionar à coleção' })
  await userEvent.click(botao)
  return { botao, folha: await screen.findByRole('dialog', { name: 'Adicionar à coleção' }) }
}

describe('Adicionar à coleção, no item (ItemColecao.dc.html)', () => {
  it('o ícone de coleção está na barra do item, com dica e atalho C, e abre a folha', async () => {
    renderizarRota('/item/CA00001')
    const botao = await screen.findByRole('button', { name: 'Adicionar à coleção' })
    expect(botao).toHaveAttribute('aria-keyshortcuts', 'C')
    expect(botao).toHaveAttribute('aria-haspopup', 'dialog')
    expect(botao).toHaveAttribute('aria-expanded', 'false')
    expect(botao).toHaveAttribute('data-tip', 'Adicionar à coleção (C)')
    expect(teclasNaoDeclaradas(document.body)).toEqual([])
    await userEvent.click(botao)
    expect(botao).toHaveAttribute('aria-expanded', 'true')
    const folha = screen.getByRole('dialog', { name: 'Adicionar à coleção' })
    expect(within(folha).getByText('Adicionar a · SKC')).toBeInTheDocument()
    expect(within(folha).getByRole('button', { name: 'Fechar' })).toHaveAttribute('data-tip', 'Fechar (Esc)')
  })

  it('no celular é uma folha modal: o resto da tela fica inerte, o foco entra nela e Esc a fecha devolvendo o foco', async () => {
    const { botao, folha } = await abrirFolha()
    expect(folha).toHaveAttribute('aria-modal', 'true')
    await waitFor(() => expect(folha).toHaveFocus())
    expect(document.querySelector('.item')!.closest('[inert]') ?? document.querySelector('[inert] .item')).not.toBeNull()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Adicionar à coleção' })).toBeNull()
    expect(botao).toHaveFocus()
    expect(document.querySelector('[inert]')).toBeNull()
  })

  it('no computador é um painel junto à barra, sem prender o foco (não modal)', async () => {
    instalarMatchMedia(1280)
    const { folha } = await abrirFolha()
    expect(folha).not.toHaveAttribute('aria-modal')
    expect(document.querySelector('[inert]')).toBeNull()
  })

  it('no computador diz "Clique fora ou Esc para fechar." e um clique fora do painel o fecha (um clique dentro dele, não)', async () => {
    instalarMatchMedia(1280)
    const { folha } = await abrirFolha()
    expect(within(folha).getByText('Clique fora ou Esc para fechar.')).toBeInTheDocument()
    await userEvent.click(within(folha).getByLabelText('Nova coleção'))
    expect(screen.getByRole('dialog', { name: 'Adicionar à coleção' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('heading', { level: 1 }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Adicionar à coleção' })).toBeNull())
  })

  it('no celular a folha não traz essa dica (o fundo escuro é que fecha)', async () => {
    const { folha } = await abrirFolha()
    expect(within(folha).queryByText(/Clique fora/)).toBeNull()
  })

  it('sem coleções: diz que não há nenhuma e deixa criar a primeira ali mesmo', async () => {
    const { folha } = await abrirFolha()
    expect(within(folha).getByText('Nenhuma coleção ainda. Crie a primeira abaixo.')).toBeInTheDocument()
    expect(within(folha).queryAllByRole('checkbox')).toHaveLength(0)
    expect(within(folha).getByLabelText('Nova coleção')).toHaveAttribute('placeholder', 'ex.: Íbices em selos')
  })

  it('várias coleções na mesma folha: cada uma tem a sua caixa, marcada se o objeto já está nela, e marcar e desmarcar grava na hora', async () => {
    const a = await criarColecao('Folha A', { membros: ['CA00001'] })
    const b = await criarColecao('Folha B')
    const c = await criarColecao('Folha C', { membros: ['CA00002'] })
    const { folha } = await abrirFolha('CA00001')
    const caixa = (nome: string) => within(folha).getByRole('checkbox', { name: `Incluir em ${nome}` })
    expect(caixa('Folha A')).toBeChecked()
    expect(caixa('Folha B')).not.toBeChecked()
    expect(caixa('Folha C')).not.toBeChecked()
    // o nome da coleção é um link para ela
    expect(within(folha).getByRole('link', { name: 'Folha B' })).toHaveAttribute('href', `/grupo/${b}`)

    await userEvent.click(caixa('Folha B'))
    await userEvent.click(caixa('Folha C'))
    await userEvent.click(caixa('Folha A'))
    // cada clique grava de forma assíncrona: espera as três caixas chegarem ao estado final
    await waitFor(() => {
      expect(caixa('Folha B')).toBeChecked()
      expect(caixa('Folha C')).toBeChecked()
      expect(caixa('Folha A')).not.toBeChecked()
    })
    // a folha continua aberta e o estado e o IndexedDB já têm tudo
    expect(screen.getByRole('dialog', { name: 'Adicionar à coleção' })).toBeInTheDocument()
    expect(membrosDe(a)).toEqual([])
    expect(membrosDe(b)).toEqual(['CA00001'])
    expect(membrosDe(c)).toEqual(['CA00002', 'CA00001'])
    const gravados = (await todosEventos()).filter((e) => [a, b, c].includes(e.reg) && e.op === 'alterar')
    expect(gravados.map((e) => [e.reg, e.campos])).toEqual([
      [b, { 'm:CA00001': true, 'i:CA00001': 1024 }],
      [c, { 'm:CA00001': true, 'i:CA00001': 2048 }],
      [a, { 'm:CA00001': null }],
    ])
  })

  it('diz o que fez, com Desfazer, e Desfazer devolve a coleção ao que era (inclusive a posição)', async () => {
    const a = await criarColecao('Desfaz A', { membros: ['BA00001', 'CA00001', 'CA00002'] })
    const antes = lerColecao(estadoAtual().registro('colecao', a)!).membros.find((m) => m.ref === 'CA00001')!.ordem
    const { folha } = await abrirFolha('CA00001')
    await userEvent.click(within(folha).getByRole('checkbox', { name: 'Incluir em Desfaz A' }))
    const estado = await within(folha).findByRole('status')
    expect(estado).toHaveTextContent('Tirado de «Desfaz A»')
    expect(membrosDe(a)).toEqual(['BA00001', 'CA00002'])
    await userEvent.click(within(estado).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(membrosDe(a)).toEqual(['BA00001', 'CA00001', 'CA00002']))
    expect(lerColecao(estadoAtual().registro('colecao', a)!).membros.find((m) => m.ref === 'CA00001')!.ordem).toBe(antes)
    // e o aviso seguinte
    await userEvent.click(within(folha).getByRole('checkbox', { name: 'Incluir em Desfaz A' }))
    await userEvent.click(within(folha).getByRole('checkbox', { name: 'Incluir em Desfaz A' }))
    expect(await within(folha).findByRole('status')).toHaveTextContent('Adicionado a «Desfaz A»')
    await userEvent.click(within(folha).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(membrosDe(a)).toEqual(['BA00001', 'CA00002']))
  })

  it('"Nova coleção": o nome, Criar, e a coleção nasce já com o objeto, marcada na lista; o campo limpa', async () => {
    const { folha } = await abrirFolha('CA00003')
    const campo = within(folha).getByLabelText('Nova coleção')
    await userEvent.type(campo, '  Íbices em selos  ')
    await userEvent.click(within(folha).getByRole('button', { name: 'Criar' }))
    await waitFor(() => expect(colecoesComNome('Íbices em selos')).toHaveLength(1))
    const [r] = colecoesComNome('Íbices em selos')
    expect(membrosDe(r!.id)).toEqual(['CA00003'])
    expect(await within(folha).findByRole('checkbox', { name: 'Incluir em Íbices em selos' })).toBeChecked()
    expect(campo).toHaveValue('')
    expect(within(folha).getByRole('status')).toHaveTextContent('Coleção «Íbices em selos» criada com este objeto')
    // criar e adicionar é um só evento
    expect((await todosEventos()).filter((e) => e.reg === r!.id)).toHaveLength(1)
    // Desfazer a criação exclui a coleção (reversível)
    await userEvent.click(within(folha).getByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(colecoesComNome('Íbices em selos')).toHaveLength(0))
    expect(estadoAtual().registro('colecao', r!.id)!.excluido).toBe(true)
  })

  it('Enter no campo também cria', async () => {
    const { folha } = await abrirFolha('CA00004')
    await userEvent.type(within(folha).getByLabelText('Nova coleção'), 'Pelo Enter{Enter}')
    await waitFor(() => expect(colecoesComNome('Pelo Enter')).toHaveLength(1))
  })

  it('nome vazio: erro ao lado do campo (sem desabilitar o botão), que some quando se começa a digitar', async () => {
    const { folha } = await abrirFolha()
    const criar = within(folha).getByRole('button', { name: 'Criar' })
    expect(criar).toBeEnabled()
    await userEvent.click(criar)
    const alerta = within(folha).getByRole('alert')
    expect(alerta).toHaveTextContent('Escreva um nome para a coleção.')
    const campo = within(folha).getByLabelText('Nova coleção')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(campo).toHaveAccessibleDescription('Escreva um nome para a coleção.')
    expect(campo).toHaveFocus()
    await userEvent.type(campo, 'a')
    expect(within(folha).queryByRole('alert')).toBeNull()
    expect(campo).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('uma coleção excluída não é oferecida', async () => {
    const x = await criarColecao('Some da folha')
    const { folha } = await abrirFolha()
    expect(within(folha).getByRole('checkbox', { name: 'Incluir em Some da folha' })).toBeInTheDocument()
    await act(async () => {
      await excluirColecao(x)
    })
    await waitFor(() => expect(within(folha).queryByRole('checkbox', { name: 'Incluir em Some da folha' })).toBeNull())
  })

  it('a tecla C abre a folha; dentro do campo de texto a letra c é só uma letra', async () => {
    renderizarRota('/item/CA00002')
    await screen.findByRole('button', { name: 'Adicionar à coleção' })
    // Revisão 2 da Tarefa 16 (N5): o botão aparece no commit, mas o mapa de teclas do item é registrado num efeito, que sob
    // carga pode rodar depois de findByRole voltar; espera o registro (sem apertar a tecla dentro da espera).
    await waitFor(() => expect(atalhoRegistrado('c', 'item')).toBe(true))
    fireEvent.keyDown(document.body, { key: 'c' })
    const folha = await screen.findByRole('dialog', { name: 'Adicionar à coleção' })
    const campo = within(folha).getByLabelText('Nova coleção')
    campo.focus()
    await userEvent.keyboard('cc c')
    expect(campo).toHaveValue('cc c')
    expect(screen.getByRole('dialog', { name: 'Adicionar à coleção' })).toBeInTheDocument()
  })

  it('o mesmo objeto não entra duas vezes na mesma coleção, nem marcando de dois lugares', async () => {
    const a = await criarColecao('Sem duplicata')
    await acrescentarMembros(a, ['CA00001'])
    const { folha } = await abrirFolha('CA00001')
    expect(within(folha).getByRole('checkbox', { name: 'Incluir em Sem duplicata' })).toBeChecked()
    await act(async () => {
      await acrescentarMembros(a, ['CA00001'])
    })
    expect(membrosDe(a)).toEqual(['CA00001'])
  })
})
