import css from './Sitios.css?raw'

/**
 * Tarefa 16 (achados na e2e do bloco Sítios): três alvos da página do sítio eram menores que o mínimo (44 px no toque, 36 com o
 * mouse): o «Ver» do aviso flutuante («Tel Probe Teste voltou a ser um sítio à parte. Ver», 31 × 36 px), o nome de cada parte na
 * seção «Partes» (22 px de altura: só o texto, numa linha de 44) e o nome de cada sítio em «Mesclado aqui» (o texto, ao lado do
 * «desfazer» de 44). Agora cada um tem o alvo do toque e, com o mouse (`pointer: fine`), o do mouse.
 */
/** O primeiro bloco de `seletor` fora de qualquer @media, e o de dentro de `@media (pointer: fine)`. */
function blocos(seletor: string): { toque: string; mouse: string } {
  const comMouse = css.indexOf(`@media (pointer: fine) {\n  ${seletor} {`)
  expect(comMouse, `@media (pointer: fine) com ${seletor}`).toBeGreaterThanOrEqual(0)
  const toque = css.indexOf(`\n${seletor} {`)
  expect(toque, seletor).toBeGreaterThanOrEqual(0)
  return { toque: css.slice(toque).split('}')[0]!, mouse: css.slice(comMouse).split('}')[0]! }
}

describe('os alvos da página do sítio', () => {
  it('o «Ver» do aviso flutuante: o alvo nas duas direções (largura e altura)', () => {
    const { toque, mouse } = blocos('.sitio-aviso-flutuante a')
    expect(toque).toMatch(/min-width:\s*var\(--alvo-toque\)/)
    expect(toque).toMatch(/min-height:\s*var\(--alvo-toque\)/)
    expect(mouse).toMatch(/min-width:\s*var\(--alvo-mouse\)/)
    expect(mouse).toMatch(/min-height:\s*var\(--alvo-mouse\)/)
  })

  it.each([['.sitio-parte-nome a'], ['.sitio-mesclado a']])('%s: o link tem a altura do alvo (não só a do texto)', (seletor) => {
    const { toque, mouse } = blocos(seletor)
    expect(toque).toMatch(/display:\s*inline-flex/)
    expect(toque).toMatch(/min-height:\s*var\(--alvo-toque\)/)
    expect(mouse).toMatch(/min-height:\s*var\(--alvo-mouse\)/)
  })
})
