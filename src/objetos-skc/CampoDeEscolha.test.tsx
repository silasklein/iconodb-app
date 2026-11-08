/**
 * Parte 2C, bloco 2 (Tarefa 11): o `aviso` no topo da lista (uma linha que não se escolhe) e o recuo de uma opção (`nivel`).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { CampoDeEscolha, type OpcaoDeEscolha } from './CampoDeEscolha'

function Campo({ opcoes, aviso, filtradas }: { opcoes: OpcaoDeEscolha[]; aviso?: (t: string) => string | null; filtradas?: boolean }) {
  const [valor, setValor] = useState('')
  return <CampoDeEscolha rotulo="Com qual sítio?" valor={valor} aoMudarTexto={setValor} opcoes={opcoes} aoEscolher={() => undefined} aviso={aviso} filtradas={filtradas} />
}

describe('CampoDeEscolha: aviso e nivel', () => {
  const opcoes = [
    { id: 'a', rotulo: 'Tell Alfa' },
    { id: 'b', rotulo: 'Área Alfa', nivel: 1 },
  ]
  it('o aviso aparece no topo da lista (status, não opção) com 2 letras ou mais; sem aviso, a linha fica vazia', async () => {
    render(<Campo opcoes={opcoes} aviso={(t) => (t.includes('tumulo') ? 'Túmulo é parte de Tell Alfa.' : null)} />)
    const campo = screen.getByRole('combobox', { name: 'Com qual sítio?' })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    await userEvent.type(campo, 'tumulo')
    expect(screen.getByRole('status')).toHaveTextContent('Túmulo é parte de Tell Alfa.')
    expect(screen.queryAllByRole('option')).toEqual([])
    await userEvent.clear(campo)
    await userEvent.type(campo, 'alfa')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getAllByRole('option').map((o) => o.dataset.nivel ?? null)).toEqual([null, '1'])
  })
  it('sem a função de aviso, não há a linha', () => {
    render(<Campo opcoes={opcoes} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('filtradas (Tarefa 12): as opções vêm como quem chama as filtrou (uma parte que não casa fica sob o todo que casou)', async () => {
    const arvore = [
      { id: 'a', rotulo: 'Tell Alfa' },
      { id: 'c', rotulo: 'Túmulo 1', apoio: 'parte de Tell Alfa', nivel: 1 },
    ]
    const r = render(<Campo opcoes={arvore} filtradas />)
    const campo = screen.getByRole('combobox', { name: 'Com qual sítio?' })
    await userEvent.type(campo, 'a')
    expect(screen.queryAllByRole('option')).toEqual([])
    await userEvent.type(campo, 'lfa beta')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Tell Alfa', 'Túmulo 1parte de Tell Alfa'])
    r.unmount()
    // sem `filtradas`, o campo filtra pelo rótulo e pelo apoio, como sempre
    render(<Campo opcoes={arvore} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Com qual sítio?' }), 'alfa beta')
    expect(screen.queryAllByRole('option')).toEqual([])
  })
})

/**
 * Tarefa 16 (achado na e2e das partes): com a lista aberta, tocar em «Cancelar» logo abaixo do campo. O campo perde o foco no
 * `mousedown` e fechava a lista (e o aviso) na hora: o botão subia antes de o toque terminar e o clique se perdia. Agora, durante
 * um toque, a lista só fecha depois do clique.
 */
