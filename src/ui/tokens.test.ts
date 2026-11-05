import { describe, expect, it } from 'vitest'
import tokensCss from './tokens.css?raw'

/** O bloco `@media (prefers-reduced-motion: reduce)` do tokens.css, sem os comentários. */
const blocoDeMovimentoReduzido = () => {
  const inicio = tokensCss.indexOf('@media (prefers-reduced-motion: reduce)')
  expect(inicio, 'o bloco de movimento reduzido existe').toBeGreaterThanOrEqual(0)
  const abre = tokensCss.indexOf('{', inicio)
  let fundo = 1
  let i = abre + 1
  for (; i < tokensCss.length && fundo > 0; i++) {
    if (tokensCss[i] === '{') fundo++
    else if (tokensCss[i] === '}') fundo--
  }
  return tokensCss.slice(abre + 1, i - 1).replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('tokens.css, movimento reduzido (auditoria UX-1)', () => {
  it('desliga as transições de vez (transition: none), não só as encurta', () => {
    const bloco = blocoDeMovimentoReduzido()
    expect(bloco).toMatch(/transition:\s*none\s*!important/)
    // uma duração (mesmo 0,01 ms) ainda cria o estado intermediário que as medições logo após uma mudança de estilo leem
    expect(bloco).not.toMatch(/transition-duration/)
  })

  it('vale para todos os elementos e pseudo-elementos', () => {
    expect(blocoDeMovimentoReduzido()).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{/)
  })
})
