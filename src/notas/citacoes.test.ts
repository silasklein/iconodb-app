import { describe, expect, it } from 'vitest'
import {
  analisarComCitacoes,
  chaveDaFonte,
  chavesDoPedaco,
  citacoesDoTexto,
  MAXIMO_DO_INTERVALO,
  obraConhecida,
  OBRAS_PLANEJADAS,
  qualquerObra,
  reconhecerCitacoes,
  textoDoPedaco,
  type PedacoDeCitacao,
} from './citacoes'

/** Um resumo legível dos pedaços: `T"…"` texto, `P"…"` prefixo, `N60`, `N95a`, `NAbb.1`, `I60-62`, `S CA00046`. */
const resumo = (pedacos: readonly PedacoDeCitacao[]): string[] =>
  pedacos.map((p) => {
    switch (p.tipo) {
      case 'texto':
        return `T"${p.texto}"`
      case 'prefixo':
        return `P"${p.texto}"`
      case 'numero':
        return `N${p.abb ? 'Abb.' : ''}${p.numero}${p.sufixo}`
      case 'intervalo':
        return `I${p.de}-${p.ate}`
      case 'sistema':
        return `S ${p.numero}`
    }
  })

const juntar = (pedacos: readonly { tipo: string; texto?: string; bruto?: string }[]) => pedacos.map((p) => ('bruto' in p && p.bruto !== undefined ? p.bruto : p.texto)).join('')

