/**
 * A ordem de leitura de uma obra de catálogo (Tarefa 2 do plano «O IPIAO lido no formato do §»): cada introdução (época,
 * grupo, subcoleção) seguida das entradas que ela introduz. Só dados inventados (o modelo TESTE e volumes montados à mão).
 */
import {
  chaveDaEntrada,
  ordemDaObra,
  ordemDoVolume,
  paginaDoLocator,
  partesDoVolume,
  type EntradaParaOrdem,
  type GrupoParaOrdem,
  type PassoDaLeitura,
  type TrechoParaOrdem,
  type VolumeParaOrdem,
} from './ordem'

type Kind = TrechoParaOrdem['kind']
const ABREV: Record<Kind, string> = { running_text: 'txt', period_overview: 'ovw', caption: 'cap' }

/** Um trecho de id `PA-<sigla>-<vol>.S.<p>-<abrev>-<n>`, com o locator `<vol>.S.<p>`. */
function trecho(vol: string, pagina: number, kind: Kind, n = 1, ordinal = pagina * 10 + n, sigla = 'TESTE'): TrechoParaOrdem {
  return { id: `PA-${sigla}-${vol}.S.${pagina}-${ABREV[kind]}-${n}`, kind, pagina, locator: `${vol}.S.${pagina}`, ordinal }
}
function entrada(numero: number, pagina: number, grupo: string | null, sufixo = ''): EntradaParaOrdem {
  return { itemId: `TESTE-${String(numero).padStart(4, '0')}${sufixo}`, numero, sufixo, pagina, grupo }
}
const grupo = (id: string, paiId: string | null, comeco: string | null): GrupoParaOrdem => ({ id, paiId, comeco })
const chaves = (ps: PassoDaLeitura[]) => ps.map((p) => p.chave)
const passo = (ps: PassoDaLeitura[], chave: string) => {
  const p = ps.find((x) => x.chave === chave)
  if (!p) throw new Error(`sem o passo ${chave}`)
  return p
}

/** O modelo TESTE do plano: época (p. 3), grupo 01 (p. 9) com as subcoleções 01-01 e 01-02 (p. 10–11), grupo 02 (p. 19). */
function modeloTeste(): VolumeParaOrdem {
  const t = {
    txt3: trecho('I', 3, 'running_text'),
    ovw9: trecho('I', 9, 'period_overview'),
    cap9: trecho('I', 9, 'caption'),
    ovw10a: trecho('I', 10, 'period_overview', 1),
    ovw10b: trecho('I', 10, 'period_overview', 2),
    ovw11: trecho('I', 11, 'period_overview'),
    ovw19: trecho('I', 19, 'period_overview'),
  }
  return {
    volume: 'I',
    // fora de ordem de propósito: a função ordena
    trechos: [t.ovw19, t.cap9, t.ovw10b, t.txt3, t.ovw11, t.ovw9, t.ovw10a],
    entradas: [
      entrada(4, 20, 'GR-TESTE-I-02'),
      entrada(1, 10, 'GR-TESTE-I-01-01'),
      entrada(2, 11, 'GR-TESTE-I-01-02'),
      entrada(3, 12, 'GR-TESTE-I-01'),
      entrada(6, 22, 'GR-TESTE-I-02'),
      entrada(5, 21, 'GR-TESTE-I-02'),
    ],
    grupos: [
      grupo('GR-TESTE-I-01', null, t.ovw9.id),
      grupo('GR-TESTE-I-01-01', 'GR-TESTE-I-01', t.ovw10a.id),
      grupo('GR-TESTE-I-01-02', 'GR-TESTE-I-01', t.ovw10b.id),
      grupo('GR-TESTE-I-02', null, t.ovw19.id),
    ],
  }
}

describe('paginaDoLocator e chaveDaEntrada', () => {
  it('a página vem do locator «<vol>.S.<p>»; outro formato dá null', () => {
    expect(paginaDoLocator('I.S.58')).toBe(58)
    expect(paginaDoLocator('IV.S.113')).toBe(113)
    expect(paginaDoLocator('0060')).toBeNull()
    expect(paginaDoLocator('§3')).toBeNull()
  })

  it('a chave da entrada é o número com a letra', () => {
    expect(chaveDaEntrada(95, 'a')).toBe('95a')
    expect(chaveDaEntrada(7, '')).toBe('7')
  })
})

