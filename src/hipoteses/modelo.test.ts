import { ev } from '../../tests/suporte/eventosDeTeste'
import { fundir } from '../usuario/fusao'
import type { Json } from '../usuario/eventos'
import {
  camposDaHipoteseNova,
  eHipoteseDoLivro,
  eHipoteseSkc,
  lerAncora,
  lerHipotese,
  lerPosicao,
  lerRegiao,
  POSICOES,
} from './modelo'

const SHA = 'a'.repeat(64)
const ancora = { fonte: 'PA-TESTE-0001-cat-1', lingua: 'pt', inicio: 3, fim: 10, trecho: 'pingente', sha: SHA }

function registro(tipo: 'hipotese' | 'regiao' | 'posicao', reg: string, campos: Record<string, Json>, mais: Record<string, Json>[] = []) {
  const eventos = [ev({ seq: 1, tipo, reg, op: 'criar', campos }), ...mais.map((c, i) => ev({ seq: 2 + i, tipo, reg, op: 'alterar', campos: c }))]
  return fundir(eventos).registro(tipo, reg)!
}

describe('ids', () => {
  it('hipótese SKC = HY-<aparelho>-<n>; do livro = HY- e só dígitos (6 ou mais)', () => {
    expect(eHipoteseSkc('HY-aaaaaaaa-1')).toBe(true)
    expect(eHipoteseSkc('HY-12345678-12')).toBe(true)
    expect(eHipoteseSkc('HY-000203')).toBe(false)
    expect(eHipoteseSkc('HY-aaaaaaaa-0')).toBe(false)
    expect(eHipoteseSkc('HY-aaaaaaaa-01')).toBe(false)
    expect(eHipoteseSkc('HY-AAAAAAAA-1')).toBe(false)
    expect(eHipoteseDoLivro('HY-000203')).toBe(true)
    expect(eHipoteseDoLivro('HY-900001')).toBe(true)
    expect(eHipoteseDoLivro('HY-1000000')).toBe(true)
    expect(eHipoteseDoLivro('HY-12345')).toBe(false)
    expect(eHipoteseDoLivro('HY-aaaaaaaa-1')).toBe(false)
    expect(eHipoteseDoLivro('HY-000203\n')).toBe(false)
  })
})

describe('lerAncora', () => {
  it('aceita só a forma completa: fonte, língua, início < fim (inteiros ≥ 0), trecho e sha de 64 hexadecimais', () => {
    expect(lerAncora(ancora)).toEqual(ancora)
    expect(lerAncora({ ...ancora, fonte: 'OB-aaaaaaaa-3', lingua: 'skc' })).toEqual({ ...ancora, fonte: 'OB-aaaaaaaa-3', lingua: 'skc' })
    expect(lerAncora(null)).toBeNull()
    expect(lerAncora({ ...ancora, lingua: 'en' })).toBeNull()
    expect(lerAncora({ ...ancora, inicio: 10, fim: 10 })).toBeNull()
    expect(lerAncora({ ...ancora, inicio: -1 })).toBeNull()
    expect(lerAncora({ ...ancora, inicio: 1.5 })).toBeNull()
    expect(lerAncora({ ...ancora, sha: 'A'.repeat(64) })).toBeNull()
    expect(lerAncora({ ...ancora, trecho: '' })).toBeNull()
    expect(lerAncora({ ...ancora, fonte: '' })).toBeNull()
    expect(lerAncora({ ...ancora, lingua: 'skc' })).toBeNull() // a leitura SKC é a de um objeto SKC
  })
})

describe('lerHipotese', () => {
  it('lê o que o formulário grava', () => {
    const campos = camposDaHipoteseNova({
      objeto: 'CA00001',
      sobre: { tipo: 'elemento', id: 'EL-900002', rotulo: 'leão-de-teste' },
      termos: [{ id: 'GL-900001', rotulo: 'leão-de-teste' }],
      nivel: 'iconographic',
      modalidade: 'probable',
      justificativa: 'como em [[CA00002]]',
      ancora: lerAncora(ancora),
    })
    expect(campos).toEqual({
      objeto: 'CA00001',
      sobre: 'elemento',
      elemento: 'EL-900002',
      elementoRotulo: 'leão-de-teste',
      termos: ['GL-900001'],
      termosRotulos: ['leão-de-teste'],
      nivel: 'iconographic',
      modalidade: 'probable',
      justificativa: 'como em [[CA00002]]',
      ancora,
    })
    const h = lerHipotese(registro('hipotese', 'HY-aaaaaaaa-1', campos))
    expect(h).toEqual({
      id: 'HY-aaaaaaaa-1',
      objeto: 'CA00001',
      sobre: { tipo: 'elemento', id: 'EL-900002', rotulo: 'leão-de-teste' },
      termos: [{ id: 'GL-900001', rotulo: 'leão-de-teste' }],
      nivel: 'iconographic',
      modalidade: 'probable',
      justificativa: 'como em [[CA00002]]',
      ancora,
      excluido: false,
      criadoEm: expect.any(String),
    })
  })

  it('o objeto inteiro; um SKC pelo id; valores estranhos de outro aparelho não quebram a leitura', () => {
    const h = lerHipotese(
      registro('hipotese', 'HY-aaaaaaaa-2', {
        objeto: 'ob-aaaaaaaa-1',
        sobre: 'objeto',
        elemento: 'EL-1',
        termos: ['GL-1', 7, 'GL-2'],
        termosRotulos: ['um'],
        nivel: 'outro',
        modalidade: 3,
        justificativa: null,
        ancora: { x: 1 },
      }),
    )
    expect(h).toMatchObject({
      objeto: null,
      sobre: { tipo: 'objeto' },
      termos: [
        { id: 'GL-1', rotulo: 'um' },
        { id: 'GL-2', rotulo: 'GL-2' },
      ],
      nivel: null,
      modalidade: null,
      justificativa: '',
      ancora: null,
    })
    expect(lerHipotese(registro('hipotese', 'HY-aaaaaaaa-3', { objeto: 'OB-aaaaaaaa-1', sobre: 'elemento', elemento: 'RG-aaaaaaaa-4' })).sobre).toEqual({
      tipo: 'elemento',
      id: 'RG-aaaaaaaa-4',
      rotulo: '',
    })
    // "elemento" sem id de elemento válido vale como o objeto inteiro.
    expect(lerHipotese(registro('hipotese', 'HY-aaaaaaaa-4', { objeto: 'CA00001', sobre: 'elemento', elemento: 'lixo' })).sobre).toEqual({ tipo: 'objeto' })
    expect(lerHipotese(registro('hipotese', 'HY-aaaaaaaa-5', { objeto: 'CA00001' })).objeto).toBe('CA00001')
  })

  it('alterações por campo (nível, termos com rótulos) valem pela fusão', () => {
    const h = lerHipotese(
      registro('hipotese', 'HY-aaaaaaaa-6', { objeto: 'CA00001', sobre: 'objeto', nivel: 'iconographic', modalidade: 'probable', termos: [], termosRotulos: [] }, [
        { nivel: 'iconological' },
        { termos: ['GL-900002'], termosRotulos: ['figura denteada'] },
      ]),
    )
    expect(h.nivel).toBe('iconological')
    expect(h.termos).toEqual([{ id: 'GL-900002', rotulo: 'figura denteada' }])
  })
})

