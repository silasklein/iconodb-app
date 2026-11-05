import type { Ancora, Termo } from '../banco/tipos'
import { chaveDoTermo, chavesDosTermos, formaNoTexto, montarTrechos, verbetesDaAncora, type Peca } from './trechos'

/** Posição em code points (como o pipeline grava) de `trecho` dentro de `texto`. */
function cp(texto: string, trecho: string): { inicio: number; fim: number } {
  const i = texto.indexOf(trecho)
  if (i < 0) throw new Error(`"${trecho}" não está no texto`)
  const inicio = [...texto.slice(0, i)].length
  return { inicio, fim: inicio + [...trecho].length }
}

const termo = (texto: string, trecho: string, glId = 'GL-1'): Termo => ({ glId, ...cp(texto, trecho) })
const ancora = (texto: string, trecho: string, hipoteseId: string, glId = 'GL-1'): Ancora => ({
  hipoteseId,
  glId,
  nivel: 'iconographic',
  modalidade: 'probable',
  ...cp(texto, trecho),
})

/** O texto de uma peça (o que ela desenha). */
const textoDe = (p: Peca): string => (p.tipo === 'ancora' ? p.partes.map((x) => x.texto).join('') : p.texto)

describe('montarTrechos', () => {
  it('Foco 4: com 𓀀 antes do termo, o trecho marcado é exatamente o termo', () => {
    const texto = 'No verso está o sinal 𓀀 ao lado de um leão-de-teste de cauda erguida.'
    const pecas = montarTrechos(texto, { termos: [termo(texto, 'leão-de-teste', 'GL-900001')] })
    const marcado = pecas.find((p) => p.tipo === 'termo')
    expect(marcado).toEqual({ tipo: 'termo', texto: 'leão-de-teste', glId: 'GL-900001' })
    // sem a conversão o trecho sairia deslocado uma posição para a esquerda ("leão-de-test" com o espaço antes)
    expect(pecas.map(textoDe).join('')).toBe(texto)
  })

  it('Foco 4 também nas âncoras: dois 𓀀 antes da âncora', () => {
    const texto = '𓀀𓀀 depois um leão-de-teste.'
    const pecas = montarTrechos(texto, { ancoras: [ancora(texto, 'leão-de-teste', 'HY-1')] })
    expect(pecas.filter((p) => p.tipo === 'ancora').map(textoDe)).toEqual(['leão-de-teste'])
  })

  it('a âncora fica por fora e o termo dentro dela (o termo dentro da âncora não é um link à parte)', () => {
    const texto = 'Um leão-de-teste de cauda erguida aparece.'
    const pecas = montarTrechos(texto, {
      ancoras: [ancora(texto, 'leão-de-teste de cauda erguida', 'HY-1')],
      termos: [termo(texto, 'leão-de-teste')],
    })
    expect(pecas).toEqual([
      { tipo: 'texto', texto: 'Um ' },
      {
        tipo: 'ancora',
        hipoteses: ['HY-1'],
        nivel: 'iconographic',
        modalidade: 'probable',
        partes: [
          { tipo: 'termo', texto: 'leão-de-teste', glId: 'GL-1' },
          { tipo: 'texto', texto: ' de cauda erguida' },
        ],
      },
      { tipo: 'texto', texto: ' aparece.' },
    ])
  })

  it('termo e âncora no mesmo trecho (o caso comum, método "termo"): uma âncora com o termo dentro', () => {
    const texto = 'Um leão-de-teste.'
    const pecas = montarTrechos(texto, { ancoras: [ancora(texto, 'leão-de-teste', 'HY-1')], termos: [termo(texto, 'leão-de-teste')] })
    expect(pecas[1]).toMatchObject({ tipo: 'ancora', hipoteses: ['HY-1'], partes: [{ tipo: 'termo', texto: 'leão-de-teste' }] })
    expect(pecas.filter((p) => p.tipo === 'termo')).toEqual([])
  })

  it('a parte do termo que sai da âncora vira link de termo do lado de fora', () => {
    const texto = 'Uma figura denteada grande.'
    const pecas = montarTrechos(texto, { ancoras: [ancora(texto, 'figura', 'HY-1')], termos: [termo(texto, 'figura denteada')] })
    expect(pecas).toEqual([
      { tipo: 'texto', texto: 'Uma ' },
      expect.objectContaining({ tipo: 'ancora', partes: [{ tipo: 'termo', texto: 'figura', glId: 'GL-1' }] }),
      { tipo: 'termo', texto: ' denteada', glId: 'GL-1' },
      { tipo: 'texto', texto: ' grande.' },
    ])
  })

  it('duas hipóteses no mesmo trecho: uma âncora só, com as duas', () => {
    const texto = 'Um leão-de-teste.'
    const pecas = montarTrechos(texto, { ancoras: [ancora(texto, 'leão-de-teste', 'HY-1'), ancora(texto, 'leão-de-teste', 'HY-2')] })
    expect(pecas.filter((p) => p.tipo === 'ancora')).toEqual([expect.objectContaining({ hipoteses: ['HY-1', 'HY-2'] })])
  })

  it('âncoras que se cruzam viram trechos vizinhos; o do meio abre a que começa antes', () => {
    const texto = 'abcdefghij'
    const pecas = montarTrechos(texto, {
      ancoras: [
        { hipoteseId: 'A', glId: 'g', inicio: 0, fim: 6, nivel: 'iconographic', modalidade: 'asserted' },
        { hipoteseId: 'B', glId: 'g', inicio: 4, fim: 10, nivel: 'iconological', modalidade: 'possible' },
      ],
    })
    expect(pecas.map((p) => [textoDe(p), p.tipo === 'ancora' ? p.hipoteses : null])).toEqual([
      ['abcd', ['A']],
      ['ef', ['A', 'B']],
      ['ghij', ['B']],
    ])
  })

  it('links do texto (citação, número) ficam como peças próprias, em UTF-16', () => {
    const texto = '𓀀 ver Autor 1999 (cf. 2).'
    const i = texto.indexOf('Autor 1999')
    const j = texto.indexOf('2)')
    const pecas = montarTrechos(texto, {
      links: [
        { inicio: i, fim: i + 10, destino: '/obra/BIB-1', rotulo: 'Autor 1999 na bibliografia' },
        { inicio: j, fim: j + 1, destino: '/item/CA00002', rotulo: 'Abrir CA00002' },
      ],
    })
    expect(pecas.filter((p) => p.tipo === 'link')).toEqual([
      { tipo: 'link', texto: 'Autor 1999', destino: '/obra/BIB-1', rotulo: 'Autor 1999 na bibliografia' },
      { tipo: 'link', texto: '2', destino: '/item/CA00002', rotulo: 'Abrir CA00002' },
    ])
    expect(pecas.map(textoDe).join('')).toBe(texto)
  })

  it('trechos vazios, invertidos ou fora do texto são ignorados ou cortados', () => {
    const texto = 'curto'
    const pecas = montarTrechos(texto, {
      termos: [
        { glId: 'x', inicio: 3, fim: 3 },
        { glId: 'y', inicio: 4, fim: 2 },
        { glId: 'z', inicio: 3, fim: 99 },
        { glId: 'w', inicio: 50, fim: 60 },
      ],
    })
    expect(pecas).toEqual([
      { tipo: 'texto', texto: 'cur' },
      { tipo: 'termo', texto: 'to', glId: 'z' },
    ])
  })

  it('o texto inteiro sempre se recompõe, com spans quaisquer', () => {
    const texto = 'α𓀀β 𓀁γ δ𓀂ε ζη θ'
    const n = [...texto].length
    let semente = 7
    const sorteio = () => (semente = (semente * 1103515245 + 12345) % 2147483648) % (n + 1)
    for (let k = 0; k < 200; k++) {
      const spans = Array.from({ length: 4 }, () => [sorteio(), sorteio()].sort((a, b) => a - b) as [number, number])
      const pecas = montarTrechos(texto, {
        termos: spans.slice(0, 2).map(([inicio, fim], i) => ({ glId: `T${i}`, inicio, fim })),
        ancoras: spans.slice(2).map(([inicio, fim], i) => ({ hipoteseId: `H${i}`, glId: 'g', inicio, fim, nivel: 'iconographic', modalidade: 'asserted' })),
      })
      expect(pecas.map(textoDe).join('')).toBe(texto)
      for (const p of pecas) expect(textoDe(p).length).toBeGreaterThan(0)
    }
  })
})

