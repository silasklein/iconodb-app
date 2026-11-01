import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router'
import { IconButton } from './IconButton'
import { temEntradaAnterior, useVoltar } from './useVoltar'

function Tela() {
  const aoVoltar = useVoltar('#/glossario')
  const { pathname, search } = useLocation()
  return (
    <>
      <IconButton icon="voltar" label="Voltar" href="#/glossario" onClick={aoVoltar} />
      <output data-testid="onde" data-tipo={useNavigationType()}>{`${pathname}${search}`}</output>
    </>
  )
}
const onde = () => screen.getByTestId('onde')

afterEach(() => window.history.replaceState(null, ''))

describe('useVoltar', () => {
  it('com entrada anterior volta no histórico (a lista reaparece com o ?filtro=)', async () => {
    render(
      <MemoryRouter initialEntries={['/glossario?filtro=ab', '/verbete/x']} initialIndex={1}>
        <Tela />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('link', { name: 'Voltar' }))
    expect(onde()).toHaveTextContent('/glossario?filtro=ab')
    expect(onde()).toHaveAttribute('data-tipo', 'POP')
  })

  it('sem entrada anterior vai ao href, trocando a entrada', async () => {
    render(
      <MemoryRouter initialEntries={['/verbete/x']}>
        <Tela />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('link', { name: 'Voltar' }))
    expect(onde()).toHaveTextContent('/glossario')
    expect(onde()).toHaveAttribute('data-tipo', 'REPLACE')
  })

  it('o href continua no elemento, e clique com modificador ou do meio fica com o navegador', () => {
    render(
      <MemoryRouter initialEntries={['/glossario', '/verbete/x']} initialIndex={1}>
        <Tela />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Voltar' })
    expect(link).toHaveAttribute('href', '#/glossario')
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true) // não foi cancelado
    expect(fireEvent.click(link, { button: 1 })).toBe(true)
    expect(onde()).toHaveTextContent('/verbete/x')
  })

  describe('temEntradaAnterior', () => {
    it('no navegador vale o idx do React Router', () => {
      window.history.replaceState({ idx: 3, key: 'k' }, '')
      expect(temEntradaAnterior({ key: 'default' })).toBe(true)
      window.history.replaceState({ idx: 0, key: 'default' }, '')
      expect(temEntradaAnterior({ key: 'abc' })).toBe(false)
    })
    it('sem idx vale a chave (a primeira entrada é "default")', () => {
      window.history.replaceState(null, '')
      expect(temEntradaAnterior({ key: 'default' })).toBe(false)
      expect(temEntradaAnterior({ key: 'abc' })).toBe(true)
    })
  })
})