describe('CampoDeEscolha: perder o foco no meio de um toque', () => {
  const opcoes = [{ id: 'a', rotulo: 'Tell Alfa' }]
  function ComBotao({ aoCancelar, desabilitado = false }: { aoCancelar: () => void; desabilitado?: boolean }) {
    const [valor, setValor] = useState('')
    return (
      <>
        <CampoDeEscolha rotulo="Com qual sítio?" valor={valor} aoMudarTexto={setValor} opcoes={opcoes} aoEscolher={() => undefined} />
        <button type="button" onClick={aoCancelar}>
          Cancelar
        </button>
        <button type="button" disabled={desabilitado}>
          Marcar como parte
        </button>
      </>
    )
  }
  const lista = () => screen.getByRole('listbox', { hidden: true })

  it('a lista continua até o clique terminar (o botão não sai do lugar), e então fecha; o clique chega ao botão', async () => {
    const aoCancelar = vi.fn()
    render(<ComBotao aoCancelar={aoCancelar} />)
    const campo = screen.getByRole('combobox', { name: 'Com qual sítio?' })
    await userEvent.type(campo, 'alfa')
    expect(lista()).toBeVisible()
    const cancelar = screen.getByRole('button', { name: 'Cancelar' })
    // o que o navegador faz num clique: pointerdown, mousedown (o foco sai do campo), pointerup, mouseup, click
    fireEvent.pointerDown(cancelar)
    fireEvent.mouseDown(cancelar)
    cancelar.focus()
    expect(campo).not.toHaveFocus()
    expect(lista()).toBeVisible()
    fireEvent.pointerUp(cancelar)
    fireEvent.mouseUp(cancelar)
    expect(lista()).toBeVisible()
    fireEvent.click(cancelar)
    expect(aoCancelar).toHaveBeenCalledOnce()
    expect(lista()).not.toBeVisible()
  })

  it('o mesmo pelo userEvent (o clique inteiro): a lista fecha e o botão recebe o clique', async () => {
    const aoCancelar = vi.fn()
    render(<ComBotao aoCancelar={aoCancelar} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Com qual sítio?' }), 'alfa')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(aoCancelar).toHaveBeenCalledOnce()
    expect(lista()).not.toBeVisible()
  })

  it('sem toque (Tab), a lista fecha na hora', async () => {
    render(<ComBotao aoCancelar={() => undefined} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Com qual sítio?' }), 'alfa')
    expect(lista()).toBeVisible()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    expect(lista()).not.toBeVisible()
  })

  it('o toque que devolve o foco ao campo não fecha a lista', async () => {
    render(<ComBotao aoCancelar={() => undefined} />)
    const campo = screen.getByRole('combobox', { name: 'Com qual sítio?' })
    await userEvent.type(campo, 'alfa')
    const cancelar = screen.getByRole('button', { name: 'Cancelar' })
    fireEvent.pointerDown(cancelar)
    cancelar.focus()
    campo.focus()
    fireEvent.click(campo)
    expect(lista()).toBeVisible()
  })

  // Revisão da Tarefa 16 (M1): um gesto que não dá `click` também fecha a lista, e a marca do toque não fica valendo.
  it('num botão desabilitado (pointerdown, o foco sai, pointerup, sem click): a lista fecha logo depois, e o próximo blur sem toque fecha na hora', async () => {
    render(<ComBotao aoCancelar={() => undefined} desabilitado />)
    const campo = screen.getByRole('combobox', { name: 'Com qual sítio?' })
    await userEvent.type(campo, 'alfa')
    const marcar = screen.getByRole('button', { name: 'Marcar como parte' })
    expect(marcar).toBeDisabled()
    // o que o Chromium faz num botão desabilitado: pointerdown, o foco sai do campo, pointerup; nem mousedown nem click
    fireEvent.pointerDown(marcar)
    campo.blur()
    expect(lista()).toBeVisible()
    fireEvent.pointerUp(marcar)
    await waitFor(() => expect(lista()).not.toBeVisible())
    // a marca do toque saiu: um blur sem toque (o foco levado por código) fecha na hora
    await userEvent.clear(campo)
    await userEvent.type(campo, 'alfa')
    expect(lista()).toBeVisible()
    act(() => campo.blur())
    expect(lista()).not.toBeVisible()
  })

  it('o clique direito (contextmenu, sem click) fecha a lista', async () => {
    render(<ComBotao aoCancelar={() => undefined} />)
    const campo = screen.getByRole('combobox', { name: 'Com qual sítio?' })
    await userEvent.type(campo, 'alfa')
    fireEvent.pointerDown(document.body)
    campo.blur()
    expect(lista()).toBeVisible()
    fireEvent.contextMenu(document.body)
    expect(lista()).not.toBeVisible()
  })

  it('o clique do meio (auxclick, sem click) fecha a lista', async () => {
    render(<ComBotao aoCancelar={() => undefined} />)
    const campo = screen.getByRole('combobox', { name: 'Com qual sítio?' })
    await userEvent.type(campo, 'alfa')
    fireEvent.pointerDown(document.body)
    campo.blur()
    expect(lista()).toBeVisible()
    fireEvent(document.body, new MouseEvent('auxclick', { bubbles: true, button: 1 }))
    expect(lista()).not.toBeVisible()
  })

  it('Escape fecha a lista e o foco fica no campo (o teclado continua como antes)', async () => {
    render(<ComBotao aoCancelar={() => undefined} />)
    const campo = screen.getByRole('combobox', { name: 'Com qual sítio?' })
    await userEvent.type(campo, 'alfa')
    expect(lista()).toBeVisible()
    await userEvent.keyboard('{Escape}')
    expect(lista()).not.toBeVisible()
    expect(campo).toHaveFocus()
    expect(campo).toHaveAttribute('aria-expanded', 'false')
  })
})
