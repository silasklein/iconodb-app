/** Revisão 1 da Tarefa 6: o campo com `[[` (texto selecionado, cursor dentro de um link, Enter) e o aviso de "salvando…". */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { usarTabelaDeFold } from '../busca/fold'
import { usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { esquecerPendentes } from '../usuario/pendentes'
import { EditorDeNota } from './EditorDeNota'

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

const digitar = (t: string) => t.replaceAll('[', '[[')
const campo = () => screen.getByRole('textbox', { name: /^Nota/ }) as HTMLTextAreaElement
function montar(extra: Partial<React.ComponentProps<typeof EditorDeNota>> = {}) {
  return render(
    <MemoryRouter>
      <EditorDeNota alvo={{ tipo: 'objeto', ref: 'CA00001' }} rotulo="Nota [1] · 01/11/2026" espera={30} {...extra} />
    </MemoryRouter>,
  )
}
const selecionar = (de: number, ate: number) => {
  campo().focus()
  campo().setSelectionRange(de, ate)
  fireEvent.select(campo())
}

describe('"Inserir link" com texto selecionado', () => {
  it('mantém o texto selecionado: o [[ entra antes dele e ele vira a busca; escolher troca só o [[texto', async () => {
    montar()
    await userEvent.type(campo(), 'veja leão aqui')
    selecionar(5, 9)
    await userEvent.click(screen.getByRole('button', { name: 'Inserir link para objeto, verbete ou obra' }))
    expect(campo()).toHaveValue('veja [[leão aqui')
    expect(campo()).toHaveFocus()
    expect(campo().selectionStart).toBe(11)
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Enter}')
    expect(campo()).toHaveValue('veja [[GL-900001|leão-de-teste]] aqui')
  })

  it('sem seleção continua pondo [[ no cursor', async () => {
    montar()
    await userEvent.type(campo(), 'cf. ')
    await userEvent.click(screen.getByRole('button', { name: 'Inserir link para objeto, verbete ou obra' }))
    expect(campo()).toHaveValue('cf. [[')
    expect(campo().selectionStart).toBe(6)
  })

  it('o desfazer nativo continua valendo quando o navegador oferece execCommand (a inserção passa por ele)', async () => {
    const exec = vi.fn((_c: string, _u: boolean, valor?: string) => {
      const el = campo()
      el.setRangeText(valor ?? '', el.selectionStart, el.selectionEnd, 'end')
      el.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true, writable: true })
    try {
      montar()
      await userEvent.type(campo(), 'veja leão')
      selecionar(5, 9)
      await userEvent.click(screen.getByRole('button', { name: 'Inserir link para objeto, verbete ou obra' }))
      expect(exec).toHaveBeenCalledWith('insertText', false, '[[')
      expect(campo()).toHaveValue('veja [[leão')
    } finally {
      delete (document as unknown as { execCommand?: unknown }).execCommand
    }
  })
})

describe('o cursor dentro de um link já escrito', () => {
  const texto = 'a [[GL-900001|leão]] b'
  const colocar = (cursor: number) => {
    fireEvent.change(campo(), { target: { value: texto } })
    selecionar(cursor, cursor)
  }

  it('não abre sugestões com o cursor antes do `|` nem depois dele', async () => {
    montar()
    colocar(8)
    await new Promise((r) => setTimeout(r, 400))
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(campo()).toHaveAttribute('aria-expanded', 'false')
    selecionar(16, 16)
    await new Promise((r) => setTimeout(r, 400))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('Enter com o cursor dentro do link quebra a linha, nunca é engolido', async () => {
    montar()
    colocar(8)
    expect(fireEvent.keyDown(campo(), { key: 'Enter' })).toBe(true)
  })

  it('um [[ novo escrito antes de um link continua abrindo a lista', async () => {
    montar()
    // o texto depois do cursor tem outro [[ antes do ]]: é um link novo, não a edição de um velho
    fireEvent.change(campo(), { target: { value: 'x [[lea [[GL-900001|leão]]' } })
    selecionar(7, 7)
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
  })
})

describe('Enter nunca se perde', () => {
  it('com a lista ainda a caminho (nada para escolher), Enter quebra a linha como sempre', async () => {
    montar()
    fireEvent.change(campo(), { target: { value: '[[lea' } })
    selecionar(5, 5)
    // síncrono: a primeira lista ainda não chegou
    expect(fireEvent.keyDown(campo(), { key: 'Enter' })).toBe(true)
  })

  it('com uma opção ativa, Enter escolhe (e a tecla é consumida)', async () => {
    montar()
    await userEvent.type(campo(), digitar('[[lea'))
    await screen.findByRole('listbox')
    expect(fireEvent.keyDown(campo(), { key: 'Enter' })).toBe(false)
    expect(campo()).toHaveValue('[[GL-900001|leão-de-teste]]')
  })
})

describe('o aviso "salvando…" não é anunciado a cada segundo', () => {
  it('só o estado assentado ("rascunho salvo") fica na região que o leitor de tela anuncia', async () => {
    montar()
    await userEvent.type(campo(), 'texto')
    for (const regiao of screen.queryAllByRole('status')) expect(regiao).not.toHaveTextContent('salvando…')
    await waitFor(() => expect(screen.queryAllByRole('status').some((r) => r.textContent === 'rascunho salvo')).toBe(true))
  })
})

describe('as âncoras começam ao abrir o editor', () => {
  it('ancorar() é chamado ao montar, antes de qualquer tecla, e uma vez só', async () => {
    const ancorar = vi.fn(async () => [])
    montar({ ancorar })
    await waitFor(() => expect(ancorar).toHaveBeenCalledTimes(1))
    await userEvent.type(campo(), 'abc')
    await waitFor(() => expect(screen.queryAllByRole('status').some((r) => r.textContent === 'rascunho salvo')).toBe(true))
    expect(ancorar).toHaveBeenCalledTimes(1)
  })
})