describe('ordemDoVolume', () => {
  it('o modelo TESTE: as chaves em ordem, os rótulos e as posições', () => {
    const ps = ordemDoVolume(modeloTeste())
    expect(chaves(ps)).toEqual([
      'PA-TESTE-I.S.3-txt-1',
      'PA-TESTE-I.S.9-ovw-1',
      'PA-TESTE-I.S.10-ovw-1',
      '1',
      'PA-TESTE-I.S.10-ovw-2',
      'PA-TESTE-I.S.11-ovw-1',
      '2',
      '3',
      'PA-TESTE-I.S.19-ovw-1',
      '4',
      '5',
      '6',
    ])
    const textos = ps.filter((p) => p.tipo === 'texto')
    expect(textos.map((p) => p.rotulo)).toEqual(['introducao-geral', 'grupo', 'subcolecao', 'subcolecao', 'subcolecao', 'grupo'])
    expect(textos.map((p) => p.grupo)).toEqual([
      null,
      'GR-TESTE-I-01',
      'GR-TESTE-I-01-01',
      'GR-TESTE-I-01-02',
      'GR-TESTE-I-01-02',
      'GR-TESTE-I-02',
    ])

    const p11 = passo(ps, 'PA-TESTE-I.S.11-ovw-1')
    expect(p11).toMatchObject({ tipo: 'texto', volume: 'I', pagina: 11, posicao: { n: 2, total: 2 } })
    const p10b = passo(ps, 'PA-TESTE-I.S.10-ovw-2')
    expect(p10b).toMatchObject({ pagina: 10, trechos: ['PA-TESTE-I.S.10-ovw-2'], posicao: { n: 1, total: 2 } })
    expect(p10b.tipo === 'texto' && p11.tipo === 'texto' && p10b.bloco === p11.bloco).toBe(true)
    // a legenda da p. 9 fica no passo da p. 9, depois do panorama
    expect(passo(ps, 'PA-TESTE-I.S.9-ovw-1')).toMatchObject({ trechos: ['PA-TESTE-I.S.9-ovw-1', 'PA-TESTE-I.S.9-cap-1'] })

    expect(passo(ps, '1')).toMatchObject({
      tipo: 'entrada',
      volume: 'I',
      itemId: 'TESTE-0001',
      numero: 1,
      sufixo: '',
      grupo: 'GR-TESTE-I-01-01',
      posicao: { n: 1, total: 1 },
    })
    expect(passo(ps, '3')).toMatchObject({ grupo: 'GR-TESTE-I-01', posicao: { n: 1, total: 1 } })
    expect(['4', '5', '6'].map((k) => passo(ps, k).posicao)).toEqual([
      { n: 1, total: 3 },
      { n: 2, total: 3 },
      { n: 3, total: 3 },
    ])
  })

  it('o corte pelo catálogo: a página de entrada entre dois trechos sem começo abre bloco sem grupo («panorama»), e as entradas do grupo anterior vêm ANTES dele', () => {
    const t9 = trecho('I', 9, 'period_overview')
    const v: VolumeParaOrdem = {
      volume: 'I',
      trechos: [trecho('I', 3, 'running_text'), t9, trecho('I', 15, 'period_overview')],
      entradas: [entrada(1, 12, 'GR-TESTE-I-01'), entrada(2, 13, 'GR-TESTE-I-01')],
      grupos: [grupo('GR-TESTE-I-01', null, t9.id)],
    }
    const ps = ordemDoVolume(v)
    expect(chaves(ps)).toEqual(['PA-TESTE-I.S.3-txt-1', 'PA-TESTE-I.S.9-ovw-1', '1', '2', 'PA-TESTE-I.S.15-ovw-1'])
    const p15 = passo(ps, 'PA-TESTE-I.S.15-ovw-1')
    expect(p15).toMatchObject({ tipo: 'texto', grupo: null, rotulo: 'panorama', posicao: { n: 1, total: 1 } })
    const p9 = passo(ps, 'PA-TESTE-I.S.9-ovw-1')
    expect(p15.tipo === 'texto' && p9.tipo === 'texto' && p15.bloco !== p9.bloco).toBe(true)
  })

  it('a página de entrada só corta quando fica estritamente entre as páginas dos dois trechos', () => {
    const t9 = trecho('I', 9, 'period_overview')
    const v: VolumeParaOrdem = {
      volume: 'I',
      trechos: [t9, trecho('I', 10, 'period_overview')],
      entradas: [entrada(1, 9, 'GR-TESTE-I-01'), entrada(2, 10, 'GR-TESTE-I-01')],
      grupos: [grupo('GR-TESTE-I-01', null, t9.id)],
    }
    const ps = ordemDoVolume(v)
    expect(chaves(ps)).toEqual(['PA-TESTE-I.S.9-ovw-1', 'PA-TESTE-I.S.10-ovw-1', '1', '2'])
    expect(passo(ps, 'PA-TESTE-I.S.10-ovw-1')).toMatchObject({ grupo: 'GR-TESTE-I-01', posicao: { n: 2, total: 2 } })
  })

  it('dois grupos com o mesmo começo: o bloco fica com o que tem entradas', () => {
    const t5 = trecho('I', 5, 'period_overview')
    const v: VolumeParaOrdem = {
      volume: 'I',
      trechos: [trecho('I', 3, 'running_text'), t5],
      entradas: [entrada(1, 20, 'GR-TESTE-I-04-01'), entrada(2, 21, 'GR-TESTE-I-04-01')],
      grupos: [grupo('GR-TESTE-I-04', null, t5.id), grupo('GR-TESTE-I-04-01', 'GR-TESTE-I-04', t5.id)],
    }
    const ps = ordemDoVolume(v)
    expect(chaves(ps)).toEqual(['PA-TESTE-I.S.3-txt-1', 'PA-TESTE-I.S.5-ovw-1', '1', '2'])
    expect(passo(ps, 'PA-TESTE-I.S.5-ovw-1')).toMatchObject({ grupo: 'GR-TESTE-I-04-01', rotulo: 'subcolecao' })
  })

  it('dois grupos com o mesmo começo e nenhum com entradas: o bloco fica com o primeiro', () => {
    const t5 = trecho('I', 5, 'period_overview')
    const v: VolumeParaOrdem = {
      volume: 'I',
      trechos: [t5],
      entradas: [],
      grupos: [grupo('GR-TESTE-I-04', null, t5.id), grupo('GR-TESTE-I-04-01', 'GR-TESTE-I-04', t5.id)],
    }
    expect(ordemDoVolume(v)).toMatchObject([{ chave: t5.id, grupo: 'GR-TESTE-I-04', rotulo: 'grupo' }])
  })

  it('grupo de cima sem texto, com subcoleções e uma entrada direto nele: a entrada vem depois do bloco da subcoleção anterior no catálogo, e nenhuma sai da ordem', () => {
    const s1 = trecho('I', 5, 'period_overview')
    const s2 = trecho('I', 7, 'period_overview')
    const v: VolumeParaOrdem = {
      volume: 'I',
      trechos: [trecho('I', 3, 'running_text'), s1, s2],
      entradas: [
        entrada(1, 20, 'GR-TESTE-I-05-01'),
        entrada(2, 21, 'GR-TESTE-I-05'),
        entrada(3, 22, 'GR-TESTE-I-05-02'),
      ],
      grupos: [
        grupo('GR-TESTE-I-05', null, null),
        grupo('GR-TESTE-I-05-01', 'GR-TESTE-I-05', s1.id),
        grupo('GR-TESTE-I-05-02', 'GR-TESTE-I-05', s2.id),
      ],
    }
    const ps = ordemDoVolume(v)
    expect(chaves(ps)).toEqual(['PA-TESTE-I.S.3-txt-1', 'PA-TESTE-I.S.5-ovw-1', '1', '2', 'PA-TESTE-I.S.7-ovw-1', '3'])
    expect(passo(ps, '2')).toMatchObject({ grupo: 'GR-TESTE-I-05', posicao: { n: 1, total: 1 } })
  })

  it('entrada sem grupo: fica no seu lugar no catálogo, sem emitir blocos', () => {
    const t9 = trecho('I', 9, 'period_overview')
    const t19 = trecho('I', 19, 'period_overview')
    const v: VolumeParaOrdem = {
      volume: 'I',
      trechos: [trecho('I', 3, 'running_text'), t9, t19],
      entradas: [entrada(1, 20, 'GR-TESTE-I-01'), entrada(2, 21, null), entrada(3, 22, null), entrada(4, 23, 'GR-TESTE-I-02')],
      grupos: [grupo('GR-TESTE-I-01', null, t9.id), grupo('GR-TESTE-I-02', null, t19.id)],
    }
    const ps = ordemDoVolume(v)
    expect(chaves(ps)).toEqual(['PA-TESTE-I.S.3-txt-1', 'PA-TESTE-I.S.9-ovw-1', '1', '2', '3', 'PA-TESTE-I.S.19-ovw-1', '4'])
    expect(['2', '3'].map((k) => passo(ps, k))).toMatchObject([
      { grupo: null, posicao: { n: 1, total: 2 } },
      { grupo: null, posicao: { n: 2, total: 2 } },
    ])
  })

  it('entrada sem grupo antes de todo bloco: vem primeiro, e os blocos que sobram vêm no fim', () => {
    const v: VolumeParaOrdem = {
      volume: 'I',
      trechos: [trecho('I', 30, 'running_text')],
      entradas: [entrada(1, 10, null)],
      grupos: [],
    }
    expect(chaves(ordemDoVolume(v))).toEqual(['1', 'PA-TESTE-I.S.30-txt-1'])
  })

  it('a legenda: o caption da mesma página fica depois dos period_overview dela', () => {
    const cap = trecho('I', 9, 'caption', 1, 1)
    const ovw1 = trecho('I', 9, 'period_overview', 1, 2)
    const ovw2 = trecho('I', 9, 'period_overview', 2, 3)
    const v: VolumeParaOrdem = { volume: 'I', trechos: [cap, ovw2, ovw1], entradas: [], grupos: [] }
    expect(ordemDoVolume(v)).toMatchObject([
      { tipo: 'texto', chave: ovw1.id, pagina: 9, trechos: [ovw1.id, ovw2.id, cap.id], rotulo: 'panorama' },
    ])
  })

  it('as entradas seguem a ordem (página, número, letra)', () => {
    const v: VolumeParaOrdem = {
      volume: 'I',
      trechos: [],
      entradas: [entrada(95, 30, null, 'b'), entrada(96, 30, null), entrada(95, 30, null, 'a'), entrada(94, 31, null)],
      grupos: [],
    }
    expect(chaves(ordemDoVolume(v))).toEqual(['95a', '95b', '96', '94'])
  })
})

