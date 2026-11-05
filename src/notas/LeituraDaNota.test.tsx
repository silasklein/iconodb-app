/**
 * Decisão do usuário (01/11): a nota que não se edita aparece como no quadro (cada [[ref|rótulo]] vira só o rótulo, sublinhado e
 * clicável); tocar no texto, Enter ou E no bloco, ou o botão "Editar" abrem o campo com o código; sair do campo volta à leitura.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { usarTabelaDeFold } from '../busca/fold'
import { usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { todosEventos } from '../usuario/armazem'
import { estadoAtual, registrar } from '../usuario/estado'
import { esquecerPendentes } from '../usuario/pendentes'
import { esquecerAlvos } from './alvos'
import { EditorDeNota } from './EditorDeNota'
import { indiceDeNotas, type NotaVista } from './indiceDeNotas'
import { useIndiceDeNotas } from './useIndiceDeNotas'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
})
afterAll(() => {
  usarMotor(null)
  usarTabelaDeFold(null)
})
beforeEach(() => esquecerAlvos())
afterEach(() => esquecerPendentes())

let n = 0
async function umaNota(texto: string): Promise<NotaVista> {
  const reg = `NT-leit0000-${++n}`
  await registrar('nota', reg, 'criar', { texto, alvoTipo: 'objeto', alvo: 'CA00001', rascunho: false })
  return indiceDeNotas(estadoAtual()).porId.get(reg) as NotaVista
}
/** Como nas telas: a nota que o editor recebe é a de agora (o índice), não uma cópia do momento em que abriu. */
function Vivo({ nota, ...resto }: React.ComponentProps<typeof EditorDeNota>) {
  const indice = useIndiceDeNotas()
  return <EditorDeNota nota={nota ? (indice.porId.get(nota.id) ?? nota) : null} {...resto} />
}
function montar(nota: NotaVista | null, extra: Partial<React.ComponentProps<typeof EditorDeNota>> = {}) {
  const aoFechar = vi.fn()
  const aoSalvar = vi.fn()
  const r = render(
    <MemoryRouter initialEntries={['/aqui']}>
      <Routes>
        <Route
          path="/aqui"
          element={<Vivo nota={nota} alvo={{ tipo: 'objeto', ref: 'CA00001' }} rotulo="Nota [1] · 01/11/2026" espera={30} iniciarLendo={!!nota} aoFechar={aoFechar} aoSalvar={aoSalvar} {...extra} />}
        />
        <Route path="/verbete/:id" element={<p>tela do verbete</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return { ...r, aoFechar, aoSalvar }
}
const bloco = () => screen.getByRole('group', { name: /^Nota \[1\]/ })
const campo = () => screen.getByRole('textbox', { name: /^Nota \[1\]/ }) as HTMLTextAreaElement

describe('leitura', () => {
  it('mostra o texto como no quadro: o rótulo do link, sem o código; um alvo que falta fica com o "?"', async () => {
    const nota = await umaNota('veja [[GL-900001|o leão]] e [[GL-909999|fantasma]] e [[CA00002]].')
    montar(nota)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(bloco()).toHaveTextContent('veja o leão e fantasma')
    expect(bloco().textContent).not.toContain('[[')
    expect(bloco().textContent).not.toContain('GL-900001')
    const link = within(bloco()).getByRole('link', { name: 'o leão' })
    expect(link).toHaveAttribute('href', '/verbete/GL-900001')
    await waitFor(() => expect(within(bloco()).getByText('fantasma').closest('.nota-ausente')).not.toBeNull())
    expect(within(bloco()).getByRole('link', { name: 'CA00002' })).toBeInTheDocument()
  })

  it('tem um botão "Editar" com o rótulo visível', async () => {
    montar(await umaNota('texto'))
    expect(screen.getByRole('button', { name: 'Editar' })).toBeVisible()
  })

  it('clicar no texto abre o campo com o código [[…]] e o foco, com o cursor no fim', async () => {
    montar(await umaNota('veja [[GL-900001|o leão]] aqui'))
    await userEvent.click(within(bloco()).getByText(/aqui/))
    expect(campo()).toHaveValue('veja [[GL-900001|o leão]] aqui')
    expect(campo()).toHaveFocus()
    expect(campo().selectionStart).toBe(campo().value.length)
    expect(screen.queryByRole('group', { name: /^Nota \[1\]/ })).toBeNull()
  })

  it('o botão Editar, Enter e E no bloco com o foco também abrem o campo', async () => {
    montar(await umaNota('abre por teclado'))
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(campo()).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    bloco().focus()
    await userEvent.keyboard('{Enter}')
    expect(campo()).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    bloco().focus()
    await userEvent.keyboard('e')
    expect(campo()).toHaveFocus()
  })

  it('decisão 40: a citação aparece limpa; o intervalo abre a lista e NÃO a edição (nem o fundo da folha); a edição mostra o texto cru', async () => {
    montar(await umaNota('como TESTE I: 1-3, 5.'))
    const intervalo = await within(bloco()).findByRole('button', { name: 'TESTE I: 1–3, lista dos objetos' })
    expect(bloco()).toHaveTextContent('como TESTE I: 1–3, 5.')
    await userEvent.click(intervalo)
    const folha = await screen.findByRole('dialog', { name: 'TESTE I: 1–3' })
    expect(screen.queryByRole('textbox')).toBeNull()
    fireEvent.click(document.querySelector('.folha-citacao-fundo')!)
    await waitFor(() => expect(folha).not.toBeInTheDocument())
    expect(screen.queryByRole('textbox')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(campo()).toHaveValue('como TESTE I: 1-3, 5.')
  })

  it('clicar num link segue o link e NÃO abre a edição', async () => {
    montar(await umaNota('veja [[GL-900001|o leão]]'))
    await userEvent.click(within(bloco()).getByRole('link', { name: 'o leão' }))
    expect(await screen.findByText('tela do verbete')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('uma nota nova (sem texto gravado) abre direto no campo', () => {
    montar(null, { autoFoco: true })
    expect(campo()).toHaveFocus()
    expect(screen.queryByRole('group', { name: /^Nota \[1\]/ })).toBeNull()
  })
})

describe('sair do campo volta à leitura', () => {
  it('Esc volta à leitura, grava o rascunho já e não fecha o editor; Esc na leitura fecha', async () => {
    const nota = await umaNota('antes')
    const { aoFechar } = montar(nota, { espera: 60_000 })
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await userEvent.type(campo(), ' e depois')
    await userEvent.keyboard('{Escape}')
    expect(aoFechar).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(bloco()).toHaveTextContent('antes e depois')
    expect(bloco()).toHaveFocus()
    await waitFor(async () => expect((await todosEventos()).some((e) => e.reg === nota.id && e.campos.texto === 'antes e depois')).toBe(true))
    await userEvent.keyboard('{Escape}')
    expect(aoFechar).toHaveBeenCalledOnce()
  })

  it('sair do campo (foco para fora do editor) volta à leitura e grava', async () => {
    const nota = await umaNota('texto de partida')
    montar(nota, { espera: 60_000 })
    render(<button type="button">fora</button>)
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await userEvent.type(campo(), '!')
    await userEvent.click(screen.getByRole('button', { name: 'fora' }))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(bloco()).toHaveTextContent('texto de partida!')
    await waitFor(async () => expect((await todosEventos()).some((e) => e.reg === nota.id && e.campos.texto === 'texto de partida!')).toBe(true))
  })

  it('ir para outro botão do próprio editor (Salvar nota) não tira o campo da frente', async () => {
    const nota = await umaNota('para salvar')
    const { aoSalvar } = montar(nota)
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await userEvent.type(campo(), '!')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nota' }))
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledOnce())
    // o editor que continua na tela (o painel do computador) volta a ler
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(bloco()).toHaveTextContent('para salvar!')
  })

  it('Ctrl+Enter no campo salva e também volta à leitura', async () => {
    const nota = await umaNota('por atalho')
    const { aoSalvar } = montar(nota)
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    await userEvent.type(campo(), '?')
    fireEvent.keyDown(campo(), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledOnce())
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
