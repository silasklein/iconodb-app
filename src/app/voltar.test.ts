import { comoVoltar, comVoltar, encurtarRotulo, indiceNoHistorico, lerVoltar, rotuloDoIconeDeVoltar, voltarDaOrigem, voltarPara } from './voltar'
import { estadoDoGrupo } from './origem'
import { estadoDoResultado } from '../busca/url'

describe('lerVoltar: a origem leve no estado do roteador (decisão 85)', () => {
  it('lê rótulo, caminho e a posição no histórico', () => {
    expect(lerVoltar({ voltar: { rotulo: 'Verbete: leão-de-teste', caminho: '/verbete/GL-900001', indice: 3 } })).toEqual({ rotulo: 'Verbete: leão-de-teste', caminho: '/verbete/GL-900001', indice: 3 })
    expect(lerVoltar({ voltar: { rotulo: '  Sítio: Tel Teste ', caminho: '/sitio/TESTE-1?x=1' } })).toEqual({ rotulo: 'Sítio: Tel Teste', caminho: '/sitio/TESTE-1?x=1' })
  })

  it('a posição que não é um inteiro ≥ 0 cai (vale o voltar sem ela)', () => {
    for (const indice of [-1, 1.5, '2', null, Number.NaN]) {
      expect(lerVoltar({ voltar: { rotulo: 'Busca', caminho: '/busca?q=a', indice } })).toEqual({ rotulo: 'Busca', caminho: '/busca?q=a' })
    }
  })

  it('sem estado, sem `voltar` ou com campos ruins: null', () => {
    for (const state of [null, undefined, 'x', 3, {}, { voltar: null }, { voltar: 'Busca' }, { voltar: { rotulo: 'Busca' } }, { voltar: { caminho: '/busca' } }]) {
      expect(lerVoltar(state), JSON.stringify(state)).toBeNull()
    }
    expect(lerVoltar({ voltar: { rotulo: '   ', caminho: '/busca' } })).toBeNull()
    expect(lerVoltar({ voltar: { rotulo: 'x'.repeat(201), caminho: '/busca' } })).toBeNull()
  })

  it('só caminhos do próprio app', () => {
    for (const caminho of ['busca', 'https://outro.site/', '//outro.site/x', '/a b', '/a\\b', '', 7]) {
      expect(lerVoltar({ voltar: { rotulo: 'Busca', caminho } }), String(caminho)).toBeNull()
    }
  })
})

describe('voltarDaOrigem: o «‹ …» do objeto', () => {
  it('a origem leve vale primeiro', () => {
    const estado = { ...estadoDoResultado(['CA00001'], '/busca?q=a'), voltar: { rotulo: 'Busca', caminho: '/busca?q=a', indice: 2 } }
    expect(voltarDaOrigem(estado)).toEqual({ rotulo: 'Busca', caminho: '/busca?q=a', indice: 2 })
  })

  it('a lista da Busca dá «Busca»; a de uma coleção SKC, «Coleção: <nome>»', () => {
    expect(voltarDaOrigem(estadoDoResultado(['CA00001', 'CA00002'], '/busca?q=le%C3%A3o'))).toEqual({ rotulo: 'Busca', caminho: '/busca?q=le%C3%A3o' })
    const colecao = { contexto: { tipo: 'lista', ids: ['CA00001'] }, inicio: 0, total: 1, origem: { rotulo: 'Leões de teste', caminho: '/colecao/CO-1', colecao: true } }
    expect(voltarDaOrigem(colecao)).toEqual({ rotulo: 'Coleção: Leões de teste', caminho: '/colecao/CO-1' })
  })

  it('o grupo e a subcoleção não mudam: sem «‹ …»', () => {
    expect(voltarDaOrigem(estadoDoGrupo('GR-TESTE-I-01', 'Animais', '/grupo/GR-TESTE-I-01'))).toBeNull()
    expect(voltarDaOrigem(estadoDoGrupo('GR-TESTE-I-01-02', 'Figuras', '/grupo/GR-TESTE-I-01-02', true))).toBeNull()
  })

  it('sem origem no app (link guardado, aba nova) ou com um estado de outro tipo: null', () => {
    for (const state of [null, undefined, { ligadoDe: 'CA00001' }, { objetoNovo: { imagensComErro: 0 } }, { contexto: { tipo: 'lista' }, origem: { rotulo: 'Busca', caminho: 'busca' } }]) {
      expect(voltarDaOrigem(state), JSON.stringify(state)).toBeNull()
    }
  })
})

