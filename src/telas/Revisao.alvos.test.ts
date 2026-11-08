import css from './Revisao.css?raw'

/**
 * Tarefa 16 (achado na e2e dos pares de sítios): o nome de cada sítio num par aberto da Revisão (que abre a página dele) era um
 * alvo de 22 px de altura, só o texto. Agora tem o alvo do toque (44 px) e, com o mouse (`pointer: fine`), o do mouse.
 */
describe('o nome do sítio num par da Revisão', () => {
  it('tem a altura do alvo, no toque e com o mouse', () => {
    const toque = css.indexOf('\n.revisao-lado-nome {')
    const mouse = css.indexOf('@media (pointer: fine) {\n  .revisao-lado-nome {')
    expect(toque).toBeGreaterThanOrEqual(0)
    expect(mouse).toBeGreaterThanOrEqual(0)
    expect(css.slice(toque).split('}')[0]).toMatch(/display:\s*inline-flex[\s\S]*min-height:\s*var\(--alvo-toque\)/)
    expect(css.slice(mouse).split('}')[0]).toMatch(/min-height:\s*var\(--alvo-mouse\)/)
  })
})
