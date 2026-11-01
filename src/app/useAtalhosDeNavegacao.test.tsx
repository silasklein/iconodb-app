import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { ATALHOS_DE_IR, useAtalhosDeNavegacao } from './useAtalhosDeNavegacao'

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