describe('comVoltar', () => {
  const v = { rotulo: 'Notas', caminho: '/notas' }
  it('junta a origem ao estado de antes, sem perder nada', () => {
    const lista = estadoDoResultado(['CA00001'], '/busca?q=a')
    expect(comVoltar(lista, v)).toEqual({ ...lista, voltar: v })
    expect(comVoltar(undefined, v)).toEqual({ voltar: v })
  })
  it('sem origem, o estado fica como veio', () => {
    const grupo = estadoDoGrupo('G', 'T', '/grupo/G')
    expect(comVoltar(grupo, null)).toBe(grupo)
    expect(comVoltar(undefined, null)).toBeUndefined()
  })
})

describe('comoVoltar: no histórico só quando a entrada anterior é a origem', () => {
  it('com a posição: anterior = origem → histórico; senão, o caminho', () => {
    expect(comoVoltar({ rotulo: 'B', caminho: '/b', indice: 4 }, 5, true)).toBe('historico')
    expect(comoVoltar({ rotulo: 'B', caminho: '/b', indice: 4 }, 7, true)).toBe('caminho')
    expect(comoVoltar({ rotulo: 'B', caminho: '/b', indice: 4 }, 4, true)).toBe('caminho')
  })
  it('sem a posição (ou sem a de agora): o voltar de sempre, se há entrada anterior', () => {
    expect(comoVoltar({ rotulo: 'B', caminho: '/b' }, 5, true)).toBe('historico')
    expect(comoVoltar({ rotulo: 'B', caminho: '/b' }, 0, false)).toBe('caminho')
    expect(comoVoltar({ rotulo: 'B', caminho: '/b', indice: 1 }, null, true)).toBe('historico')
    expect(comoVoltar({ rotulo: 'B', caminho: '/b', indice: 1 }, null, false)).toBe('caminho')
  })
})

describe('voltarPara e indiceNoHistorico', () => {
  afterEach(() => window.history.replaceState(null, ''))
  it('a posição vem de history.state.idx (o React Router)', () => {
    window.history.replaceState({ idx: 6, key: 'k', usr: null }, '')
    expect(indiceNoHistorico()).toBe(6)
    expect(voltarPara(' Verbete: x ', '/verbete/GL-1')).toEqual({ rotulo: 'Verbete: x', caminho: '/verbete/GL-1', indice: 6 })
  })
  it('sem idx (MemoryRouter, testes): sem posição', () => {
    window.history.replaceState(null, '')
    expect(indiceNoHistorico()).toBeNull()
    expect(voltarPara('Busca', '/busca?q=a')).toEqual({ rotulo: 'Busca', caminho: '/busca?q=a' })
  })
})

it('o nome do ícone de voltar do celular diz a origem', () => {
  expect(rotuloDoIconeDeVoltar({ rotulo: 'Verbete: leão-de-teste' })).toBe('Voltar (Verbete: leão-de-teste)')
})

describe('encurtarRotulo: um rótulo longo encurta, a origem não some (revisão M1)', () => {
  it('até 120 caracteres fica; passando, corta com «…»', () => {
    expect(encurtarRotulo('Obra: Probe 1992')).toBe('Obra: Probe 1992')
    const longo = `Obra: ${'Título muito longo de uma obra de teste '.repeat(10)}`
    const curto = encurtarRotulo(longo)
    expect([...curto]).toHaveLength(120)
    expect(curto.endsWith('…')).toBe(true)
    expect(lerVoltar({ voltar: voltarPara(longo, '/obra/BIB-1', null) })).toEqual({ rotulo: curto, caminho: '/obra/BIB-1' })
  })
  it('junta os espaços e não parte um par de surrogates', () => {
    expect(encurtarRotulo('  Sítio:\n  Tel   Teste ')).toBe('Sítio: Tel Teste')
    expect(encurtarRotulo('𓀀'.repeat(130), 10)).toBe(`${'𓀀'.repeat(9)}…`)
  })
})
