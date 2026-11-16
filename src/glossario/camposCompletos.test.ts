/**
 * Parte 2C, bloco 3, Tarefa 12: os campos completos do verbete do usuário (tipo, gênero, número, alemão, inglês, hebraico,
 * árabe, «Outra língua», variantes, termo mais geral, Iconclass e SSSL), com os nomes e as formas que o `user-import` lê
 * (`CAMPOS_DO_VERBETE`, iconodb/usuario_import.py). Dados sintéticos.
 */
import { ev, A, B } from '../../tests/suporte/eventosDeTeste'
import { estadoAtual, registrar } from '../usuario/estado'
import { fundir } from '../usuario/fusao'
import { CAMPOS_COMPLETOS, CAMPOS_VAZIOS, camposParaGravar, formasDaBusca, lerCamposCompletos, lerVerbeteSkc, outrasInteiras, temCamposCompletos } from './modelo'
import { alterarCamposDoVerbete } from './operacoes'

const criar = (ap: string, seq: number, reg: string, forma: string) => ev({ ap, seq, tipo: 'verbete', reg, op: 'criar', campos: { forma, status: 'proposed' } })
const alterar = (ap: string, seq: number, reg: string, campos: Record<string, unknown>, ms?: number) => ev({ ap, seq, ms, tipo: 'verbete', reg, op: 'alterar', campos: campos as never })

describe('o formato dos campos completos (o do user-import)', () => {
  it('os nomes são exatamente os do pipeline', () => {
    expect([...CAMPOS_COMPLETOS]).toEqual(['tipo', 'genero', 'numero', 'de', 'en', 'he', 'ar', 'outras', 'variantes', 'pai', 'iconclass', 'sssl'])
  })

  it('camposParaGravar normaliza: textos NFC e sem espaços a mais, vazio = null, listas sem vazios nem repetidos, lista vazia = null', () => {
    expect(camposParaGravar('GL-aaaaaaaa-1', { de: '  Prüfwort  x ', en: '   ', he: null })).toEqual({ de: 'Prüfwort x', en: null, he: null })
    expect(camposParaGravar('GL-aaaaaaaa-1', { variantes: [' Testform ', '', 'Testform', 'Probeform'], iconclass: [], sssl: ['  '] })).toEqual({
      variantes: ['Testform', 'Probeform'],
      iconclass: null,
      sssl: null,
    })
    expect(camposParaGravar('GL-aaaaaaaa-1', { tipo: 'name', genero: 'f', numero: 'pl', pai: 'GL-900001' })).toEqual({ tipo: 'name', genero: 'f', numero: 'pl', pai: 'GL-900001' })
    expect(camposParaGravar('GL-aaaaaaaa-1', { tipo: null, pai: 'GL-bbbbbbbb-3' })).toEqual({ tipo: null, pai: 'GL-bbbbbbbb-3' })
  })

  it('«Outra língua»: [{lingua, forma}], a linha pela metade fica, a vazia e a repetida saem', () => {
    expect(
      camposParaGravar('GL-aaaaaaaa-1', {
        outras: [
          { lingua: ' francês ', forma: 'mot  d’essai' },
          { lingua: '', forma: '' },
          { lingua: 'francês', forma: 'mot d’essai' },
          { lingua: 'siríaco', forma: '' },
        ],
      }),
    ).toEqual({ outras: [{ lingua: 'francês', forma: 'mot d’essai' }, { lingua: 'siríaco', forma: '' }] })
    expect(camposParaGravar('GL-aaaaaaaa-1', { outras: [{ lingua: '  ', forma: '' }] })).toEqual({ outras: null })
  })

  it('um valor fora do formato é erro (nada é gravado)', () => {
    for (const ruim of [{ tipo: 'pessoa' }, { genero: 'n' }, { numero: 'du' }, { pai: 'leão' }, { pai: 'GL-aaaaaaaa-1' }, { de: 5 }, { variantes: 'x' }, { outras: 'x' }, {}, { forma: 'x' },
      // uma lista com um item fora do formato é recusada inteira (não limpa o campo em silêncio)
      { variantes: ['ok', 5] }, { iconclass: [null] }, { sssl: [['x']] }, { outras: ['x'] }, { outras: [{ lingua: 3 }] }, { outras: [null] }, { outras: [{ lingua: 'a', forma: 'b', extra: 1 }] }]) {
      expect(() => camposParaGravar('GL-aaaaaaaa-1', ruim as never), JSON.stringify(ruim)).toThrow()
    }
  })

  it('a leitura tem folga: o que não está no formato fica vazio; o pai do livro ou do usuário vale', () => {
    expect(lerCamposCompletos({})).toEqual(CAMPOS_VAZIOS)
    const lido = lerCamposCompletos({
      tipo: 'pessoa',
      genero: 'm',
      numero: 7,
      de: '  ',
      en: 'test word',
      he: 'מִלָּה',
      ar: 'كَلِمَة',
      outras: [{ lingua: 'francês', forma: 'mot' }, 'x', { lingua: 3, forma: 'y' }, { lingua: 'grego' }],
      variantes: ['A', 5, 'A', 'B'],
      pai: 'qualquer',
      iconclass: 'não é lista',
      sssl: ['S1'],
    })
    expect(lido).toEqual({
      tipo: null,
      genero: 'm',
      numero: null,
      de: null,
      en: 'test word',
      he: 'מִלָּה',
      ar: 'كَلِمَة',
      outras: [{ lingua: 'francês', forma: 'mot' }, { lingua: 'grego', forma: '' }],
      variantes: ['A', 'B'],
      pai: null,
      iconclass: [],
      sssl: ['S1'],
    })
    expect(outrasInteiras(lido.outras)).toEqual([{ lingua: 'francês', forma: 'mot' }])
    expect(formasDaBusca(lido)).toEqual(['test word', 'מִלָּה', 'كَلِمَة', 'mot', 'A', 'B'])
    expect(temCamposCompletos(lido)).toBe(true)
    expect(temCamposCompletos(CAMPOS_VAZIOS)).toBe(false)
    expect(lerCamposCompletos({ pai: 'GL-aaaaaaaa-2' }).pai).toBe('GL-aaaaaaaa-2')
  })

  it('dois aparelhos: vence, por campo, a escrita mais nova; null limpa', () => {
    const est = fundir([
      criar(A, 1, 'GL-aaaaaaaa-1', 'termo de prova'),
      alterar(A, 2, 'GL-aaaaaaaa-1', { de: 'Probewort' }, 2000),
      alterar(B, 1, 'GL-aaaaaaaa-1', { de: 'Prüfwort' }, 3000),
      alterar(A, 3, 'GL-aaaaaaaa-1', { en: 'trial word' }, 2500),
      alterar(B, 2, 'GL-aaaaaaaa-1', { en: null }, 4000),
      alterar(A, 4, 'GL-aaaaaaaa-1', { outras: [{ lingua: 'francês', forma: 'mot' }] }, 2600),
    ])
    const v = lerVerbeteSkc(est.registro('verbete', 'GL-aaaaaaaa-1')!)
    expect(v.campos.de).toBe('Prüfwort')
    expect(v.campos.en).toBeNull()
    expect(v.campos.outras).toEqual([{ lingua: 'francês', forma: 'mot' }])
  })
})

