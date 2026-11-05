import { descreverAlvo, resolverAlvos, rotaDoAlvo } from '../notas/alvos'
import { filtrarNotas, OPCOES_LIGADA } from '../notas/filtroDeNotas'
import { ehTipoDeAlvo, indiceDeNotas, TIPOS_DE_ALVO } from '../notas/indiceDeNotas'
import { camposIndexaveis } from '../usuario/indice'
import { estadoAtual, registrar } from '../usuario/estado'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { lerTabelaDeFold } from '../busca/fold'
import { partesDoAlvoDoItem, refDoAlvoDoItem } from './notas'

describe('a nota de um item dentro de uma coleção (spec 4.2: "uma nota opcional por item")', () => {
  it('é uma nota comum cujo alvo é "colecao-item" e cuja ref junta a coleção e o objeto', () => {
    expect(TIPOS_DE_ALVO).toContain('colecao-item')
    expect(ehTipoDeAlvo('colecao-item')).toBe(true)
    expect(refDoAlvoDoItem('CO-aaaaaaaa-1', 'ca00023')).toBe('CO-aaaaaaaa-1/CA00023')
    expect(refDoAlvoDoItem('CO-aaaaaaaa-1', 'OB-bbbbbbbb-2')).toBe('CO-aaaaaaaa-1/OB-bbbbbbbb-2')
    expect(partesDoAlvoDoItem('CO-aaaaaaaa-1/CA00023')).toEqual({ colecao: 'CO-aaaaaaaa-1', objeto: 'CA00023' })
    expect(partesDoAlvoDoItem('CA00023')).toBeNull()
    expect(partesDoAlvoDoItem('CO-aaaaaaaa-1/xyz')).toBeNull()
  })

  it('o índice de notas a guarda no alvo dela; excluir a coleção não apaga a nota', async () => {
    await registrar('colecao', 'CO-notaitem-1', 'criar', { nome: 'Íbices em selos', 'm:CA00001': true, 'i:CA00001': 1024 })
    await registrar('nota', 'NT-notaitem-1', 'criar', { texto: 'Falta conferir a escala.', alvoTipo: 'colecao-item', alvo: 'CO-notaitem-1/CA00001', rascunho: false })
    const indice = indiceDeNotas(estadoAtual())
    const ligadas = indice.ligadasA('colecao-item', 'CO-notaitem-1/CA00001')
    expect(ligadas.map((l) => [l.nota.id, l.direta])).toEqual([['NT-notaitem-1', true]])
    expect(indice.ligadasA('objeto', 'CA00001')).toEqual([])
    await registrar('colecao', 'CO-notaitem-1', 'excluir')
    expect(indiceDeNotas(estadoAtual()).ligadasA('colecao-item', 'CO-notaitem-1/CA00001')).toHaveLength(1)
  })

  it('aparece no índice de busca no escopo "coleção", sem ser tomada por nota do objeto', () => {
    const e = camposIndexaveis.nota(estadoAtual().registro('nota', 'NT-notaitem-1')!)!
    expect(e).toMatchObject({ escopo: 'colecao', objeto: null })
    expect(e.texto).toContain('conferir a escala')
  })

  it('a rota leva à coleção e o rótulo diz o objeto e a coleção', async () => {
    expect(rotaDoAlvo('colecao-item', 'CO-notaitem-2/CA00001')).toBe('/grupo/CO-notaitem-2')
    await registrar('colecao', 'CO-notaitem-2', 'criar', { nome: 'Remates' })
    const mapa = await resolverAlvos([{ tipo: 'colecao-item', ref: 'CO-notaitem-2/CA00001' }], estadoAtual())
    const alvo = mapa.get(`colecao-item\u0000CO-notaitem-2/CA00001`)!
    expect(alvo).toMatchObject({ existe: true, rota: '/grupo/CO-notaitem-2' })
    expect(descreverAlvo('colecao-item', 'CO-notaitem-2/CA00001', alvo)).toBe('CA00001 em Remates')
    // coleção desconhecida: sem rota
    const nenhuma = await resolverAlvos([{ tipo: 'colecao-item', ref: 'CO-naoexiste-1/CA00001' }], estadoAtual())
    expect([...nenhuma.values()][0]).toMatchObject({ existe: false, rota: null })
  })

  it('"Ligada a: uma coleção" em Minhas notas acha estas notas', async () => {
    expect(OPCOES_LIGADA.map((o) => o.valor)).toContain('colecao')
    const tabela = lerTabelaDeFold(JSON.parse(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, 'nucleo/fold.json'), 'utf8')))
    const todas = indiceDeNotas(estadoAtual()).todas
    const so = filtrarNotas(todas, { consulta: '', ligada: 'colecao' }, tabela)
    expect(so.map((n) => n.id)).toContain('NT-notaitem-1')
    expect(filtrarNotas(todas, { consulta: '', ligada: 'verbete' }, tabela).map((n) => n.id)).not.toContain('NT-notaitem-1')
  })
})