describe('verbetesDaAncora (correção 3)', () => {
  it('cada glId distinto marcado dentro da âncora, na ordem do texto, com o texto marcado', () => {
    const texto = 'Um leão-de-teste sobre figura denteada e outro leão-de-teste.'
    const leitura = {
      texto,
      termos: [termo(texto, 'leão-de-teste', 'GL-1'), termo(texto, 'figura denteada', 'GL-2'), { glId: 'GL-1', ...cp(texto, 'outro leão-de-teste') }],
      ancoras: [ancora(texto, 'leão-de-teste sobre figura denteada e outro leão-de-teste', 'HY-1', 'GL-1'), ancora(texto, 'figura', 'HY-2', 'GL-9')],
    }
    expect(verbetesDaAncora([leitura], 'HY-1')).toEqual([
      { glId: 'GL-1', texto: 'leão-de-teste' },
      { glId: 'GL-2', texto: 'figura denteada' },
    ])
  })

  it('sem termo marcado dentro, usa o glId da própria âncora; hipótese sem âncora dá lista vazia', () => {
    const texto = 'Um sinal.'
    const leitura = { texto, termos: [], ancoras: [ancora(texto, 'sinal', 'HY-1', 'GL-7')] }
    expect(verbetesDaAncora([leitura], 'HY-1')).toEqual([{ glId: 'GL-7', texto: 'sinal' }])
    expect(verbetesDaAncora([leitura], 'HY-X')).toEqual([])
    expect(verbetesDaAncora([{ texto: null, termos: [], ancoras: [] }], 'HY-1')).toEqual([])
  })
})