describe('reconhecerCitacoes: a gramática SIGLA[ VOL]: lista (decisão 40)', () => {
  const casos: [string, string[]][] = [
    // o exemplo do usuário, com hífen e com travessão
    ['IPIAO I: 60-62, 64', ['P"IPIAO I: "', 'I60-62', 'T", "', 'N64']],
    ['IPIAO I: 60–62, 64', ['P"IPIAO I: "', 'I60-62', 'T", "', 'N64']],
    ['IPIAO I: 60—62', ['P"IPIAO I: "', 'I60-62']],
    ['IPIAO I: 60 - 62 , 64', ['P"IPIAO I: "', 'I60-62', 'T" , "', 'N64']],
    ['IPIAO I:60,61', ['P"IPIAO I:"', 'N60', 'T","', 'N61']],
    ['IPIAO I : 60', ['P"IPIAO I : "', 'N60']],
    // letra e figura da introdução
    ['IPIAO I: 95a', ['P"IPIAO I: "', 'N95a']],
    ['IPIAO I: Abb. 1, Abb.2', ['P"IPIAO I: "', 'NAbb.1', 'T", "', 'NAbb.2']],
    // obra sem volume, e o SKC
    ['GGG: 40–59, 62, 67', ['P"GGG: "', 'I40-59', 'T", "', 'N62', 'T", "', 'N67']],
    ['GGIG: 3', ['P"GGIG: "', 'N3']],
    ['SKC: 12', ['P"SKC: "', 'N12']],
    // o SKC, Nr. é sempre um número simples (sem letra nem Abb.), como na busca
    ['SKC: 3, Abb. 2', ['P"SKC: "', 'N3', 'T", Abb. 2"']],
    ['SKC: 95a', ['T"SKC: 95a"']],
    ['SKC: 1-3', ['P"SKC: "', 'I1-3']],
    // dentro da prosa
    ['como em IPIAO I: 60.', ['T"como em "', 'P"IPIAO I: "', 'N60', 'T"."']],
    ['(IPIAO II: 7)', ['T"("', 'P"IPIAO II: "', 'N7', 'T")"']],
    ['IPIAO I: 1 · GGG: 2', ['P"IPIAO I: "', 'N1', 'T" · "', 'P"GGG: "', 'N2']],
    // ambiguidade: a lista para onde a prosa volta
    ['IPIAO I: 60, 62 e 64', ['P"IPIAO I: "', 'N60', 'T", "', 'N62', 'T" e 64"']],
    ['IPIAO I: 60. Depois, 61', ['P"IPIAO I: "', 'N60', 'T". Depois, 61"']],
    ['SKC: 1, depois', ['P"SKC: "', 'N1', 'T", depois"']],
    ['SKC: 1,\n2', ['P"SKC: "', 'N1', 'T",\n2"']],
    ['SKC: 1 2', ['P"SKC: "', 'N1', 'T" 2"']],
    // limites: intervalo invertido, igual, longo demais; zero
    ['IPIAO I: 62-60', ['T"IPIAO I: 62-60"']],
    ['IPIAO I: 60-60', ['T"IPIAO I: 60-60"']],
    ['IPIAO I: 64, 62-60, 66', ['P"IPIAO I: "', 'N64', 'T", 62-60, "', 'N66']],
    [`IPIAO I: 1-${MAXIMO_DO_INTERVALO}`, ['P"IPIAO I: "', `I1-${MAXIMO_DO_INTERVALO}`]],
    [`IPIAO I: 1-${MAXIMO_DO_INTERVALO + 1}`, [`T"IPIAO I: 1-${MAXIMO_DO_INTERVALO + 1}"`]],
    ['IPIAO I: 0', ['T"IPIAO I: 0"']],
    ['IPIAO I: 0-3', ['T"IPIAO I: 0-3"']],
    ['IPIAO I: 3-0', ['T"IPIAO I: 3-0"']],
    ['IPIAO I: 060', ['T"IPIAO I: 060"']],
    ['SKC: 5, 0', ['P"SKC: "', 'N5', 'T", 0"']],
    // um intervalo malformado não vira número solto
    ['IPIAO I: 60-62a', ['T"IPIAO I: 60-62a"']],
    ['IPIAO I: 60a-62', ['T"IPIAO I: 60a-62"']],
    ['IPIAO I: 60ab', ['T"IPIAO I: 60ab"']],
    ['IPIAO I: 1234567', ['T"IPIAO I: 1234567"']],
    // sigla: só as conhecidas, inteira, em maiúsculas
    ['XIPIAO I: 60', ['T"XIPIAO I: 60"']],
    ['IPIAO V: 3', ['T"IPIAO V: 3"']],
    ['IPIAO: 3', ['T"IPIAO: 3"']],
    ['ipiao i: 60', ['T"ipiao i: 60"']],
    ['OBS: 3', ['T"OBS: 3"']],
    ['SKC 12', ['T"SKC 12"']],
    ['SKC, Nr. 12', ['T"SKC, Nr. 12"']],
    // números do sistema, com as fronteiras de palavra
    ['ver CA00046.', ['T"ver "', 'S CA00046', 'T"."']],
    ['F100002 e BA00001', ['S F100002', 'T" e "', 'S BA00001']],
    ['xCA00046 CA000461 CA00046a CA00000 ca00046 ZZ00001', ['T"xCA00046 CA000461 CA00046a CA00000 ca00046 ZZ00001"']],
    // dentro de endereço ou de código, nada
    ['veja https://ex.org/CA00046?q=SKC:12 e CA00047', ['T"veja https://ex.org/CA00046?q=SKC:12 e "', 'S CA00047']],
    ['www.ex.org/SKC:1', ['T"www.ex.org/SKC:1"']],
    ['use `SKC: 12` ou SKC: 13', ['T"use `SKC: 12` ou "', 'P"SKC: "', 'N13']],
    // revisão 1 — espaços horizontais Unicode (NBSP, espaço fino) e os traços Unicode
    ['IPIAO\u00a0I:\u00a060\u202f–\u202f62', ['P"IPIAO\u00a0I:\u00a0"', 'I60-62']],
    ['IPIAO I: 60\u00a0,\u202f61', ['P"IPIAO I: "', 'N60', 'T"\u00a0,\u202f"', 'N61']],
    ['SKC:\n12', ['T"SKC:\n12"']],
    ['GGG: 1‐3, 4‑6, 7‒9, 10―12, 13−15', ['P"GGG: "', 'I1-3', 'T", "', 'I4-6', 'T", "', 'I7-9', 'T", "', 'I10-12', 'T", "', 'I13-15']],
    // três números com traços: o intervalo inteiro é inválido (nunca "60–61")
    ['IPIAO I: 60-61-62', ['T"IPIAO I: 60-61-62"']],
    ['IPIAO I: 64, 60-61-62, 66', ['P"IPIAO I: "', 'N64', 'T", 60-61-62, "', 'N66']],
    ['IPIAO I: 60–61—62a', ['T"IPIAO I: 60–61—62a"']],
    // endereço sem esquema, e a barra antes do número do sistema
    ['museu.org/obj/CA00046 e museu.org/x?SKC:1', ['T"museu.org/obj/CA00046 e museu.org/x?SKC:1"']],
    ['ver /obj/CA00046', ['T"ver /obj/CA00046"']],
    // marcas combinantes: "60á" (NFC ou NFD) não é "60a"; nada colado a uma marca
    ['IPIAO I: 60á', ['T"IPIAO I: 60á"']],
    ['IPIAO I: 60a\u0301', ['T"IPIAO I: 60a\u0301"']],
    ['IPIAO I: 60\u0301', ['T"IPIAO I: 60\u0301"']],
    ['CA00046\u0301 e\u0301CA00047', ['T"CA00046\u0301 e\u0301CA00047"']],
    ['e\u0301IPIAO I: 3', ['T"e\u0301IPIAO I: 3"']],
    // revisão 2 — espaço horizontal é tab ou \p{Zs}: separadores de linha/parágrafo, \v, \f e U+FEFF não
    ['SKC:\u202812', ['T"SKC:\u202812"']],
    ['SKC:\u202912', ['T"SKC:\u202912"']],
    ['SKC:\ufeff12', ['T"SKC:\ufeff12"']],
    ['SKC:\v12 SKC:\f12', ['T"SKC:\v12 SKC:\f12"']],
    ['SKC: 1\u2028, 2', ['P"SKC: "', 'N1', 'T"\u2028, 2"']],
    ['SKC:\u3000\u20071', ['P"SKC:\u3000\u2007"', 'N1']],
    // a URL sem esquema precisa de um rótulo final com 2+ letras antes da barra: números e figuras com barra ficam
    ['IPIAO I: Abb.1/2', ['P"IPIAO I: "', 'NAbb.1', 'T"/2"']],
    ['IPIAO I: 1.2/3', ['P"IPIAO I: "', 'N1', 'T".2/3"']],
    ['site.io/CA00046 e a.b.museu.org/x/SKC:1', ['T"site.io/CA00046 e a.b.museu.org/x/SKC:1"']],
  ]
  it.each(casos)('%j', (texto, esperado) => {
    const pedacos = reconhecerCitacoes(texto)
    expect(resumo(pedacos)).toEqual(esperado)
    expect(juntar(pedacos)).toBe(texto)
  })

  it('cada número e cada intervalo guardam a obra; o intervalo guarda o que foi digitado e mostra o travessão curto', () => {
    const [, intervalo, , numero] = reconhecerCitacoes('IPIAO I: 60 - 62, 64')
    expect(intervalo).toEqual({ tipo: 'intervalo', bruto: '60 - 62', obra: 'IPIAO I', de: 60, ate: 62 })
    expect(numero).toEqual({ tipo: 'numero', bruto: '64', obra: 'IPIAO I', numero: 64, sufixo: '', abb: false })
    expect(textoDoPedaco(intervalo!)).toBe('60–62')
    expect(textoDoPedaco(numero!)).toBe('64')
    expect(reconhecerCitacoes('IPIAO  I: 1')[0]).toEqual({ tipo: 'prefixo', texto: 'IPIAO  I: ', obra: 'IPIAO I' })
  })

  it('a lista de obras vem de fora: as abertas no pacote se somam às planejadas (IPIAO I–IV, GGG, GGIG) e ao SKC', () => {
    expect(OBRAS_PLANEJADAS).toEqual(['IPIAO I', 'IPIAO II', 'IPIAO III', 'IPIAO IV', 'GGG', 'GGIG'])
    expect(resumo(reconhecerCitacoes('TESTE I: 1-3, 5'))).toEqual(['T"TESTE I: 1-3, 5"'])
    const comTeste = (obra: string) => obraConhecida(obra) || obra === 'TESTE I'
    expect(resumo(reconhecerCitacoes('TESTE I: 1-3, 5', comTeste))).toEqual(['P"TESTE I: "', 'I1-3', 'T", "', 'N5'])
    expect(resumo(reconhecerCitacoes('OBS: 3', qualquerObra))).toEqual(['P"OBS: "', 'N3'])
  })

  it('propriedade: juntar os pedaços devolve o texto, e todo intervalo é válido e limitado', () => {
    const fichas = ['IPIAO I', 'IPIAO V', 'SKC', 'GGG', 'TESTE I', ':', ': ', ' ', ',', ', ', '-', '–', '—', '‐', '−', '60', '0', '7', '101', 'a', 'Abb.', '.', 'e', 'CA00046', 'F100001', '`', '[[', ']]', '|', '[[GL-1|', 'https://', 'www.', 'museu.org/', '/', 'x', '\n', 'Ç', '\u00a0', '\u202f', '\u0301', 'á', '\u2028', '\ufeff', 'Abb.1/', '1.2/']
    let semente = 20261102
    const aleatorio = () => {
      semente = (semente * 1103515245 + 12345) % 2147483648
      return semente / 2147483648
    }
    for (let i = 0; i < 2000; i++) {
      const n = 1 + Math.floor(aleatorio() * 14)
      let texto = ''
      for (let k = 0; k < n; k++) texto += fichas[Math.floor(aleatorio() * fichas.length)]
      for (const ehObra of [obraConhecida, qualquerObra]) {
        // também com [[…]] aleatórios, pelo analisarComCitacoes
        expect(juntar(analisarComCitacoes(texto, ehObra)), texto).toBe(texto)
        const pedacos = reconhecerCitacoes(texto, ehObra)
        expect(juntar(pedacos), texto).toBe(texto)
        for (const p of pedacos) {
          if (p.tipo === 'intervalo') {
            expect(p.de).toBeGreaterThan(0)
            expect(p.ate).toBeGreaterThan(p.de)
            expect(p.ate - p.de + 1).toBeLessThanOrEqual(MAXIMO_DO_INTERVALO)
          }
          if (p.tipo === 'numero') expect(p.numero).toBeGreaterThan(0)
        }
        // nenhum texto vazio, e nunca dois textos seguidos
        pedacos.forEach((p, j) => {
          if (p.tipo === 'texto') expect(p.texto).not.toBe('')
          if (j > 0) expect(p.tipo === 'texto' && pedacos[j - 1]!.tipo === 'texto').toBe(false)
        })
      }
    }
  })
})

