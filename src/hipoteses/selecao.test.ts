import { trechoDoIntervalo } from './selecao'

function montar(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body
}

function intervalo(inicio: [Node, number], fim: [Node, number]): Range {
  const r = document.createRange()
  r.setStart(...inicio)
  r.setEnd(...fim)
  return r
}

const textoDe = (el: Element | null) => el!.firstChild as Text

describe('trechoDoIntervalo: a seleção na leitura em posições do texto guardado', () => {
  it('leitura do livro: conta o texto visível, pula o texto só para leitor de tela da âncora', () => {
    montar(
      '<p data-trecho-fonte="PA-TESTE-0001-cat-1" data-trecho-lingua="pt">O pingente mostra um <a class="ancora"><span id="a">leão-de-teste</span><span class="so-leitor">, hipótese: iconográfico</span></a> que caminha <a id="t">sobre</a> uma figura.</p>',
    )
    const p = document.querySelector('p')!
    const depois = p.childNodes[2] as Text // " que caminha "
    const r = intervalo([textoDe(document.getElementById('a')), 5], [depois, 4])
    expect(trechoDoIntervalo(r)).toEqual({ bloco: p, fonte: 'PA-TESTE-0001-cat-1', lingua: 'pt', inicio: 'O pingente mostra um '.length + 5, fim: 'O pingente mostra um leão-de-teste que'.length })
    // Pontas num elemento (índice de filho), como o Safari às vezes dá.
    const r2 = intervalo([p, 0], [p, 1])
    expect(trechoDoIntervalo(r2)).toMatchObject({ inicio: 0, fim: 'O pingente mostra um '.length })
  })

  it('fora de uma leitura, ou atravessando duas, não é trecho; seleção vazia também não', () => {
    montar('<p data-trecho-fonte="PA-1" data-trecho-lingua="pt">um</p><p data-trecho-fonte="PA-2" data-trecho-lingua="pt">dois</p><p id="x">fora</p>')
    const [a, b, c] = [...document.querySelectorAll('p')]
    expect(trechoDoIntervalo(intervalo([a!.firstChild!, 0], [b!.firstChild!, 2]))).toBeNull()
    expect(trechoDoIntervalo(intervalo([c!.firstChild!, 0], [c!.firstChild!, 2]))).toBeNull()
    expect(trechoDoIntervalo(intervalo([a!.firstChild!, 1], [a!.firstChild!, 1]))).toBeNull()
  })

  it('leitura SKC: posições no texto GUARDADO (com os [[…]]); uma ponta dentro de um link vai à borda dele', () => {
    // Texto guardado: "Como [[CA00002|o outro]], um leão." — o link aparece como "o outro".
    montar(
      '<div data-trecho-fonte="OB-aaaaaaaa-1" data-trecho-lingua="skc"><span data-b="0">Como </span><span data-b="5" data-b-fim="24"><a>o outro</a></span><span data-b="24">, um leão.</span></div>',
    )
    const bloco = document.querySelector('div')!
    const [t1, link, t3] = [...bloco.querySelectorAll('span')]
    const leao = intervalo([t3!.firstChild!, 5], [t3!.firstChild!, 9])
    expect(trechoDoIntervalo(leao)).toEqual({ bloco, fonte: 'OB-aaaaaaaa-1', lingua: 'skc', inicio: 29, fim: 33 })
    const comLink = intervalo([t1!.firstChild!, 0], [link!.querySelector('a')!.firstChild!, 3])
    expect(trechoDoIntervalo(comLink)).toMatchObject({ inicio: 0, fim: 24 })
    const doLink = intervalo([link!.querySelector('a')!.firstChild!, 2], [t3!.firstChild!, 1])
    expect(trechoDoIntervalo(doLink)).toMatchObject({ inicio: 5, fim: 25 })
  })
})

describe('intervaloNoBloco: o trecho guardado de volta na tela (para destacá-lo com o formulário aberto)', () => {
  it('leitura do livro: pula o texto só para leitor de tela; volta ao mesmo trecho da seleção', async () => {
    const { intervaloNoBloco } = await import('./selecao')
    montar('<p data-trecho-fonte="PA-1" data-trecho-lingua="pt">O pingente <a class="ancora"><span>leão</span><span class="so-leitor">, hipótese</span></a> caminha.</p>')
    const p = document.querySelector('p')!
    const r = intervaloNoBloco(p, 'O pingente '.length + 2, 'O pingente leão ca'.length)!
    expect(r.toString().replace(', hipótese', '')).toBe('ão ca') // o texto só para leitor de tela fica no meio do DOM
    expect(trechoDoIntervalo(r)).toMatchObject({ inicio: 'O pingente '.length + 2, fim: 'O pingente leão ca'.length })
    expect(intervaloNoBloco(p, 5, 500)).toBeNull()
  })

  it('leitura SKC: posições no texto guardado; um link inteiro entra quando o trecho o cobre', async () => {
    const { intervaloNoBloco } = await import('./selecao')
    montar('<div data-trecho-fonte="OB-aaaaaaaa-1" data-trecho-lingua="skc"><span data-b="0">Como </span><span data-b="5" data-b-fim="24"><a>o outro</a></span><span data-b="24">, um leão.</span></div>')
    const bloco = document.querySelector('div')!
    expect(intervaloNoBloco(bloco, 26, 33)!.toString()).toBe('um leão')
    expect(intervaloNoBloco(bloco, 0, 26)!.toString()).toBe('Como o outro, ')
  })
})
