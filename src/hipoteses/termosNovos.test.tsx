/**
 * Decisão 41 nas telas, sobre o pacote sintético: no campo Termo da nova hipótese, "Criar termo «…»" quando o que foi
 * digitado não existe (pelo teclado também), o verbete existente quando a forma é a mesma sem caixa e sem acento, o
 * clique duplo, o "Desfazer" e o formulário que ainda registra quando o glossário dos livros não abre.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { numerosDosObjetos } from '../banco/consultas'
import { lerVerbeteSkc } from '../glossario/modelo'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from '../objetos-skc/pacote'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { Item } from '../telas/Item'
import { todosEventos } from '../usuario/armazem'
import { estadoAtual, registrar } from '../usuario/estado'
import { esquecerListaDeVerbetes } from './CampoDeTermos'
import { lerHipotese } from './modelo'
import { apertarQuandoPronto } from '../test/teclas'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../pacote/imagens', async (original) => ({ ...(await original<typeof import('../pacote/imagens')>()), urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
const falhar = vi.hoisted(() => ({ glossario: false }))
vi.mock('../banco/consultas', async (original) => {
  const m = await original<typeof import('../banco/consultas')>()
  return { ...m, verbetes: vi.fn(async () => (falhar.glossario ? Promise.reject(new Error('sem glossário')) : m.verbetes())) }
})

function abrir(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/item/:numero" element={<Item />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function abrirFormulario() {
  abrir('/item/CA00001')
  await screen.findByRole('heading', { level: 1 })
  await screen.findByRole('button', { name: 'Mostrar o original alemão', hidden: true })
  await apertarQuandoPronto('Shift+H', 'item')
  return screen.findByRole('dialog', { name: 'Nova hipótese' })
}

const vivos = (tipo: 'hipotese' | 'verbete') => [...(estadoAtual().registros.get(tipo)?.values() ?? [])].filter((r) => !r.excluido)
const verbetesSkc = () => vivos('verbete').map(lerVerbeteSkc)
const opcoes = async (form: HTMLElement) => within(await within(form).findByRole('listbox', { name: 'Termo' })).getAllByRole('option').map((o) => o.textContent)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => usarMotor(null))
beforeEach(async () => {
  instalarMatchMedia(375)
  localStorage.clear()
  falhar.glossario = false
  esquecerListaDeVerbetes()
  definirFonteDosNumerosDoPacote(numerosDosObjetos)
  await recarregarNumerosDoPacote()
  for (const tipo of ['hipotese', 'verbete'] as const) for (const r of vivos(tipo)) await registrar(tipo, r.id, 'excluir')
})
afterEach(() => definirFonteDosNumerosDoPacote(null))

describe('Termo: "Criar termo «…»" (decisão 41)', () => {
  it('pelo teclado (↓ e Enter): a forma normalizada vira uma pílula "novo"; Registrar cria o verbete e a hipótese juntos', async () => {
    const form = await abrirFormulario()
    const campo = within(form).getByRole('combobox', { name: 'Termo' })
    await userEvent.type(campo, '  termo-novo   de teste ')
    expect(await opcoes(form)).toEqual(['Criar termo «termo-novo de teste»verbete novo do SKC, a revisar'])
    await userEvent.keyboard('{ArrowDown}')
    const criar = within(form).getByRole('option', { name: /Criar termo «termo-novo de teste»/ })
    expect(criar).toHaveAttribute('aria-selected', 'true')
    expect(campo).toHaveAttribute('aria-activedescendant', criar.id)
    await userEvent.keyboard('{Enter}')
    expect(campo).toHaveValue('')
    expect(within(form).getByRole('button', { name: 'Tirar o termo termo-novo de teste' })).toBeInTheDocument()
    expect(within(within(form).getByRole('list', { name: 'Termos escolhidos' })).getByText('novo')).toBeInTheDocument()
    // nada é gravado antes de registrar
    expect(verbetesSkc()).toEqual([])

    await userEvent.click(within(form).getByRole('button', { name: 'Registrar hipótese' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull())
    const [v] = verbetesSkc()
    expect(v).toMatchObject({ forma: 'termo-novo de teste', status: 'proposed' })
    expect(v!.id).toMatch(/^GL-[a-z0-9]{8}-[1-9][0-9]*$/)
    expect(vivos('hipotese').map((r) => lerHipotese(r).termos)).toEqual([[{ id: v!.id, rotulo: 'termo-novo de teste' }]])
  })

  it('a mesma forma sem caixa e sem acento oferece o verbete que existe (do livro ou do usuário), nunca um repetido', async () => {
    await registrar('verbete', 'GL-ttttttt1-1', 'criar', { forma: 'Árvore-de-Teste', status: 'proposed' })
    const form = await abrirFormulario()
    const campo = within(form).getByRole('combobox', { name: 'Termo' })
    await userEvent.type(campo, 'LEAO-DE-TESTE')
    let lista = await opcoes(form)
    expect(lista[0]).toMatch(/^leão-de-teste/)
    expect(lista.some((o) => o?.startsWith('Criar termo'))).toBe(false)
    await userEvent.clear(campo)
    await userEvent.type(campo, 'arvore-de-teste')
    lista = await opcoes(form)
    expect(lista).toEqual(['Árvore-de-TesteSKC · a revisar'])
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(within(form).getByRole('button', { name: 'Tirar o termo Árvore-de-Teste' })).toBeInTheDocument()
    // já escolhido: nem o existente nem "Criar" de novo
    await userEvent.type(campo, 'Arvore-de-teste')
    expect(within(form).queryByRole('listbox', { name: 'Termo' })).toBeNull()
    await userEvent.clear(campo)
    // dois termos novos com a mesma chave: uma pílula só
    await userEvent.type(campo, 'Coisa Nova')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await userEvent.type(campo, 'coisa   nóva')
    expect(within(form).queryByRole('listbox', { name: 'Termo' })).toBeNull()
    await userEvent.clear(campo)
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar hipótese' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull())
    expect(verbetesSkc().map((v) => v.forma)).toEqual(['Árvore-de-Teste', 'Coisa Nova'])
    expect(lerHipotese(vivos('hipotese')[0]!).termos.map((t) => t.rotulo)).toEqual(['Árvore-de-Teste', 'Coisa Nova'])
  })

  it('"Hipóteses por nível" e o painel mostram o termo novo, e o painel leva à página dele; o agrupamento por nível segue', async () => {
    const form = await abrirFormulario()
    await userEvent.type(within(form).getByRole('combobox', { name: 'Termo' }), 'termo-no-painel')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await userEvent.click(within(form).getByRole('radio', { name: 'iconológico' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar hipótese' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull())
    const [v] = verbetesSkc()
    await userEvent.click(screen.getByRole('button', { name: /Hipóteses por nível/ }))
    const secao = await screen.findByRole('region', { name: 'Hipóteses por nível' })
    const id = vivos('hipotese')[0]!.id
    const linha = secao.querySelector<HTMLElement>(`[data-hipotese-linha="${id}"]`)!
    expect(linha).toHaveTextContent('termo-no-painel')
    expect(linha).toHaveTextContent('SKC')
    // no bloco do nível escolhido, como as outras
    expect(linha.closest('.hipoteses-nivel')!.querySelector('h3')).toHaveTextContent(/^Iconológico$/)
    await userEvent.click(linha)
    const painel = await screen.findByRole('dialog', { name: 'Hipótese termo-no-painel' })
    expect(within(painel).getByRole('link', { name: 'Abrir verbete' })).toHaveAttribute('href', `/verbete/${v!.id}`)
    expect(painel).toHaveTextContent(v!.id)
  })

  it('clique duplo em Registrar: um verbete e uma hipótese', async () => {
    const form = await abrirFormulario()
    await userEvent.type(within(form).getByRole('combobox', { name: 'Termo' }), 'termo-duplo')
    await userEvent.click(await within(form).findByRole('option', { name: /Criar termo «termo-duplo»/ }))
    const botao = within(form).getByRole('button', { name: 'Registrar hipótese' })
    await act(async () => {
      fireEvent.click(botao)
      fireEvent.click(botao)
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull())
    await act(() => new Promise((r) => setTimeout(r, 200)))
    expect(verbetesSkc()).toHaveLength(1)
    expect(vivos('hipotese')).toHaveLength(1)
    expect((await todosEventos()).filter((e) => e.tipo === 'verbete' && e.op === 'criar' && e.reg === verbetesSkc()[0]!.id)).toHaveLength(1)
  })

  it('"Desfazer" depois de registrar tira a hipótese e o termo criado só para ela', async () => {
    const form = await abrirFormulario()
    await userEvent.type(within(form).getByRole('combobox', { name: 'Termo' }), 'termo-desfeito')
    await userEvent.click(await within(form).findByRole('option', { name: /Criar termo «termo-desfeito»/ }))
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar hipótese' }))
    const desfazer = await within(screen.getByRole('status', { name: 'Aviso' })).findByRole('button', { name: 'Desfazer' })
    expect(verbetesSkc()).toHaveLength(1)
    await userEvent.click(desfazer)
    await waitFor(() => expect(vivos('hipotese')).toHaveLength(0))
    expect(verbetesSkc()).toEqual([])
  })

  it('o glossário dos livros não abre: um aviso pequeno em linha, e ainda dá para criar um termo e registrar', async () => {
    falhar.glossario = true
    const form = await abrirFormulario()
    expect(await within(form).findByText('O glossário dos livros não abriu; você ainda pode criar um termo novo.')).toBeInTheDocument()
    const campo = within(form).getByRole('combobox', { name: 'Termo' })
    await userEvent.type(campo, 'termo sem glossário')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar hipótese' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova hipótese' })).toBeNull())
    expect(verbetesSkc().map((v) => v.forma)).toEqual(['termo sem glossário'])
    expect(vivos('hipotese')).toHaveLength(1)
  })
})
