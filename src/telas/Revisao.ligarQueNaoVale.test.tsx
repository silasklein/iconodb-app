/**
 * Revisão final do bloco 3 (M1): «Ligar» só passa ao caso seguinte quando a ligação pegou. A busca da Revisão já não oferece
 * a obra dos livros que sai no build seguinte (`useObrasParaLigar`); aqui o filtro é desligado (um aparelho que ainda a
 * mostrava, numa corrida), para provar a guarda de `ligarOCaso`: a gravação volta, o aviso diz por quê, e o caso fica no
 * detalhe. Só o pacote sintético TESTE e citações inventadas.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { chaveDoCaso } from '../revisao/chave'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { estadoAtual, registrar } from '../usuario/estado'
import { Revisao } from './Revisao'

vi.mock('../usuario/useSincronizacao', async () => (await import('../../tests/suporte/syncSimulada')).modulo)
vi.mock('../bibliografia/doUsuario', async (original) => {
  const m = await original<typeof import('../bibliografia/doUsuario')>()
  return { ...m, useObrasParaLigar: () => m.useObrasDaBibliografia() }
})

const INVENTADO_5 = chaveDoCaso({ tipo: 'citacao_nao_resolvida', entidade: 'item', entidadeId: 'TESTE-0004', detalhe: 'campo 7: Inventado 2001: 5' })

function Onde() {
  const { pathname, search } = useLocation()
  return <p data-testid="onde">{pathname + search}</p>
}
const onde = () => new URL(`http://x${screen.getByTestId('onde').textContent}`)
const detalhe = () => screen.getByRole('region', { name: 'O caso escolhido' })

beforeAll(async () => {
  usarMotor(await bancoDeTeste({ escrita: true }))
  instalarMatchMedia(1280)
  await registrar('obra', 'BIB-teste123-1', 'criar', { csl: { type: 'book', title: 'Selos sonhados no planalto fictício' }, curta: 'Imaginária 2010' })
})
afterAll(() => usarMotor(null))

it('«Ligar» a uma obra que sai dos livros não liga, avisa e fica no caso', async () => {
  render(
    <MemoryRouter initialEntries={[`/revisao?${new URLSearchParams({ caso: INVENTADO_5 })}`]}>
      <Routes>
        <Route path="/revisao" element={<Revisao />} />
      </Routes>
      <Onde />
    </MemoryRouter>,
  )
  await userEvent.type(await within(detalhe()).findByRole('searchbox', { name: 'Procurar por autor, ano ou título' }), 'Imaginária')
  await act(() => registrar('obra', 'BIB-teste123-1', 'excluir'))
  const ligar = await within(detalhe()).findByRole('button', { name: /a «Imaginária 2010»$/ })
  await userEvent.click(ligar)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '«Imaginária 2010» sai dos livros no próximo pacote (as obras suas de que ela veio estão excluídas); a citação não foi ligada.',
  )
  // a gravação voltou: nada liga a citação; o caso continua escolhido, sem aviso de «ligada»
  expect(estadoAtual().registro('citacao', 'inventado 2001')?.excluido ?? true).toBe(true)
  expect(onde().searchParams.get('caso')).toBe(INVENTADO_5)
  expect(within(detalhe()).getByRole('heading', { level: 2, name: 'Inventado 2001: 5' })).toBeInTheDocument()
  expect(screen.queryByText(/ligada a «Imaginária 2010»/)).toBeNull()
  await waitFor(() => expect(document.activeElement).toBe(within(detalhe()).getByRole('heading', { level: 2 })))
  await act(() => registrar('obra', 'BIB-teste123-1', 'restaurar'))
})