describe('Tarefa 11: a forma em uso no lugar do termo (só o que se vê)', () => {
  it('chavesDosTermos: cada termo inteiro em UTF-16, com um 𓀀 antes; termo fora do texto ou vazio não entra', () => {
    const texto = '𓀀 ao lado de um leão-de-teste de cauda.'
    const t = termo(texto, 'leão-de-teste', 'GL-1')
    const a = texto.indexOf('leão-de-teste')
    expect([...chavesDosTermos(texto, [t, { glId: 'GL-2', inicio: 5, fim: 5 }])]).toEqual([chaveDoTermo(a, a + 'leão-de-teste'.length, 'GL-1')])
  })

  it('uma peça cortada por uma âncora não é o termo inteiro (nenhuma das duas bate com a chave do termo)', () => {
    const texto = 'Um leão-de-teste de cauda erguida aparece.'
    const chaves = chavesDosTermos(texto, [termo(texto, 'leão-de-teste')])
    const pecas = montarTrechos(texto, { ancoras: [ancora(texto, 'de-teste de cauda', 'HY-1')], termos: [termo(texto, 'leão-de-teste')] })
    let b = 0
    const inteiras: boolean[] = []
    for (const p of pecas) {
      const t = textoDe(p)
      if (p.tipo === 'termo') inteiras.push(chaves.has(chaveDoTermo(b, b + t.length, 'GL-1')))
      if (p.tipo === 'ancora') for (const parte of p.partes) if (parte.tipo === 'termo') inteiras.push(chaves.has(chaveDoTermo(b, b + parte.texto.length, 'GL-1')))
      b += t.length
    }
    expect(inteiras).toEqual([false, false])
  })

  it('formaNoTexto: mantém a maiúscula do começo do texto guardado; o resto fica como a pessoa escreveu', () => {
    expect(formaNoTexto('Selo de teste', 'selo de prova')).toBe('Selo de prova')
    expect(formaNoTexto('selo de teste', 'selo de prova')).toBe('selo de prova')
    expect(formaNoTexto('selo de teste', 'Selo de prova')).toBe('Selo de prova')
    expect(formaNoTexto('Maḥteṣ Teste', 'maḥteṣ do teste')).toBe('Maḥteṣ do teste')
    expect(formaNoTexto('Éden', 'éden novo')).toBe('Éden novo')
    expect(formaNoTexto('1ª fase', 'primeira fase')).toBe('primeira fase')
    expect(formaNoTexto('', 'x')).toBe('x')
  })
})
