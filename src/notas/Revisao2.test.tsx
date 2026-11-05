/** Revisão 2 da Tarefa 6: a leitura mostra a nota de agora (também o que chegou de outro aparelho) e "Editar" parte dela. */
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { renderizarRota, usarFoldDoPacoteSintetico } from '../test/renderizarRota'
import { estadoAtual, registrar } from '../usuario/estado'
import { esquecerPendentes } from '../usuario/pendentes'
import { esquecerAlvos } from './alvos'

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
})

describe('a leitura não fica velha', () => {
  it('chega um `alterar` de outro aparelho: a leitura mostra o texto novo; Editar e digitar partem dele (o texto remoto não é revertido)', async () => {
    instalarMatchMedia(1280)
    await registrar('nota', 'NT-rev00000-7', 'criar', { texto: 'texto original', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: false })
    renderizarRota('/nota/NT-rev00000-7')
    const leitura = await screen.findByRole('group', { name: /^Nota \[/ })
    expect(leitura).toHaveTextContent('texto original')
    await act(async () => {
      await registrar('nota', 'NT-rev00000-7', 'alterar', { texto: 'texto NOVO de outro aparelho' })
    })
    await waitFor(() => expect(screen.getByRole('group', { name: /^Nota \[/ })).toHaveTextContent('texto NOVO de outro aparelho'))
    await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const campo = await screen.findByRole('textbox')
    expect(campo).toHaveValue('texto NOVO de outro aparelho')
    await userEvent.type(campo, '!')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(estadoAtual().registro('nota', 'NT-rev00000-7')?.campos.texto).toBe('texto NOVO de outro aparelho!'))
    expect(within(screen.getByRole('group', { name: /^Nota \[/ })).getByText(/texto NOVO de outro aparelho!/)).toBeInTheDocument()
  })

  it('a mudança remota chega com o editor já na leitura e nenhuma tecla dada: o rascunho não desfaz o remoto ao salvar', async () => {
    instalarMatchMedia(1280)
    await registrar('nota', 'NT-rev00000-8', 'criar', { texto: 'antes', alvoTipo: 'objeto', alvo: 'CA00001', rascunho: true })
    renderizarRota('/nota/NT-rev00000-8')
    await screen.findByRole('group', { name: /^Nota \[/ })
    await act(async () => {
      await registrar('nota', 'NT-rev00000-8', 'alterar', { texto: 'remoto' })
    })
    await waitFor(() => expect(screen.getByRole('group', { name: /^Nota \[/ })).toHaveTextContent('remoto'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nota' }))
    await waitFor(() => expect(estadoAtual().registro('nota', 'NT-rev00000-8')?.campos.rascunho).toBe(false))
    expect(estadoAtual().registro('nota', 'NT-rev00000-8')?.campos.texto).toBe('remoto')
  })
})
