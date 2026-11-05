/**
 * Revisão 1 da Tarefa 6 (sondas do revisor, agora com asserções): trocar de nota com o editor aberto, trocar o alvo da
 * tela, excluir uma nota recém-criada na tela da nota e o "Desfazer" que falha.
 */
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { todosEventos } from '../usuario/armazem'
import { estadoAtual, registrar } from '../usuario/estado'
import { esquecerPendentes } from '../usuario/pendentes'
import { esquecerAlvos } from './alvos'

const falha = vi.hoisted(() => ({ restaurar: false }))
vi.mock('../usuario/estado', async (original) => {
  const m = await original<typeof import('../usuario/estado')>()
  return { ...m, registrar: ((...a: Parameters<typeof m.registrar>) => (falha.restaurar && a[2] === 'restaurar' ? Promise.reject(new Error('sem espaço')) : m.registrar(...a))) as typeof m.registrar }
})
vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  usarFoldDoPacoteSintetico()
  Element.prototype.scrollIntoView = vi.fn()
})
afterAll(() => usarMotor(null))
beforeEach(() => esquecerAlvos())
afterEach(() => {
  instalarMatchMedia(375)
  esquecerPendentes()
  falha.restaurar = false
})
const criar = (reg: string, campos: Record<string, unknown>) => registrar('nota', reg, 'criar', { rascunho: false, ...campos } as never)
const notasComTexto = (prefixo: string) => [...estadoAtual().registros.get('nota')!.values()].filter((r) => String(r.campos.texto).startsWith(prefixo))

describe('trocar de nota com o editor aberto (computador)', () => {
  it('abrir a nota B enquanto a A está aberta mostra o texto de B e grava em B, nunca em A', async () => {
    instalarMatchMedia(1280)
    await criar('NT-rev00000-1', { texto: 'texto A', alvoTipo: 'objeto', alvo: 'CA00003' })
    await criar('NT-rev00000-2', { texto: 'texto B', alvoTipo: 'objeto', alvo: 'CA00003' })
    renderizarRota('/item/CA00003')
    const linha = within(await screen.findByRole('region', { name: 'Leituras' })).getByRole('group', { name: 'SKC notas' })
    await userEvent.click(await within(linha).findByRole('button', { name: /^Editar a nota 1 de/ }))
    expect(within(linha).getByRole('textbox')).toHaveValue('texto A')
    await userEvent.click(await within(linha).findByRole('button', { name: /^Editar a nota 2 de/ }))
    const campo = within(linha).getByRole('textbox')
    expect(campo).toHaveValue('texto B')
    expect(within(linha).getAllByRole('textbox')).toHaveLength(1)
    expect(document.querySelector('label.editor-nota-rotulo')?.textContent).toMatch(/^Nota \[2\]/)
    await userEvent.type(campo, ' X')
    await userEvent.click(within(linha).getByRole('button', { name: 'Salvar nota' }))
    await waitFor(() => expect(within(linha).queryByRole('textbox')).toBeNull())
    const notas = estadoAtual().registros.get('nota')!
    expect(notas.get('NT-rev00000-1')!.campos.texto).toBe('texto A')
    expect(notas.get('NT-rev00000-2')!.campos.texto).toBe('texto B X')
  })
})

describe('o alvo da tela muda com o editor aberto (computador)', () => {
  it('trocar de verbete fecha o editor, guarda o rascunho no verbete de antes e o campo do novo começa vazio', async () => {
    instalarMatchMedia(1280)
    renderizarRota('/verbete/GL-900001')
    const secao = await screen.findByRole('region', { name: 'Notas SKC' })
    await userEvent.click(within(secao).getByRole('button', { name: 'Escrever nota' }))
    await userEvent.type(await within(secao).findByRole('textbox'), 'rascunho no leão')
    const outro = (await screen.findAllByRole('link')).find((a) => a.getAttribute('href')?.includes('GL-900007'))
    expect(outro).toBeDefined()
    await userEvent.click(outro!)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent(/leão-de-teste/i))
    const secao2 = screen.getByRole('region', { name: 'Notas SKC' })
    expect(within(secao2).queryByRole('textbox')).toBeNull()
    expect(within(secao2).getByRole('button', { name: 'Escrever nota' })).toBeInTheDocument()
    await waitFor(() => expect(notasComTexto('rascunho no leão').map((r) => r.campos.alvo)).toEqual(['GL-900001']))
    // abrir o editor no novo verbete: campo vazio, e o que se escreve vai para o novo verbete
    await userEvent.click(within(secao2).getByRole('button', { name: 'Escrever nota' }))
    const campo = await within(secao2).findByRole('textbox')
    expect(campo).toHaveValue('')
    await userEvent.type(campo, 'nota para o outro')
    await userEvent.click(within(secao2).getByRole('button', { name: 'Salvar nota' }))
    await waitFor(() => expect(notasComTexto('nota para o outro').map((r) => r.campos.alvo)).toEqual(['GL-900007']))
    expect(notasComTexto('rascunho no leão')).toHaveLength(1)
  })
})

describe('excluir uma nota recém-criada na tela da nota (celular)', () => {
  it('mostra "Nota excluída." com Restaurar, tira o campo e nada mais é escrito na nota excluída', async () => {
    instalarMatchMedia(375)
    renderizarRota('/nota/nova?alvoTipo=objeto&alvo=CA00001')
    await userEvent.type(await screen.findByRole('textbox'), 'nota nova a excluir')
    await waitFor(() => expect(screen.getByText('rascunho salvo')).toBeInTheDocument(), { timeout: 4000 })
    await userEvent.click(screen.getByRole('button', { name: 'Excluir nota' }))
    expect(await screen.findByText('Nota excluída.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    const [nota] = notasComTexto('nota nova a excluir')
    expect(nota!.excluido).toBe(true)
    const eventos = (await todosEventos()).filter((e) => e.reg === nota!.id).length
    await new Promise((r) => setTimeout(r, 1300))
    expect((await todosEventos()).filter((e) => e.reg === nota!.id)).toHaveLength(eventos)
    // Restaurar traz a nota e o campo de volta
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar nota' }))
    expect(await screen.findByRole('textbox')).toHaveValue('nota nova a excluir')
    expect(estadoAtual().registro('nota', nota!.id)?.excluido).toBe(false)
  })
})

describe('Desfazer a exclusão (computador)', () => {
  it('se a restauração falha, o aviso diz isso ao lado do botão e o Desfazer continua ali', async () => {
    instalarMatchMedia(1280)
    await criar('NT-rev00000-9', { texto: 'Nota para excluir e desfazer.', alvoTipo: 'verbete', alvo: 'GL-900006' })
    renderizarRota('/verbete/GL-900006')
    const secao = await screen.findByRole('region', { name: 'Notas SKC' })
    await userEvent.click(await within(secao).findByRole('button', { name: /^Editar a nota 1 de/ }))
    await userEvent.click(within(secao).getByRole('button', { name: 'Excluir nota' }))
    await within(secao).findByText('Nota excluída.')
    falha.restaurar = true
    await userEvent.click(within(secao).getByRole('button', { name: 'Desfazer' }))
    expect(await within(secao).findByRole('alert')).toHaveTextContent(/Não foi possível restaurar a nota/)
    expect(within(secao).getByRole('button', { name: 'Desfazer' })).toBeInTheDocument()
    falha.restaurar = false
    await userEvent.click(within(secao).getByRole('button', { name: 'Desfazer' }))
    expect(await within(secao).findByRole('article')).toHaveTextContent('Nota para excluir e desfazer.')
    expect(within(secao).queryByRole('alert')).toBeNull()
  })
})
