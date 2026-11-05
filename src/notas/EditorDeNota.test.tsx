import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { usarTabelaDeFold } from '../busca/fold'
import { usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { todosEventos } from '../usuario/armazem'
import { estadoAtual, registrar } from '../usuario/estado'
import { esquecerPendentes } from '../usuario/pendentes'
import { EditorDeNota } from './EditorDeNota'
import { indiceDeNotas, type NotaVista } from './indiceDeNotas'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
})
afterAll(() => {
  usarMotor(null)
  usarTabelaDeFold(null)
})
afterEach(() => esquecerPendentes())

/** No user-event, "[" abre uma descrição de tecla: para digitar "[[" escreve-se "[[[[". */
const digitar = (t: string) => t.replaceAll('[', '[[')
const campo = () => screen.getByRole('textbox', { name: /^Nota/ })
const eventosDe = async (reg: string) => (await todosEventos()).filter((e) => e.reg === reg)

function montar(extra: Partial<React.ComponentProps<typeof EditorDeNota>> = {}) {
  const aoSalvar = vi.fn()
  const aoFechar = vi.fn()
  const aoExcluir = vi.fn()
  const r = render(
    <MemoryRouter>
      <EditorDeNota alvo={{ tipo: 'objeto', ref: 'CA00001' }} rotulo="Nota [1] · 01/11/2026" espera={30} aoSalvar={aoSalvar} aoFechar={aoFechar} aoExcluir={aoExcluir} {...extra} />
    </MemoryRouter>,
  )
  return { ...r, aoSalvar, aoFechar, aoExcluir }
}

describe('EditorDeNota: o campo', () => {
  it('tem o rótulo visível como nome, ajuda sobre [[ e é um campo de várias linhas', () => {
    montar()
    const c = campo()
    expect(c.tagName).toBe('TEXTAREA')
    expect(screen.getByText('Nota [1] · 01/11/2026')).toBeVisible()
    expect(c).toHaveAccessibleName('Nota [1] · 01/11/2026')
    expect(c).toHaveAttribute('aria-autocomplete', 'list')
    expect(c).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/liga a objetos, verbetes, obras e sítios/)).toBeInTheDocument()
  })

  it('o foco vai para o campo ao abrir (autoFoco)', () => {
    montar({ autoFoco: true })
    expect(campo()).toHaveFocus()
  })

  it('cada tecla chega ao IndexedDB, agregada: a nota é criada como rascunho, com o alvo, e as teclas seguintes só alteram o texto', async () => {
    montar()
    await userEvent.type(campo(), 'Marduk e o íbex')
    await waitFor(() => {
      const nota = [...(estadoAtual().registros.get('nota')?.values() ?? [])].find((r) => r.campos.texto === 'Marduk e o íbex')
      expect(nota).toBeDefined()
    })
    const reg = [...(estadoAtual().registros.get('nota')?.values() ?? [])].find((r) => r.campos.texto === 'Marduk e o íbex')!.id
    const eventos = (await eventosDe(reg)).sort((a, b) => (a.hlc < b.hlc ? -1 : 1))
    expect(eventos[0]).toMatchObject({ op: 'criar', campos: { alvoTipo: 'objeto', alvo: 'CA00001', rascunho: true } })
    expect(eventos.slice(1).every((e) => e.op === 'alterar')).toBe(true)
    // 15 teclas, mas bem menos eventos
    expect(eventos.length).toBeLessThan(15)
    expect(await screen.findByText(/rascunho salvo/i)).toBeInTheDocument()
  })

  it('fechar a tela (desmontar) grava o que falta, sem esperar o segundo', async () => {
    const { unmount } = montar({ espera: 60_000 })
    await userEvent.type(campo(), 'texto que não pode se perder ao sair')
    unmount()
    await waitFor(async () => expect((await todosEventos()).some((e) => e.campos.texto === 'texto que não pode se perder ao sair')).toBe(true))
  })

  it('uma nota que já existe abre com o texto dela e só grava `alterar`', async () => {
    await registrar('nota', 'NT-edit0000-1', 'criar', { texto: 'texto antigo', alvoTipo: 'verbete', alvo: 'GL-900001', rascunho: false })
    const nota = indiceDeNotas(estadoAtual()).porId.get('NT-edit0000-1') as NotaVista
    montar({ nota, alvo: { tipo: 'verbete', ref: 'GL-900001' } })
    expect(campo()).toHaveValue('texto antigo')
    await userEvent.type(campo(), ' mais')
    await waitFor(async () => expect((await eventosDe('NT-edit0000-1')).map((e) => e.op)).toEqual(['criar', 'alterar']))
    expect(estadoAtual().registro('nota', 'NT-edit0000-1')?.campos.texto).toBe('texto antigo mais')
  })
})