describe('ordemDaObra', () => {
  it('dois volumes: os passos do I antes dos do II, cada um com o seu volume', () => {
    const t2 = trecho('II', 4, 'running_text')
    const ii: VolumeParaOrdem = {
      volume: 'II',
      trechos: [t2],
      entradas: [entrada(1, 8, 'GR-TESTE-II-01')],
      grupos: [grupo('GR-TESTE-II-01', null, t2.id)],
    }
    const ps = ordemDaObra([modeloTeste(), ii])
    expect(ps).toHaveLength(14)
    expect(ps.slice(0, 12).every((p) => p.volume === 'I')).toBe(true)
    expect(ps.slice(12)).toMatchObject([
      { tipo: 'texto', volume: 'II', chave: 'PA-TESTE-II.S.4-txt-1', rotulo: 'grupo', bloco: 0 },
      { tipo: 'entrada', volume: 'II', chave: '1' },
    ])
  })
})

describe('as propriedades, num volume grande', () => {
  /** 3 partes de texto + catálogo; 10 grupos de cima, cada um com 0–2 subcoleções. */
  function volumeGrande(): VolumeParaOrdem {
    const trechos: TrechoParaOrdem[] = []
    const entradas: EntradaParaOrdem[] = []
    const grupos: GrupoParaOrdem[] = []
    let pagina = 1
    let numero = 1
    let g = 0
    for (let parte = 0; parte < 3; parte++) {
      const ini = pagina
      const kindDaParte: Kind = parte === 0 ? 'running_text' : 'period_overview'
      trechos.push(trecho('I', pagina++, kindDaParte), trecho('I', pagina, kindDaParte, 1), trecho('I', pagina++, 'caption'))
      const daParte: { id: string; subs: string[] }[] = []
      const nGrupos = parte === 2 ? 4 : 3
      for (let k = 0; k < nGrupos; k++, g++) {
        const id = `GR-TESTE-I-${String(g + 1).padStart(2, '0')}`
        const semTexto = g % 4 === 3
        const t = trecho('I', pagina, 'period_overview', 1)
        if (!semTexto) trechos.push(t, trecho('I', pagina, 'period_overview', 2))
        pagina++
        grupos.push(grupo(id, null, semTexto ? null : t.id))
        const subs: string[] = []
        for (let s = 0; s < g % 3; s++) {
          const sid = `${id}-${String(s + 1).padStart(2, '0')}`
          const ts = trecho('I', pagina++, 'period_overview')
          trechos.push(ts, trecho('I', pagina++, 'period_overview'))
          grupos.push(grupo(sid, id, ts.id))
          subs.push(sid)
        }
        daParte.push({ id, subs })
      }
      expect(pagina).toBeGreaterThan(ini)
      // o catálogo da parte
      for (const { id, subs } of daParte) {
        for (const alvo of [id, ...subs, id]) {
          for (let e = 0; e < 2; e++) entradas.push(entrada(numero++, pagina, alvo, e === 1 && numero % 5 === 0 ? 'a' : ''))
          pagina++
        }
      }
      entradas.push(entrada(numero++, pagina++, null))
    }
    return { volume: 'I', trechos: [...trechos].reverse(), entradas: [...entradas].reverse(), grupos }
  }

  it('todo trecho aparece exatamente uma vez; toda entrada, uma vez; e os números das entradas não descem', () => {
    const v = volumeGrande()
    expect(v.grupos.filter((x) => x.paiId === null)).toHaveLength(10)
    const ps = ordemDoVolume(v)
    const trechosVistos = ps.flatMap((p) => (p.tipo === 'texto' ? p.trechos : []))
    expect([...trechosVistos].sort()).toEqual(v.trechos.map((t) => t.id).sort())
    expect(new Set(trechosVistos).size).toBe(trechosVistos.length)
    const entradasVistas = ps.flatMap((p) => (p.tipo === 'entrada' ? [p.itemId] : []))
    expect([...entradasVistas].sort()).toEqual(v.entradas.map((e) => e.itemId).sort())
    expect(new Set(entradasVistas).size).toBe(entradasVistas.length)
    const numeros = ps.flatMap((p) => (p.tipo === 'entrada' ? [p.numero] : []))
    for (let i = 1; i < numeros.length; i++) expect(numeros[i]!).toBeGreaterThanOrEqual(numeros[i - 1]!)
    // o volume passa por todos os casos: época, panorama (corte pelo catálogo), grupo, subcoleção, grupo sem texto
    const rotulos = new Set(ps.flatMap((p) => (p.tipo === 'texto' ? [p.rotulo] : [])))
    expect(rotulos).toEqual(new Set(['introducao-geral', 'panorama', 'grupo', 'subcolecao']))
    expect(ps.some((p) => p.tipo === 'entrada' && p.grupo === 'GR-TESTE-I-04')).toBe(true)
    // as chaves são únicas (endereços dos passos)
    expect(new Set(ps.map((p) => p.chave)).size).toBe(ps.length)
    // as posições fecham: em cada bloco, n vai de 1 a total
    const porBloco = new Map<number, { n: number; total: number }[]>()
    for (const p of ps) if (p.tipo === 'texto') porBloco.set(p.bloco, [...(porBloco.get(p.bloco) ?? []), p.posicao])
    for (const pos of porBloco.values()) expect(pos).toEqual(pos.map((_, i) => ({ n: i + 1, total: pos.length })))
  })
})

