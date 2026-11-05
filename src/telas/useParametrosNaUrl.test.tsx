import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { useParametrosNaUrl } from './useParametrosNaUrl'

let navegar: ReturnType<typeof useNavigate>
let definirAgora: ReturnType<typeof useParametrosNaUrl>['definir']

function Tela() {
  const { valores, transitorios, definir } = useParametrosNaUrl(['filtro', 'regioes'], ['foco'])
  definirAgora = definir
  navegar = useNavigate()
  const { pathname, search } = useLocation()
  return (
    <div>
      <output data-testid="valores">{JSON.stringify({ ...valores, foco: transitorios.foco })}</output>
      <output data-testid="url">{`${pathname}${search}`}</output>
    </div>
  )
}

const montar = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/sitios" element={<Tela />} />
        <Route path="/sitio/:id" element={<Tela />} />
      </Routes>
    </MemoryRouter>,
  )
const valores = () => JSON.parse(screen.getByTestId('valores').textContent!) as Record<string, string | undefined>
const url = () => screen.getByTestId('url').textContent

describe('useParametrosNaUrl', () => {
  it('lê os parâmetros do endereço, os persistentes e os transitórios', () => {
    montar('/sitios?filtro=tell&regioes=egito,ira&foco=SI-1')
    expect(valores()).toEqual({ filtro: 'tell', regioes: 'egito,ira', foco: 'SI-1' })
  })

  it('definir muda os valores e o endereço (replace) e apagar tira o parâmetro', () => {
    montar('/sitios')
    act(() => definirAgora({ filtro: 'tell', regioes: 'egito' }))
    expect(valores()).toMatchObject({ regioes: 'egito', filtro: 'tell' })
    expect(url()).toBe('/sitios?filtro=tell&regioes=egito')
    act(() => definirAgora({ regioes: '' }))
    expect(url()).toBe('/sitios?filtro=tell')
    act(() => definirAgora({ foco: 'SI-1' }))
    expect(url()).toBe('/sitios?filtro=tell&foco=SI-1')
    act(() => definirAgora({ foco: null }))
    expect(url()).toBe('/sitios?filtro=tell')
  })

  it('abrir um sítio pela lista devolve os persistentes ao endereço, e o transitório não volta', async () => {
    montar('/sitios?regioes=egito&foco=SI-1')
    act(() => navegar('/sitio/TESTE-1'))
    await waitFor(() => expect(url()).toBe('/sitio/TESTE-1?regioes=egito'))
    expect(valores().regioes).toBe('egito')
    expect(valores().foco).toBeUndefined()
  })

  it('voltar (POP) lê o endereço de novo', async () => {
    montar('/sitios')
    act(() => definirAgora({ regioes: 'ira' }))
    act(() => navegar('/sitio/TESTE-1'))
    await waitFor(() => expect(url()).toBe('/sitio/TESTE-1?regioes=ira'))
    act(() => navegar(-1))
    await waitFor(() => expect(url()).toBe('/sitios?regioes=ira'))
    expect(valores().regioes).toBe('ira')
  })
})