describe('EditorDeNota: [[ liga a objeto, verbete, obra ou sítio', () => {
  it('[[ + letras abre as sugestões do pacote; Enter insere [[GL-…|rótulo]] e fecha a lista', async () => {
    montar()
    await userEvent.type(campo(), digitar('veja o [[lea'))
    const lista = await screen.findByRole('listbox', { name: /Sugestões/ })
    expect(campo()).toHaveAttribute('aria-expanded', 'true')
    expect(campo()).toHaveAttribute('aria-controls', lista.id)
    const opcao = within(lista).getAllByRole('option', { name: /leão-de-teste/ })[0]!
    expect(campo()).toHaveAttribute('aria-activedescendant', within(lista).getAllByRole('option')[0]!.id)
    expect(opcao).toBeInTheDocument()
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{ArrowUp}')
    // a primeira opção é a ativa; ela é um verbete
    const primeira = within(lista).getAllByRole('option')[0]!
    expect(primeira).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Enter}')
    expect(campo()).toHaveValue('veja o [[GL-900001|leão-de-teste]]')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(campo()).toHaveFocus()
    expect(campo()).toHaveAttribute('aria-expanded', 'false')
    // o cursor fica depois do link: o que se digita agora vem depois
    await userEvent.keyboard(' e mais')
    expect(campo()).toHaveValue('veja o [[GL-900001|leão-de-teste]] e mais')
  })

  it('objeto: o link é [[CA00001]] (o número é o rótulo); clicar na opção também insere e o foco não sai do campo', async () => {
    montar()
    await userEvent.type(campo(), digitar('[[CA0000'))
    const lista = await screen.findByRole('listbox')
    const ca1 = await within(lista).findByRole('option', { name: /CA00001/ })
    await userEvent.click(ca1)
    expect(campo()).toHaveValue('[[CA00001]]')
    expect(campo()).toHaveFocus()
  })

  it('a lista não mostra "Ver todos os resultados" (aqui só se escolhe a quem ligar)', async () => {
    montar()
    await userEvent.type(campo(), digitar('[[lea'))
    const lista = await screen.findByRole('listbox')
    expect(within(lista).queryByText(/Ver todos/)).toBeNull()
  })

  it('Esc com a lista aberta fecha só a lista; outro Esc volta à leitura e guarda o rascunho; o Esc da leitura fecha o editor', async () => {
    const { aoFechar } = montar()
    await userEvent.type(campo(), digitar('rascunho [[lea'))
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(aoFechar).not.toHaveBeenCalled()
    // continuar digitando não reabre a lista fechada à mão (o mesmo [[)
    await userEvent.type(campo(), 'o')
    expect(screen.queryByRole('listbox')).toBeNull()
    await userEvent.keyboard('{Escape}')
    expect(aoFechar).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()
    await waitFor(async () => expect((await todosEventos()).some((e) => String(e.campos.texto ?? '').startsWith('rascunho [[leao'))).toBe(true))
    await userEvent.keyboard('{Escape}')
    expect(aoFechar).toHaveBeenCalledOnce()
  })

  it('um novo [[ depois de fechar à mão abre a lista de novo', async () => {
    montar()
    await userEvent.type(campo(), digitar('[[lea'))
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    await userEvent.type(campo(), digitar(' e [[mah'))
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
  })

  it('sem [[ aberto não há lista; o cursor fora de um [[…]] já fechado também não abre nada', async () => {
    montar()
    await userEvent.type(campo(), digitar('texto comum com [ e ] soltos'))
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(campo(), { target: { value: 'a [[GL-900001|leão]] depois' } })
    fireEvent.select(campo(), { target: { selectionStart: 26, selectionEnd: 26 } })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('o botão "Inserir link" põe [[ no cursor, foca o campo e prepara a lista', async () => {
    montar()
    await userEvent.type(campo(), 'cf. ')
    await userEvent.click(screen.getByRole('button', { name: 'Inserir link para objeto, verbete ou obra' }))
    expect(campo()).toHaveValue('cf. [[')
    expect(campo()).toHaveFocus()
    await userEvent.keyboard('mah')
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
  })

  it('o cursor no meio do texto: o link entra onde está o [[, sem mexer no resto', async () => {
    montar()
    fireEvent.change(campo(), { target: { value: 'antes  depois' } })
    await userEvent.type(campo(), digitar('[[lea'), { initialSelectionStart: 6, initialSelectionEnd: 6 })
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Enter}')
    expect(campo()).toHaveValue('antes [[GL-900001|leão-de-teste]] depois')
  })

  it('Enter durante uma composição (IME) não insere nada', async () => {
    montar()
    await userEvent.type(campo(), digitar('[[lea'))
    await screen.findByRole('listbox')
    fireEvent.keyDown(campo(), { key: 'Enter', isComposing: true, keyCode: 229 })
    expect(campo()).toHaveValue('[[lea')
  })

  it('o rótulo com colchetes ou barra não quebra o link', async () => {
    await registrar('sitio', 'SI-edit0000-9', 'criar', { nome: 'Tell [A]|B' })
    montar()
    await userEvent.type(campo(), digitar('[[tell'))
    const lista = await screen.findByRole('listbox')
    const opcao = await within(lista).findByRole('option', { name: /Tell \[A\]\|B/ })
    await userEvent.click(opcao)
    expect(campo()).toHaveValue('[[SI-edit0000-9|Tell A B]]')
  })
})

