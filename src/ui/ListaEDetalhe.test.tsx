/**
 * Tarefa 6e: a restauração da rolagem dos dois painéis (lista e detalhe) ao voltar (POP). O jsdom não tem layout: a altura
 * do painel do detalhe é simulada.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router'
import { ListaEDetalhe } from './ListaEDetalhe'

let ir: NavigateFunction
let carregar: (v: boolean) => void = () => undefined
let alturaDoDetalhe = 400

function Captura() {
  ir = useNavigate()
  return null
}

/** O detalhe que ainda carrega (aria-busy, como as telas com `useCarregar`) ou já chegou. */
function Detalhe() {
  const [pronto, setPronto] = useState(true)
  carregar = (v) => setPronto(!v)
  return pronto ? <p>o detalhe</p> : <div aria-busy="true" />
}

function abrir() {
  render(
    <MemoryRouter initialEntries={['/a']}>
      <Captura />
      <Routes>
        <Route path="/a" element={<ListaEDetalhe rotulo="Lista" lista={<p>a lista</p>} detalhe={<Detalhe />} />} />
        <Route path="/b" element={<p>outra tela</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const principal = () => document.querySelector('.lista-principal') as HTMLElement

beforeEach(() => {
  sessionStorage.clear()
  alturaDoDetalhe = 400
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => alturaDoDetalhe })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 300 })
})
afterEach(() => {
  delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight
})

describe('ListaEDetalhe: a rolagem do detalhe ao voltar', () => {
  it('Tarefa 6e: enquanto o detalhe carrega (aria-busy), espera além de ~1 s; quando chega, restaura a posição', async () => {
    alturaDoDetalhe = 3000
    abrir()
    principal().scrollTop = 900
    act(() => void principal().dispatchEvent(new Event('scroll')))
    act(() => void ir('/b'))
    expect(screen.getByText('outra tela')).toBeInTheDocument()

    // volta: o detalhe ainda carrega (curto, ocupado) por mais de 1 s
    alturaDoDetalhe = 400
    act(() => void ir(-1))
    act(() => carregar(true))
    principal().scrollTop = 0
    await new Promise((r) => setTimeout(r, 1300))
    expect(principal().scrollTop).toBe(0)

    // chegou: alto o bastante, sem aria-busy
    alturaDoDetalhe = 3000
    act(() => carregar(false))
    await waitFor(() => expect(principal().scrollTop).toBe(900))
  })
})