describe('revisão 1: propriedades entre a leitura e o índice', () => {
  const textos = (n: number, semente0: number) => {
    const fichas = ['IPIAO I: ', 'IPIAO III: ', 'SKC: ', 'GGG:', 'OBS: ', 'TESTE I: ', '1', '2-4', '5–9', '60-61-62', ', ', ' e ', '. ', 'CA00046', 'F200003', '[[GL-1|IPIAO I: 1]]', '[[CA00002]]', 'www.x.org/', 'museu.org/obj/', '\u00a0', 'á', 'a\u0301', '\n']
    let semente = semente0
    const out: string[] = []
    for (let i = 0; i < n; i++) {
      let t = ''
      const k = 1 + (i % 12)
      for (let j = 0; j < k; j++) {
        semente = (semente * 1103515245 + 12345) % 2147483648
        t += fichas[semente % fichas.length]
      }
      out.push(t)
    }
    return out
  }
  const chavesDaLeitura = (t: string) =>
    analisarComCitacoes(t, obraConhecida).flatMap((p) => (p.tipo === 'numero' || p.tipo === 'intervalo' ? chavesDoPedaco(p) : []))
  const sistemaDaLeitura = (t: string) => analisarComCitacoes(t, obraConhecida).flatMap((p) => (p.tipo === 'sistema' ? [p.numero] : []))

  it('o que a leitura liga está no índice (as chaves e os números do sistema)', () => {
    for (const t of textos(1500, 7)) {
      const indice = citacoesDoTexto(t)
      for (const c of chavesDaLeitura(t)) expect(indice.fontes, t).toContain(c)
      expect([...new Set(sistemaDaLeitura(t))], t).toEqual(indice.objetos)
    }
  })

  it('NFC e NFD dão as mesmas ligações', () => {
    for (const t of [...textos(800, 99), 'IPIAO I: 60á, 61 e CA00046 é', 'São IPIAO I: 1-3 ação']) {
      const nfc = t.normalize('NFC')
      const nfd = t.normalize('NFD')
      expect(chavesDaLeitura(nfd), t).toEqual(chavesDaLeitura(nfc))
      expect(sistemaDaLeitura(nfd), t).toEqual(sistemaDaLeitura(nfc))
      expect(citacoesDoTexto(nfd), t).toEqual(citacoesDoTexto(nfc))
    }
  })

  it('custo: 100 mil inícios de citação recusados (e um número do sistema no fim) não ficam quadráticos', () => {
    // Cada "AB: " é um início recusado (obra desconhecida, ou com qualquerObra a lista "x" não tem item): o laço avança
    // um caractere. Quadrático, isto leva dezenas de segundos; linear, uma fração de segundo.
    const desconhecida = 'AB: '.repeat(100_000) + ' CA00046'
    const semItem = 'AB: x '.repeat(100_000) + ' CA00046'
    const inicio = performance.now()
    expect(citacoesDoTexto(desconhecida).objetos).toEqual(['CA00046'])
    expect(reconhecerCitacoes(desconhecida).at(-1)).toMatchObject({ tipo: 'sistema' })
    const pedacos = reconhecerCitacoes(semItem, qualquerObra)
    expect(pedacos.map((p) => p.tipo)).toEqual(['texto', 'sistema'])
    expect(performance.now() - inicio).toBeLessThan(2000)
  }, 60_000)
})