/**
 * As partes do volume (§ 3, regra 2; plano «Os mapas da introdução pelo mapa do app», Tarefa 1): cada sequência de páginas de
 * texto e a sequência de catálogo que vem depois dela, até o próximo texto. O corte é o mesmo dos blocos: uma página de entrada
 * estritamente entre dois trechos. Uma entrada na mesma página de um trecho (o livro não tem; o modelo TESTE tem) fica na parte
 * desse trecho.
 */
describe('partesDoVolume', () => {
  it('quatro partes como no IPIAO I: texto, catálogo, texto, catálogo…; as legendas de cada parte em ordem', () => {
    const v: VolumeParaOrdem = {
      volume: 'I',
      trechos: [
        trecho('I', 70, 'running_text'),
        trecho('I', 3, 'running_text'),
        trecho('I', 5, 'caption'),
        trecho('I', 6, 'caption'),
        trecho('I', 40, 'period_overview'),
        trecho('I', 41, 'caption'),
      ],
      entradas: [entrada(9, 80, null), entrada(1, 10, null), entrada(2, 11, null), entrada(5, 50, null), entrada(6, 51, null)],
      grupos: [],
    }
    expect(partesDoVolume(v)).toEqual([
      {
        trechos: ['PA-TESTE-I.S.3-txt-1', 'PA-TESTE-I.S.5-cap-1', 'PA-TESTE-I.S.6-cap-1'],
        legendas: ['PA-TESTE-I.S.5-cap-1', 'PA-TESTE-I.S.6-cap-1'],
        entradas: ['TESTE-0001', 'TESTE-0002'],
      },
      { trechos: ['PA-TESTE-I.S.40-ovw-1', 'PA-TESTE-I.S.41-cap-1'], legendas: ['PA-TESTE-I.S.41-cap-1'], entradas: ['TESTE-0005', 'TESTE-0006'] },
      { trechos: ['PA-TESTE-I.S.70-txt-1'], legendas: [], entradas: ['TESTE-0009'] },
    ])
  })

  it('o modelo TESTE: o texto das p. 3–11 (com as entradas das p. 10–12) e o da p. 19 (com as das p. 20–22)', () => {
    const partes = partesDoVolume(modeloTeste())
    expect(partes.map((p) => p.entradas)).toEqual([
      ['TESTE-0001', 'TESTE-0002', 'TESTE-0003'],
      ['TESTE-0004', 'TESTE-0005', 'TESTE-0006'],
    ])
    expect(partes.map((p) => p.legendas)).toEqual([['PA-TESTE-I.S.9-cap-1'], []])
    expect(partes[1]!.trechos).toEqual(['PA-TESTE-I.S.19-ovw-1'])
  })

  it('entradas antes do primeiro texto ficam numa parte sem trechos; um volume sem trechos é uma parte só', () => {
    expect(
      partesDoVolume({ volume: 'I', trechos: [trecho('I', 9, 'caption')], entradas: [entrada(1, 2, null), entrada(2, 12, null)], grupos: [] }),
    ).toEqual([
      { trechos: [], legendas: [], entradas: ['TESTE-0001'] },
      { trechos: ['PA-TESTE-I.S.9-cap-1'], legendas: ['PA-TESTE-I.S.9-cap-1'], entradas: ['TESTE-0002'] },
    ])
    expect(partesDoVolume({ volume: 'I', trechos: [], entradas: [entrada(1, 2, null)], grupos: [] })).toEqual([
      { trechos: [], legendas: [], entradas: ['TESTE-0001'] },
    ])
    expect(partesDoVolume({ volume: 'I', trechos: [], entradas: [], grupos: [] })).toEqual([])
  })

  it('as partes cortam onde os blocos são cortados pelo catálogo', () => {
    const v = modeloTeste()
    const blocosDoCorte = ordemDoVolume(v).flatMap((p) => (p.tipo === 'texto' && p.posicao.n === 1 ? [p.trechos[0]!] : []))
    for (const parte of partesDoVolume(v)) expect(blocosDoCorte).toContain(parte.trechos[0])
  })
})