describe('lerRegiao', () => {
  it('imagem, objeto, polígono (R4) e o elemento: novo (o id da região) ou existente; o pai é opcional', () => {
    const r = lerRegiao(
      registro('regiao', 'RG-aaaaaaaa-1', { imagem: 'IM-aaaaaaaa-2', objeto: 'OB-aaaaaaaa-1', seletor: '<polygon points="0.1,0.1 0.5,0.1 0.5,0.5"/>', elemento: ' focinho ', elementoId: null, pai: 'EL-900001' }),
    )
    expect(r).toEqual({
      id: 'RG-aaaaaaaa-1',
      imagem: 'IM-aaaaaaaa-2',
      objeto: 'OB-aaaaaaaa-1',
      seletor: '<polygon points="0.1,0.1 0.5,0.1 0.5,0.5"/>',
      pontos: [
        [0.1, 0.1],
        [0.5, 0.1],
        [0.5, 0.5],
      ],
      elemento: 'focinho',
      elementoId: 'RG-aaaaaaaa-1',
      pai: 'EL-900001',
      excluido: false,
    })
    expect(lerRegiao(registro('regiao', 'RG-aaaaaaaa-2', { imagem: 'IMG-TESTE-0001-1', objeto: 'CA00001', seletor: '<polygon points="0,0 1,0 1,1"/>', elemento: 'leão', elementoId: 'EL-900002' })).elementoId).toBe(
      'EL-900002',
    )
    // Polígono que não é polígono: sem pontos (a região não aparece).
    expect(lerRegiao(registro('regiao', 'RG-aaaaaaaa-3', { imagem: 'IM-x', seletor: 'lixo' })).pontos).toEqual([])
  })

  it('revisão 3, M8: de outro aparelho, coordenadas fora de 0 a 1 ficam na borda; elementoId inválido = a própria região', () => {
    const r = lerRegiao(registro('regiao', 'RG-aaaaaaaa-4', { imagem: 'IM-x', seletor: '<polygon points="-0.2,0.1 1.5,0.1 0.5,2"/>', elemento: 'x', elementoId: 'EL-x', pai: 'lixo' }))
    expect(r.pontos).toEqual([
      [0, 0.1],
      [1, 0.1],
      [0.5, 1],
    ])
    expect(r.elementoId).toBe('RG-aaaaaaaa-4')
    expect(r.pai).toBeNull()
  })
})

describe('lerPosicao', () => {
  it('a posição sobre uma hipótese do livro (o reg é o id dela): concordo, discordo, em aberto ou nenhuma', () => {
    expect(POSICOES).toEqual(['concordo', 'discordo', 'aberto'])
    expect(lerPosicao(registro('posicao', 'HY-000203', { hipotese: 'HY-000203', posicao: 'discordo', justificativa: 'ver [[CA00002]]' }))).toEqual({
      hipotese: 'HY-000203',
      posicao: 'discordo',
      justificativa: 'ver [[CA00002]]',
      excluido: false,
    })
    expect(lerPosicao(registro('posicao', 'HY-000204', { hipotese: 'HY-000204', posicao: 'concordo' }, [{ posicao: null }])).posicao).toBeNull()
    expect(lerPosicao(registro('posicao', 'HY-000205', { hipotese: 'HY-000205', posicao: 'talvez' })).posicao).toBeNull()
    // O reg manda: um campo `hipotese` diferente do reg não vale.
    expect(lerPosicao(registro('posicao', 'HY-000206', { hipotese: 'HY-000999', posicao: 'concordo' })).hipotese).toBe('HY-000206')
  })
})
