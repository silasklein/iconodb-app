/**
 * A camada do desenho da região (Tarefa 10), revisão 3, M7: um arrasto de ponto interrompido (`pointercancel`, ou um
 * segundo dedo que pousa no meio) devolve o ponto para onde estava, sem passo no histórico: o "Desfazer" seguinte desfaz
 * UM passo, o de antes do arrasto.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { desfazer, novaEdicao, type Edicao } from './desenhar'
import { DesenhoDeRegiao } from './DesenhoDeRegiao'

let atual: Edicao
function Desenho({ inicial }: { inicial: Edicao }) {
  const [e, setE] = useState(inicial)
  atual = e
  return (
    <>
      <DesenhoDeRegiao edicao={e} aoMudar={setE} giro={0} />
      <button type="button" onClick={() => setE(desfazer)}>
        desfazer
      </button>
    </>
  )
}

/** Um triângulo fechado, com um passo no histórico (o de antes de fechar). */
const triangulo = (): Edicao => ({
  atual: { pontos: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]], fechado: true },
  antes: [{ pontos: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5]], fechado: false }],
})

function montar() {
  render(<Desenho inicial={triangulo()} />)
  const camada = screen.getByTestId('desenho-camada')
  // 200 × 100 na tela, sem giro: (0.5, 0.1) fica em (100, 10).
  Object.defineProperty(camada, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 }) })
  Object.defineProperty(camada, 'offsetWidth', { value: 200 })
  Object.defineProperty(camada, 'offsetHeight', { value: 100 })
  return camada
}
const p = (x: number, y: number, pointerId = 1) => ({ clientX: x, clientY: y, pointerId, button: 0, pointerType: 'touch' })

describe('DesenhoDeRegiao: arrasto interrompido (revisão 3, M7)', () => {
  it('pointercancel no meio do arrasto devolve o ponto e não deixa passo no histórico', () => {
    const camada = montar()
    fireEvent.pointerDown(camada, p(100, 10))
    fireEvent.pointerMove(camada, p(160, 60))
    expect(atual.atual.pontos[1]).toEqual([0.8, 0.6])
    fireEvent.pointerCancel(camada, p(160, 60))
    expect(atual).toEqual(triangulo())
    fireEvent.click(screen.getByRole('button', { name: 'desfazer' }))
    expect(atual).toEqual(novaEdicao(triangulo().antes[0]))
  })

  it('um segundo dedo que pousa no meio do arrasto devolve o ponto (a pinça segue com o palco)', () => {
    const camada = montar()
    fireEvent.pointerDown(camada, p(100, 10))
    fireEvent.pointerMove(camada, p(160, 60))
    fireEvent.pointerDown(camada, p(20, 80, 2))
    expect(atual).toEqual(triangulo())
    // Os dois dedos saem: nada muda, nada entra no histórico.
    fireEvent.pointerUp(camada, p(170, 70))
    fireEvent.pointerUp(camada, p(20, 80, 2))
    expect(atual).toEqual(triangulo())
  })

  it('um arrasto que termina normalmente é UM passo (para comparar)', () => {
    const camada = montar()
    fireEvent.pointerDown(camada, p(100, 10))
    fireEvent.pointerMove(camada, p(160, 60))
    fireEvent.pointerUp(camada, p(160, 60))
    expect(atual.atual.pontos[1]).toEqual([0.8, 0.6])
    expect(atual.antes).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'desfazer' }))
    expect(atual).toEqual(triangulo())
  })
})
