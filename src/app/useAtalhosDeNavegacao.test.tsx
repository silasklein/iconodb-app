import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { ATALHOS_DE_IR, useAtalhosDeLista, useAtalhosDeNavegacao } from './useAtalhosDeNavegacao'

function Sonda() {
  useAtalhosDeNavegacao()
  const { pathname } = useLocation()
  return (
    <>
      <p data-testid="onde">{pathname}</p>
      <input aria-label="campo" />
      <div contentEditable suppressContentEditableWarning aria-label="editavel" />
    </>
  )
}

const abrir = () =>
  render(
    <MemoryRouter initialEntries={['/qualquer']}>
      <Sonda />
    </MemoryRouter>,
  )
const onde = () => screen.getByTestId('onde').textContent

describe('atalhos "g" + letra', () => {
  it('declara a tabela da auditoria', () => {
    expect(ATALHOS_DE_IR).toEqual({
      i: '/',
      c: '/colecoes',
      l: '/glossario',
      s: '/sitios',
      b: '/bibliografia',
      r: '/revisao',
    })
  })

  it.each(Object.entries(ATALHOS_DE_IR))('g %s leva a %s', async (letra, caminho) => {
    abrir()
    await userEvent.keyboard(`g${letra}`)
    expect(onde()).toBe(caminho)
  })

  it('? leva à lista de atalhos e convenções', async () => {
    abrir()
    await userEvent.keyboard('?')
    expect(onde()).toBe('/atalhos')
  })

  it('outra letra depois do g cancela, e a seguinte não vale sozinha', async () => {
    abrir()
    await userEvent.keyboard('gx')
    await userEvent.keyboard('c')
    expect(onde()).toBe('/qualquer')
  })

  it('só o g, sem a segunda tecla a tempo, não faz nada depois', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      abrir()
      await userEvent.keyboard('g')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
      await userEvent.keyboard('c')
      expect(onde()).toBe('/qualquer')
    } finally {
      vi.useRealTimers()
    }
  })

  it('não age ao digitar num campo de texto nem com modificadores', async () => {
    abrir()
    await userEvent.type(screen.getByLabelText('campo'), 'gc?')
    expect(onde()).toBe('/qualquer')
    await userEvent.keyboard('{Control>}g{/Control}c')
    expect(onde()).toBe('/qualquer')
  })

  it('não age enquanto há um diálogo modal aberto (o Menu, por exemplo)', async () => {
    abrir()
    const modal = document.createElement('div')
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')
    document.body.append(modal)
    await userEvent.keyboard('gc')
    await userEvent.keyboard('?')
    expect(onde()).toBe('/qualquer')
    modal.remove()
    await userEvent.keyboard('gc')
    expect(onde()).toBe('/colecoes')
  })
})

describe('J e K percorrem a lista (contexto lista)', () => {
  function Lista() {
    useAtalhosDeLista()
    return (
      <>
        <input aria-label="campo" />
        <a className="lista-linha" href="#/a">
          A
        </a>
        <a className="lista-linha" href="#/b">
          B
        </a>
        <a className="cartao-objeto" href="#/c">
          C
        </a>
      </>
    )
  }
  const mostrar = () =>
    render(
      <MemoryRouter>
        <Lista />
      </MemoryRouter>,
    )
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('J vai ao primeiro, depois ao seguinte; K volta; nas pontas não toma a tecla', async () => {
    mostrar()
    await userEvent.keyboard('j')
    expect(screen.getByRole('link', { name: 'A' })).toHaveFocus()
    await userEvent.keyboard('j')
    expect(screen.getByRole('link', { name: 'B' })).toHaveFocus()
    await userEvent.keyboard('j')
    expect(screen.getByRole('link', { name: 'C' })).toHaveFocus()
    const e = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true })
    document.activeElement!.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
    await userEvent.keyboard('k')
    expect(screen.getByRole('link', { name: 'B' })).toHaveFocus()
  })

  it('K sem nada em foco vai ao último; as setas só valem com um item em foco', async () => {
    mostrar()
    const solta = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    document.body.dispatchEvent(solta)
    expect(solta.defaultPrevented).toBe(false) // a seta rola a página
    await userEvent.keyboard('k')
    expect(screen.getByRole('link', { name: 'C' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('link', { name: 'B' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('link', { name: 'C' })).toHaveFocus()
  })

  it('não age num campo de texto', async () => {
    mostrar()
    await userEvent.type(screen.getByLabelText('campo'), 'jk')
    expect(screen.getByLabelText('campo')).toHaveValue('jk')
    expect(screen.getByLabelText('campo')).toHaveFocus()
  })
})
