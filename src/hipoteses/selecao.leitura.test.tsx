/**
 * Revisão 1 (I7): na Leitura do livro, a seleção vira posições do texto GUARDADO mesmo quando o que aparece numa peça
 * difere do guardado (a Tarefa 11 vai mostrar a forma em uso do usuário no lugar da forma do pacote, dentro dos termos).
 * Cada peça leva `data-b` (e `data-b-fim`, indivisível, nos termos e links), como na leitura SKC.
 */
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { Ancora, Termo } from '../banco/tipos'
import { Leitura } from '../item/Leitura'
import { textoGuardado } from './textosNaTela'
import { intervaloNoBloco, trechoDoIntervalo } from './selecao'

const TEXTO = 'No verso está o sinal 𓀀 ao lado de um leão-de-teste de cauda erguida; talvez uma estrela de prova.'
const cp = (s: string) => [...TEXTO.slice(0, TEXTO.indexOf(s))].length
const TERMO: Termo = { glId: 'GL-900001', inicio: cp('leão'), fim: cp('leão') + 13 }
const ANCORA: Ancora = { hipoteseId: 'HY-900003', glId: 'GL-900008', inicio: cp('estrela'), fim: cp('estrela') + 16, nivel: 'iconographic', modalidade: 'probable' }

function desenhar(props: Partial<Parameters<typeof Leitura>[0]> = {}) {
  return render(
    <MemoryRouter>
      <Leitura fonte="TESTE I: 2" publicacao="TESTE" texto={TEXTO} original="Original." termos={[TERMO]} ancoras={[ANCORA]} trechoId="PA-TESTE-0002-cat-1" {...props} />
    </MemoryRouter>,
  )
}

function intervaloDoTexto(bloco: Element, trecho: string): Range {
  const caminhante = document.createTreeWalker(bloco, NodeFilter.SHOW_TEXT)
  for (let n = caminhante.nextNode() as Text | null; n; n = caminhante.nextNode() as Text | null) {
    const i = n.data.indexOf(trecho)
    if (i < 0) continue
    const r = document.createRange()
    r.setStart(n, i)
    r.setEnd(n, i + trecho.length)
    return r
  }
  throw new Error(`não achado: ${trecho}`)
}

describe('Leitura: posições do texto guardado, não do que aparece', () => {
  it('um termo que aparece com outra forma (mais curta) não desloca o trecho selecionado depois dele', () => {
    const { container } = desenhar()
    const bloco = container.querySelector('[data-trecho-fonte]')!
    // O que a Tarefa 11 fará: a peça do termo mostra a forma em uso do usuário ("leão"), não a do pacote.
    const termo = container.querySelector('a.termo')!
    termo.textContent = 'leão'
    const t = trechoDoIntervalo(intervaloDoTexto(bloco, 'de cauda'))!
    expect(TEXTO.slice(t.inicio, t.fim)).toBe('de cauda')
    // Dentro da âncora (as partes também têm data-b), e depois dela.
    const a = trechoDoIntervalo(intervaloDoTexto(bloco, 'de prova'))!
    expect(TEXTO.slice(a.inicio, a.fim)).toBe('de prova')
  })

  it('uma ponta dentro do termo vai à borda dele (o termo é indivisível)', () => {
    const { container } = desenhar()
    const bloco = container.querySelector('[data-trecho-fonte]')!
    const termo = container.querySelector('a.termo')!.firstChild as Text
    const r = document.createRange()
    r.setStart(termo, 3)
    r.setEnd(intervaloDoTexto(bloco, 'cauda').endContainer, intervaloDoTexto(bloco, 'cauda').endOffset)
    const t = trechoDoIntervalo(r)!
    expect(TEXTO.slice(t.inicio, t.fim)).toBe('leão-de-teste de cauda')
    // E de volta: o intervalo na tela cobre o termo inteiro.
    expect(intervaloNoBloco(bloco as HTMLElement, t.inicio, t.fim)!.toString()).toContain('leão-de-teste de cauda')
  })

  it('o texto guardado de cada leitura à vista fica registrado (para a âncora, sem ler o que aparece)', () => {
    const { unmount } = desenhar()
    expect(textoGuardado('PA-TESTE-0002-cat-1', 'pt')).toBe(TEXTO)
    expect(textoGuardado('PA-TESTE-0002-cat-1', 'de')).toBe('Original.')
    unmount()
    expect(textoGuardado('PA-TESTE-0002-cat-1', 'pt')).toBeNull()
  })
})
