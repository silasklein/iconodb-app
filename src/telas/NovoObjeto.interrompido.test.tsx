/**
 * Revisão 3 (Tarefa 9): o salvar do NovoObjeto interrompido DEPOIS do `criar`, pela tela. Uma imagem é guardada e a
 * seguinte trava (a página fecharia aí): o rascunho já tem o id do objeto (`criado`) e só a imagem que falta; ao montar
 * de novo e salvar, nenhum objeto (nem número) novo é criado e a imagem vai ao MESMO objeto.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { numerosDosObjetos } from '../banco/consultas'
import { CHAVE_DOS_CONFIRMADOS, esquecerConfirmados } from '../objetos-skc/confirmados'
import { definirFonteDosNumerosDoPacote, recarregarNumerosDoPacote } from '../objetos-skc/pacote'
import { CHAVE_DO_RASCUNHO, guardarArquivoDoRascunho } from '../objetos-skc/rascunhoDoNovo'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { gravarConfig } from '../usuario/diarioLocal'
import { estadoAtual, registrar } from '../usuario/estado'
import { NovoObjeto } from './NovoObjeto'

const imagens = vi.hoisted(() => ({
  chamadas: [] as { objeto: string; nome: string }[],
  /** Quantas chamadas respondem; as seguintes ficam penduradas para sempre (a página "fechou"). */
  respondem: Infinity,
}))
vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../imagens-usuario/processar', async (original) => ({
  ...(await original<typeof import('../imagens-usuario/processar')>()),
  processarImagem: async (arquivo: File) => (await import('../../tests/suporte/imagensDeTeste')).processadaFalsa({ original: arquivo, nome: arquivo.name }),
}))
vi.mock('../imagens-usuario/operacoes', async (original) => ({
  ...(await original<typeof import('../imagens-usuario/operacoes')>()),
  adicionarImagem: (alvo: { objeto: string }, arquivo: { nome?: string }) => {
    imagens.chamadas.push({ objeto: alvo.objeto, nome: arquivo.nome ?? '' })
    return imagens.chamadas.length <= imagens.respondem ? Promise.resolve(`IM-teste000-${imagens.chamadas.length}`) : new Promise<string>(() => undefined)
  },
}))

function Local() {
  return <output data-testid="local">{useLocation().pathname}</output>
}
const abrir = () =>
  render(
    <MemoryRouter initialEntries={['/objeto/novo']}>
      <Routes>
        <Route path="/objeto/novo" element={<NovoObjeto />} />
        <Route path="/item/:numero" element={<p>tela do objeto</p>} />
      </Routes>
      <Local />
    </MemoryRouter>,
  )
const rascunho = () => JSON.parse(localStorage.getItem(CHAVE_DO_RASCUNHO) ?? 'null') as { criado: string | null; imagens: { chave: string }[] } | null
const objetosVivos = () => [...(estadoAtual().registros.get('objeto')?.values() ?? [])].filter((r) => !r.excluido)

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  Element.prototype.scrollIntoView = vi.fn()
  URL.createObjectURL ??= () => 'blob:previa'
  URL.revokeObjectURL ??= () => undefined
})
afterAll(() => usarMotor(null))
beforeEach(async () => {
  instalarMatchMedia(375)
  localStorage.clear()
  imagens.chamadas = []
  imagens.respondem = Infinity
  definirFonteDosNumerosDoPacote(numerosDosObjetos)
  await recarregarNumerosDoPacote()
  for (const r of objetosVivos()) await registrar('objeto', r.id, 'excluir')
  await gravarConfig(CHAVE_DOS_CONFIRMADOS, undefined)
  esquecerConfirmados()
})
afterEach(() => definirFonteDosNumerosDoPacote(null))

it('a segunda imagem trava depois do criar: o rascunho guarda o id e só a imagem que falta; ao remontar e salvar, nenhum objeto ou número novo, e a imagem vai ao mesmo objeto', async () => {
  // O rascunho, como a tela o deixa: a ficha, o período e duas imagens (os bytes no IndexedDB).
  const comum = { tipo: 'tons', legenda: '', credito: 'Museu de Teste', principal: false }
  localStorage.setItem(
    CHAVE_DO_RASCUNHO,
    JSON.stringify({
      ficha: { titulo: 'Interrompido. Pedra.', periodo: 'CA' },
      naoSei: false,
      imagens: [
        { chave: 'img-a', nome: 'a.jpg', ...comum, principal: true },
        { chave: 'img-b', nome: 'b.jpg', ...comum },
      ],
      criado: null,
      salvoEm: 1,
    }),
  )
  for (const nome of ['a', 'b']) await guardarArquivoDoRascunho(`img-${nome}`, new File([new Uint8Array([1, 2, 3])], `${nome}.jpg`, { type: 'image/jpeg' }))
  const antes = objetosVivos().length
  imagens.respondem = 1

  const primeira = abrir()
  const salvar = (await screen.findAllByRole('button', { name: /Salvar objeto/ }))[0]!
  // Enquanto as imagens se preparam, Salvar só avisa; repete até o salvar começar.
  await waitFor(async () => {
    await userEvent.click(salvar)
    expect(imagens.chamadas.length).toBeGreaterThan(0)
  })

  // 1–2. O criar passou; a imagem a foi guardada; a b trava.
  await waitFor(() => expect(imagens.chamadas).toHaveLength(2))
  const criados = objetosVivos().filter((r) => r.campos.titulo === 'Interrompido. Pedra.')
  expect(criados).toHaveLength(1)
  const id = criados[0]!.id
  expect(imagens.chamadas.map((c) => c.objeto)).toEqual([id, id])
  await waitFor(() => expect(rascunho()).toMatchObject({ criado: id, imagens: [{ chave: 'img-b' }] }))
  const pedido = criados[0]!.campos.pedido
  primeira.unmount()

  // 3. A tela volta (a página foi recarregada): retoma o mesmo objeto.
  imagens.respondem = Infinity
  abrir()
  expect(await screen.findByRole('status', { name: 'Objeto já salvo' })).toHaveTextContent(/Falta 1 imagem/)
  const guardar = await screen.findByRole('button', { name: 'Guardar as imagens' })
  await waitFor(async () => {
    await userEvent.click(guardar)
    expect(screen.getByTestId('local')).toHaveTextContent(`/item/${id}`)
  })

  // 4. Nenhum objeto nem número novo; a imagem que faltava foi ao mesmo id.
  expect(objetosVivos()).toHaveLength(antes + 1)
  expect(objetosVivos().filter((r) => r.campos.titulo === 'Interrompido. Pedra.').map((r) => [r.id, r.campos.pedido])).toEqual([[id, pedido]])
  expect(imagens.chamadas.slice(2).map((c) => c.objeto)).toEqual([id])
  expect(localStorage.getItem(CHAVE_DO_RASCUNHO)).toBeNull()
})