describe('alterarCamposDoVerbete: cada campo grava e relê', () => {
  const ID = 'GL-aaaaaaaa-501'
  beforeAll(async () => {
    await registrar('verbete', ID, 'criar', { forma: 'termo de prova', status: 'proposed' })
  })
  const lido = () => lerVerbeteSkc(estadoAtual().registro('verbete', ID)!).campos

  it.each([
    ['tipo', 'technical'],
    ['genero', 'f'],
    ['numero', 'pl'],
    ['de', 'Prüfwort'],
    ['en', 'trial word'],
    ['he', 'מִבְחָן'],
    ['ar', 'اِخْتِبَار'],
    ['outras', [{ lingua: 'francês', forma: 'mot d’essai' }]],
    ['variantes', ['Prüfwörter', 'Pruefwort']],
    ['pai', 'GL-900001'],
    ['iconclass', ['11Q7', '25F23(+1)']],
    ['sssl', ['1.2.3']],
  ] as const)('%s', async (campo, valor) => {
    const evento = await alterarCamposDoVerbete(ID, { [campo]: valor })
    expect(evento).toMatchObject({ tipo: 'verbete', reg: ID, op: 'alterar', campos: { [campo]: valor } })
    expect(Object.keys(evento.campos)).toEqual([campo])
    expect(lido()[campo]).toEqual(valor)
    // e limpa
    await alterarCamposDoVerbete(ID, { [campo]: Array.isArray(valor) ? [] : null })
    expect(estadoAtual().registro('verbete', ID)!.campos[campo]).toBeNull()
    expect(lido()[campo]).toEqual(CAMPOS_VAZIOS[campo])
    await alterarCamposDoVerbete(ID, { [campo]: valor })
  })

  it('recusa sem gravar: valor fora do formato, o próprio verbete como pai, um id que não é de verbete', async () => {
    const antes = estadoAtual().registro('verbete', ID)!.alteradoEm
    await expect(alterarCamposDoVerbete(ID, { genero: 'x' as never })).rejects.toThrow()
    await expect(alterarCamposDoVerbete(ID, { pai: ID })).rejects.toThrow()
    await expect(alterarCamposDoVerbete('SI-aaaaaaaa-1', { de: 'x' })).rejects.toThrow()
    await expect(alterarCamposDoVerbete(ID, { variantes: ['ok', 5] as never })).rejects.toThrow('variantes: só textos na lista')
    await expect(alterarCamposDoVerbete(ID, { outras: [{ lingua: 3 }] as never })).rejects.toThrow(/outras: item fora do formato/)
    // um verbete dos livros que não veio do usuário (aqui, sem pacote: nenhum) não se edita
    await expect(alterarCamposDoVerbete('GL-900001', { de: 'x' })).rejects.toThrow(/não veio de um verbete seu/)
    expect(estadoAtual().registro('verbete', ID)!.alteradoEm).toBe(antes)
  })
})
