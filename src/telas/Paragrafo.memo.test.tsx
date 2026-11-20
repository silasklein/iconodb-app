/**
 * Tarefa 6f (revisão da Tarefa 25, 7): o `useMemo` das peças de cada trecho (`TextoNaLingua`) vale: um desenho de novo da
 * página que não muda o texto nem as correções não refaz as peças. Sobre o pacote sintético (TESTEG § 2).
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { ROTA_DO_PARAGRAFO } from '../banco/paragrafos'
import { instalarMatchMedia } from '../test/larguraDeTela'
import { esquecerAbaDoCelular, Paragrafo } from './Paragrafo'
import { esquecerLinguasDaMemoria, pecasDoParagrafo } from './textoDoParagrafo'

vi.mock('../pacote/imagens', () => ({ urlImagem: vi.fn(async (c: string) => `blob:${c}`) }))
vi.mock('./textoDoParagrafo', async (original) => {
  const m = await original<typeof import('./textoDoParagrafo')>()
  return { ...m, pecasDoParagrafo: vi.fn(m.pecasDoParagrafo) }
})

beforeAll(async () => usarMotor(await bancoDeTeste()))
afterAll(() => usarMotor(null))
afterEach(() => {
  localStorage.clear()
  esquecerLinguasDaMemoria()
  esquecerAbaDoCelular()
  instalarMatchMedia(375)
})

it('com «Mostrar o que foi corrigido» ligado, abrir o cartão de uma correção não refaz as peças de nenhum trecho', async () => {
  instalarMatchMedia(1280)
  render(
    <MemoryRouter initialEntries={['/paragrafo/TESTEG/2']}>
      <Routes>
        <Route path={ROTA_DO_PARAGRAFO} element={<Paragrafo />} />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { level: 1, name: 'TESTEG § 2' })
  await userEvent.click(screen.getByRole('button', { name: 'Abrir o Alemão · TESTEG 2021' }))
  const de = screen.getByRole('region', { name: 'Alemão' })
  await userEvent.click(within(de).getByRole('switch', { name: /Mostrar o que foi corrigido/ }))
  const chamadas = vi.mocked(pecasDoParagrafo).mock.calls.length
  // abrir o cartão desenha a página de novo (o estado do cartão é dela); o texto e as correções são os mesmos
  await userEvent.click(within(de).getByRole('button', { name: 'Maḥteṣ' }))
  expect(screen.getByRole('dialog', { name: 'O que foi lido' })).toBeInTheDocument()
  expect(vi.mocked(pecasDoParagrafo).mock.calls.length).toBe(chamadas)
})