describe('analisarComCitacoes: os links [[…]] ficam como estão', () => {
  it('não reconhece nada dentro de [[…]], e reconhece fora', () => {
    const pedacos = analisarComCitacoes('[[GL-1|SKC: 12]] e SKC: 12, [[CA00046]] CA00047')
    expect(pedacos.map((p) => p.tipo)).toEqual(['link', 'texto', 'prefixo', 'numero', 'texto', 'link', 'texto', 'sistema'])
    expect(juntar(pedacos)).toBe('[[GL-1|SKC: 12]] e SKC: 12, [[CA00046]] CA00047')
  })

  it('propriedade: juntar devolve o texto também com links', () => {
    for (const t of ['a [[x|IPIAO I: 1]] IPIAO I: 2-4 [[CA00001]]', '[[', ']] SKC: 1 [[GL-1]]', 'IPIAO I: [[GL-1]] 3']) expect(juntar(analisarComCitacoes(t))).toBe(t)
  })
})

describe('citacoesDoTexto: o que a nota cita, para os links reversos', () => {
  it('cada número coberto, inclusive o meio do intervalo, sem repetir, na ordem; os números do sistema à parte', () => {
    const c = citacoesDoTexto('IPIAO I: 60-62, 64, 61, Abb. 2, 95a e CA00046; SKC: 3 [[CA00047]] [[GL-1|GGG: 5]] CA00046')
    expect(c.fontes).toEqual(['IPIAO I:60', 'IPIAO I:61', 'IPIAO I:62', 'IPIAO I:64', 'IPIAO I:Abb. 2', 'IPIAO I:95a', 'SKC:3'])
    expect(c.objetos).toEqual(['CA00046'])
  })

  it('por padrão aceita qualquer sigla bem formada (a obra de um volume que ainda não chegou já fica no índice)', () => {
    expect(citacoesDoTexto('TESTE I: 1-3, 5').fontes).toEqual(['TESTE I:1', 'TESTE I:2', 'TESTE I:3', 'TESTE I:5'])
  })

  it('a chave da fonte: obra, dois pontos, Abb. e o número com a letra', () => {
    expect(chaveDaFonte('IPIAO I', 60)).toBe('IPIAO I:60')
    expect(chaveDaFonte('IPIAO I', 95, 'a')).toBe('IPIAO I:95a')
    expect(chaveDaFonte('IPIAO I', 1, '', true)).toBe('IPIAO I:Abb. 1')
    // a letra, sempre minúscula, num lugar só
    expect(chaveDaFonte('IPIAO I', 95, 'A')).toBe('IPIAO I:95a')
  })
})