describe('EditorDeNota: salvar, fechar, excluir', () => {
  it('Salvar nota grava, tira a marca de rascunho e avisa com o id', async () => {
    const { aoSalvar } = montar()
    await userEvent.type(campo(), 'a nota')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nota' }))
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledOnce())
    const reg = aoSalvar.mock.calls[0]![0] as string
    expect(reg).toMatch(/^NT-/)
    expect(estadoAtual().registro('nota', reg)?.campos).toMatchObject({ texto: 'a nota', rascunho: false })
  })

  it('Ctrl+Enter e ⌘+Enter também salvam', async () => {
    const { aoSalvar } = montar()
    await userEvent.type(campo(), 'por atalho')
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledOnce())
    aoSalvar.mockClear()
    // salvar volta à leitura: Editar e o atalho com ⌘
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledOnce())
  })

  it('Salvar sem texto não fica apagado: mostra o erro ao lado do campo e não salva', async () => {
    const { aoSalvar } = montar()
    const salvar = screen.getByRole('button', { name: 'Salvar nota' })
    expect(salvar).toBeEnabled()
    await userEvent.click(salvar)
    expect(await screen.findByRole('alert')).toHaveTextContent('Escreva a nota antes de salvar.')
    expect(campo()).toHaveAttribute('aria-invalid', 'true')
    expect(campo()).toHaveAccessibleDescription(/Escreva a nota antes de salvar/)
    expect(aoSalvar).not.toHaveBeenCalled()
    // digitar tira o erro
    await userEvent.type(campo(), 'x')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('se a gravação falha, o erro aparece e o texto continua no campo', async () => {
    const falha: typeof registrar = () => Promise.reject(new Error('IndexedDB indisponível'))
    montar({ dependencias: { registrar: falha, novoId: async () => 'NT-falha000-1' } })
    await userEvent.type(campo(), 'texto na tela')
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível gravar a nota neste aparelho')
    expect(alerta).toHaveTextContent('IndexedDB indisponível')
    expect(campo()).toHaveValue('texto na tela')
  })

  it('"Excluir nota" só aparece numa nota que existe e avisa quem chamou', async () => {
    montar()
    expect(screen.queryByRole('button', { name: 'Excluir nota' })).toBeNull()
    await registrar('nota', 'NT-excl0000-1', 'criar', { texto: 'sai', alvoTipo: 'obra', alvo: 'BIB-900001', rascunho: false })
    const nota = indiceDeNotas(estadoAtual()).porId.get('NT-excl0000-1') as NotaVista
    const { aoExcluir } = montar({ nota, alvo: { tipo: 'obra', ref: 'BIB-900001' } })
    await userEvent.click(screen.getAllByRole('button', { name: 'Excluir nota' })[0]!)
    await waitFor(() => expect(aoExcluir).toHaveBeenCalledOnce())
    expect(estadoAtual().registro('nota', 'NT-excl0000-1')?.excluido).toBe(true)
  })

  it('o ícone de ajuda de teclas e o botão de link têm dica e nome', () => {
    montar()
    const b = screen.getByRole('button', { name: 'Inserir link para objeto, verbete ou obra' })
    expect(b).toHaveAttribute('data-tip', expect.stringContaining('Inserir link'))
  })
})
