/// <reference types="node" />
/**
 * A resolução dos sítios (Parte 2C, bloco 2): o porte do `iconodb/sitios_relacoes.py` do processamento. O contrato é o
 * arquivo de casos tests/fixtures/sitios-resolucao-casos.json, copiado byte a byte do repositório privado, com o MESMO
 * sha256 fixado lá (`tests/test_sitios_relacoes.py`). Quem muda um caso muda o arquivo nos dois, roda os dois portes e
 * refixa o sha256 nos dois. Depois dos casos, o que só o app usa (caminho, partes, descendentes, absorvidos, os «pode?» e
 * os conflitos deste aparelho).
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { A, B, ev } from '../../tests/suporte/eventosDeTeste'
import type { Json } from '../usuario/eventos'
import { fundir } from '../usuario/fusao'
import {
  campoEscrito,
  conflitosDesteAparelho,
  grafiasDoSitio,
  grafiasProprias,
  gravacaoDaGrafia,
  PACOTE_VAZIO,
  type MudancaDaGrafia,
  podeMesclar,
  podeSerParte,
  relacoesDe,
  resolverSitios,
  type GrafiaDoPacote,
  type PacoteDeSitios,
  type ParSugerido,
} from './resolucao'

const ARQUIVO = join(import.meta.dirname, '..', '..', 'tests', 'fixtures', 'sitios-resolucao-casos.json')
/** O sha256 fixado também no repositório privado (`SHA256_CASOS`, tests/test_sitios_relacoes.py). */
const SHA256_DO_ARQUIVO = 'f9256ff46074cce3519819aa982f10c78b224fff977f477b5df07b6df40eec7a'

interface PacoteDoArquivo {
  sitios: string[]
  publicados: Record<string, string>
  /** Os destinos de `publicados` que o pacote CRIOU de um sítio do usuário (`criado`); fora do arquivo de casos, nenhum. */
  criados?: string[]
  mesclas: Record<string, string>
  partes: Record<string, string>
  grafias: GrafiaDoPacote[]
  pares: ParSugerido[]
}

interface Caso {
  nome: string
  descricao: string
  eventos: unknown[]
  pacote: PacoteDoArquivo
  esperado: { relacoes: unknown; conflitos: unknown[]; paresPendentes: unknown[] }
}

const bruto = readFileSync(ARQUIVO)
const arquivo = JSON.parse(bruto.toString('utf8')) as { versao: number; casos: Caso[] }

const pacoteDe = (p: PacoteDoArquivo): PacoteDeSitios => ({
  sitios: new Set(p.sitios),
  publicados: new Map(Object.entries(p.publicados)),
  criados: new Set(p.criados ?? []),
  mesclas: new Map(Object.entries(p.mesclas)),
  partes: new Map(Object.entries(p.partes)),
  grafias: p.grafias,
  pares: p.pares,
})

/** Um pacote com os sítios `TESTE-<n>` dados e o resto vazio (ou o que vier em `mais`). */
const pacote = (n: readonly (number | string)[], mais: Partial<PacoteDoArquivo> = {}): PacoteDeSitios =>
  pacoteDe({ sitios: n.map((x) => (typeof x === 'number' ? `TESTE-${x}` : x)), publicados: {}, mesclas: {}, partes: {}, grafias: [], pares: [], ...mais })

let seq = 0
const sit = (ap: string, reg: string, campos: Record<string, Json>, op: 'criar' | 'alterar' | 'excluir' | 'restaurar' = 'alterar') =>
  ev({ ap, seq: ++seq, tipo: 'sitio', reg, op, campos })

describe('o arquivo de casos, o mesmo do processamento', () => {
  it('é o fixado nos dois repositórios (sha256)', () => {
    expect(createHash('sha256').update(bruto).digest('hex')).toBe(SHA256_DO_ARQUIVO)
    expect(arquivo.versao).toBe(1)
    expect(arquivo.casos.length).toBe(27)
  })

  it.each(arquivo.casos.map((c) => [c.nome, c] as const))('%s', (_nome, c) => {
    const estado = fundir(c.eventos)
    expect(estado.ignorados.total).toBe(0)
    const r = resolverSitios(estado, pacoteDe(c.pacote))
    // A ordem das chaves e das listas faz parte do contrato (o `user-import` grava este JSON): compara o texto.
    expect(JSON.stringify(relacoesDe(r))).toBe(JSON.stringify(c.esperado.relacoes))
    expect(JSON.stringify(r.conflitos)).toBe(JSON.stringify(c.esperado.conflitos))
    expect(JSON.stringify(r.paresPendentes)).toBe(JSON.stringify(c.esperado.paresPendentes))
  })
})

describe('o que só o app pergunta à resolução', () => {
  it('M-1: eDoUsuario — o `SI-…` e o sítio seu publicado com id de livro (criado dele) são seus; o do livro a que um sítio seu só leva, não', () => {
    const estado = fundir([sit(A, 'SI-aaaaaaaa-1', { nome: 'Tell Teste' }, 'criar'), sit(A, 'SI-aaaaaaaa-2', { nome: 'Igual ao do livro' }, 'criar'), sit(A, 'SI-aaaaaaaa-3', { nome: 'Novo' }, 'criar')])
    const r = resolverSitios(estado, pacote([1, 91, 1001], { publicados: { 'SI-aaaaaaaa-1': 'TESTE-91', 'SI-aaaaaaaa-2': 'TESTE-1' }, criados: ['TESTE-91'] }))
    expect(r.eDoUsuario('TESTE-91')).toBe(true) // publicado: o id é de livro, o sítio é seu
    expect(r.eDoUsuario('SI-aaaaaaaa-1')).toBe(true)
    expect(r.eDoUsuario('SI-aaaaaaaa-3')).toBe(true)
    expect(r.eDoUsuario('TESTE-1001')).toBe(false)
    // SI-aaaaaaaa-2 só leva a TESTE-1 (não o criou): TESTE-1 continua do livro, e o SI-… é ele
    expect(r.eDoUsuario('TESTE-1')).toBe(false)
    expect(r.eDoUsuario('SI-aaaaaaaa-2')).toBe(false)
  })

  it('sem pacote e sem camada: nenhum sítio', () => {
    const r = resolverSitios(fundir([]), PACOTE_VAZIO)
    expect(r.sitios).toEqual([])
    expect(r.existe('TESTE-1')).toBe(false)
    expect(relacoesDe(r)).toEqual({ mesclas: {}, partes: {}, grafias: {}, diferentes: [] })
  })

  it('existe e canônico: o SI-… publicado é o sítio do livro; o excluído e o desconhecido não existem', () => {
    const estado = fundir([
      sit(A, 'SI-aaaaaaaa-1', { nome: 'Publicado' }, 'criar'),
      sit(A, 'SI-aaaaaaaa-2', { nome: 'Vivo' }, 'criar'),
      sit(A, 'SI-aaaaaaaa-3', { nome: 'Excluído' }, 'criar'),
      sit(A, 'SI-aaaaaaaa-3', {}, 'excluir'),
    ])
    const r = resolverSitios(estado, pacote([1, 91], { publicados: { 'SI-aaaaaaaa-1': 'TESTE-91' } }))
    expect(r.canonico('SI-aaaaaaaa-1')).toBe('TESTE-91')
    expect(r.canonico('TESTE-1')).toBe('TESTE-1')
    expect(r.existe('SI-aaaaaaaa-1')).toBe(true)
    expect(r.existe('SI-aaaaaaaa-2')).toBe(true)
    expect(r.existe('SI-aaaaaaaa-3')).toBe(false)
    expect(r.existe('SI-aaaaaaaa-9')).toBe(false)
    expect(r.existe('TESTE-2')).toBe(false)
    // em ordem de ponto de código; o SI-… publicado não é um sítio à parte
    expect(r.sitios).toEqual(['SI-aaaaaaaa-2', 'TESTE-1', 'TESTE-91'])
    expect(r.destino('SI-aaaaaaaa-1')).toBe('TESTE-91')
  })

  it('absorvidos: os diretos e os indiretos, em ordem de ponto de código (A→B→C: absorvidos(C) = [A, B])', () => {
    const estado = fundir([sit(A, 'TESTE-9', { mescladoEm: 'TESTE-10' }), sit(A, 'TESTE-10', { mescladoEm: 'TESTE-3' })])
    const r = resolverSitios(estado, pacote([3, 9, 10]))
    expect(r.destino('TESTE-9')).toBe('TESTE-3')
    expect(r.destino('TESTE-10')).toBe('TESTE-3')
    expect(r.destino('TESTE-3')).toBe('TESTE-3')
    expect(r.absorvidos('TESTE-3')).toEqual(['TESTE-10', 'TESTE-9'])
    expect(r.absorvidos('TESTE-10')).toEqual([])
    expect(r.absorvidos('TESTE-99')).toEqual([])
  })

  it('caminho, partes e descendentes em três níveis (com uma parte do pacote)', () => {
    const estado = fundir([
      sit(A, 'TESTE-3', { parteDe: 'TESTE-2' }),
      sit(A, 'TESTE-2', { parteDe: 'TESTE-1' }),
      sit(A, 'TESTE-5', { parteDe: 'TESTE-2' }),
      sit(A, 'TESTE-6', { parteDe: 'TESTE-1' }),
    ])
    const r = resolverSitios(estado, pacote([1, 2, 3, 4, 5, 6], { partes: { 'TESTE-4': 'TESTE-3' } }))
    expect(r.todo('TESTE-4')).toBe('TESTE-3')
    expect(r.todo('TESTE-1')).toBeNull()
    expect(r.caminho('TESTE-4')).toEqual(['TESTE-1', 'TESTE-2', 'TESTE-3'])
    expect(r.caminho('TESTE-2')).toEqual(['TESTE-1'])
    expect(r.caminho('TESTE-1')).toEqual([])
    expect(r.partes('TESTE-1')).toEqual(['TESTE-2', 'TESTE-6'])
    expect(r.partes('TESTE-2')).toEqual(['TESTE-3', 'TESTE-5'])
    expect(r.partes('TESTE-4')).toEqual([])
    // em árvore: cada parte seguida das dela
    expect(r.descendentes('TESTE-1')).toEqual(['TESTE-2', 'TESTE-3', 'TESTE-4', 'TESTE-5', 'TESTE-6'])
    expect(r.descendentes('TESTE-3')).toEqual(['TESTE-4'])
    expect(r.descendentes('TESTE-4')).toEqual([])
  })

  it('as grafias do usuário: as do destino e as dos absorvidos; o absorvido não tem as dele à parte', () => {
    const estado = fundir([
      sit(A, 'TESTE-1', { grafias: [{ texto: 'Tel Um', tradicao: 'hebraica-moderna' }] }),
      sit(A, 'TESTE-2', { variantes: ['Tall Dois'] }),
      sit(A, 'TESTE-2', { mescladoEm: 'TESTE-1' }),
    ])
    const r = resolverSitios(estado, pacote([1, 2]))
    expect(r.grafiasDoUsuario('TESTE-1')).toEqual([{ texto: 'Tel Um', tradicao: 'hebraica-moderna' }, { texto: 'Tall Dois' }])
    expect(r.grafiasDoUsuario('TESTE-2')).toEqual([])
  })

  describe('podeMesclar e podeSerParte, um motivo de cada vez', () => {
    const estado = fundir([
      sit(A, 'SI-aaaaaaaa-1', { nome: 'Excluído' }, 'criar'),
      sit(A, 'SI-aaaaaaaa-1', {}, 'excluir'),
      sit(A, 'SI-aaaaaaaa-2', { nome: 'Publicado' }, 'criar'),
      sit(A, 'TESTE-5', { mescladoEm: 'TESTE-4' }),
      sit(A, 'TESTE-2', { parteDe: 'TESTE-1' }),
      sit(A, 'TESTE-3', { parteDe: 'TESTE-2' }),
    ])
    const r = resolverSitios(estado, pacote([1, 2, 3, 4, 5, 91], { publicados: { 'SI-aaaaaaaa-2': 'TESTE-91' } }))

    it('podeMesclar', () => {
      expect(podeMesclar(r, 'TESTE-1', 'SI-aaaaaaaa-1')).toBe('excluido')
      expect(podeMesclar(r, 'SI-aaaaaaaa-1', 'TESTE-1')).toBe('excluido')
      expect(podeMesclar(r, 'TESTE-1', 'TESTE-99')).toBe('excluido')
      expect(podeMesclar(r, 'TESTE-1', 'TESTE-1')).toBe('mesmo')
      expect(podeMesclar(r, 'TESTE-91', 'SI-aaaaaaaa-2')).toBe('mesmo')
      expect(podeMesclar(r, 'TESTE-1', 'TESTE-5')).toBe('mesclado')
      expect(podeMesclar(r, 'TESTE-5', 'TESTE-1')).toBe('mesclado')
      expect(podeMesclar(r, 'TESTE-4', 'TESTE-5')).toBe('mesclado')
      expect(podeMesclar(r, 'TESTE-4', 'TESTE-1')).toBeNull()
      // mesclar o todo numa parte dele pode (a parte deixa de ser parte: seria parte de si mesma)
      expect(podeMesclar(r, 'TESTE-3', 'TESTE-1')).toBeNull()
    })

    it('podeSerParte', () => {
      expect(podeSerParte(r, 'TESTE-4', 'SI-aaaaaaaa-1')).toBe('excluido')
      expect(podeSerParte(r, 'SI-aaaaaaaa-1', 'TESTE-4')).toBe('excluido')
      expect(podeSerParte(r, 'TESTE-4', 'TESTE-4')).toBe('mesmo')
      expect(podeSerParte(r, 'SI-aaaaaaaa-2', 'TESTE-91')).toBe('mesmo')
      expect(podeSerParte(r, 'TESTE-5', 'TESTE-1')).toBe('mesclado')
      expect(podeSerParte(r, 'TESTE-1', 'TESTE-5')).toBe('mesclado')
      expect(podeSerParte(r, 'TESTE-1', 'TESTE-3')).toBe('descendente')
      expect(podeSerParte(r, 'TESTE-1', 'TESTE-2')).toBe('descendente')
      expect(podeSerParte(r, 'TESTE-4', 'TESTE-3')).toBeNull()
      // já é parte de outro: pode mudar de todo
      expect(podeSerParte(r, 'TESTE-3', 'TESTE-1')).toBeNull()
    })
  })

  describe('conflitosDesteAparelho: o descartado é deste aparelho e o vencedor é de outro', () => {
    it('no círculo de dois aparelhos, só o que perdeu o vê', () => {
      const estado = fundir([sit(A, 'TESTE-1', { mescladoEm: 'TESTE-2' }), sit(B, 'TESTE-2', { mescladoEm: 'TESTE-1' })])
      const r = resolverSitios(estado, pacote([1, 2]))
      expect(r.conflitos).toHaveLength(1)
      expect(conflitosDesteAparelho(r, A)).toEqual([expect.objectContaining({ tipo: 'mescla', registro: 'TESTE-1', valor: 'TESTE-2', aparelho: A })])
      expect(conflitosDesteAparelho(r, B)).toEqual([])
    })

    it('os dois lados do mesmo aparelho: conflito na resolução, mas aviso para ninguém', () => {
      const estado = fundir([sit(A, 'TESTE-1', { parteDe: 'TESTE-2' }), sit(A, 'TESTE-2', { parteDe: 'TESTE-1' })])
      const r = resolverSitios(estado, pacote([1, 2]))
      expect(r.conflitos).toEqual([expect.objectContaining({ tipo: 'parte', registro: 'TESTE-1' })])
      expect(conflitosDesteAparelho(r, A)).toEqual([])
      expect(conflitosDesteAparelho(r, B)).toEqual([])
    })
  })
})

describe('campoEscrito (o que um «Desfazer» grava de volta: a mesma regra da resolução)', () => {
  // SI-aaaaaaaa-9 foi publicado como TESTE-3; o pacote diz que TESTE-3 é parte de TESTE-1.
  const pacote: PacoteDeSitios = {
    ...PACOTE_VAZIO,
    sitios: new Set(['TESTE-1', 'TESTE-2', 'TESTE-3', 'TESTE-5']),
    publicados: new Map([['SI-aaaaaaaa-9', 'TESTE-3']]),
    partes: new Map([['TESTE-3', 'TESTE-1']]),
  }
  let n = 0
  const e = (reg: string, campos: Record<string, Json>, op: 'criar' | 'alterar' = 'alterar') => ev({ ap: A, seq: ++n, tipo: 'sitio', reg, op, campos })

  it('sem nada escrito, o do pacote; pelo id do livro ou pelo `SI-…` publicado', () => {
    const estado = fundir([])
    expect(campoEscrito(estado, pacote, 'TESTE-3', 'parteDe')).toBe('TESTE-1')
    expect(campoEscrito(estado, pacote, 'SI-aaaaaaaa-9', 'parteDe')).toBe('TESTE-1')
    expect(campoEscrito(estado, pacote, 'TESTE-2', 'parteDe')).toBeNull()
  })

  it('escrito no registro do livro e no `SI-…` publicado: vale o mais recente, como na resolução', () => {
    const livroDepois = fundir([e('SI-aaaaaaaa-9', { nome: 'Tell Publicado', parteDe: 'TESTE-5' }, 'criar'), e('TESTE-3', { parteDe: 'TESTE-2' })])
    expect(campoEscrito(livroDepois, pacote, 'TESTE-3', 'parteDe')).toBe('TESTE-2')
    expect(resolverSitios(livroDepois, pacote).todo('TESTE-3')).toBe('TESTE-2')
    const siDepois = fundir([e('TESTE-3', { parteDe: 'TESTE-2' }), e('SI-aaaaaaaa-9', { nome: 'Tell Publicado', parteDe: 'TESTE-5' }, 'criar')])
    expect(campoEscrito(siDepois, pacote, 'TESTE-3', 'parteDe')).toBe('TESTE-5')
    expect(resolverSitios(siDepois, pacote).todo('TESTE-3')).toBe('TESTE-5')
    // escrito sem id (soltar): null, e o do pacote não volta
    const solto = fundir([e('TESTE-3', { parteDe: null })])
    expect(campoEscrito(solto, pacote, 'TESTE-3', 'parteDe')).toBeNull()
  })
})

describe('grafiasDoSitio (Tarefa 13): as do livro com a tradição dada, as da pessoa e os nomes dos absorvidos', () => {
  // TESTE-3 foi mesclado em TESTE-1 pelo pacote; SI-aaaaaaaa-1 (seu) pela pessoa.
  const doLivro = (sitio: string, texto: string, sigla: string, pagina: string): GrafiaDoPacote => ({ sitio, texto, tradicao: null, sigla, pagina, origem: 'livro' })
  const pacote8 = pacote([1, 2, 3], {
    mesclas: { 'TESTE-3': 'TESTE-1' },
    grafias: [
      doLivro('TESTE-1', 'Tell Um', 'TESTE', '1'),
      doLivro('TESTE-1', 'Tall et-Um', 'TESTE', '12'),
      doLivro('TESTE-3', 'Tel Três', 'TESTE2', '3'),
      doLivro('TESTE-3', 'Tall et-Ūm', 'TESTE2', '4'),
      // uma linha do usuário no pacote: a camada a tem (F12), não se lê
      { sitio: 'TESTE-1', texto: 'Probetal Um', tradicao: 'alema', sigla: null, pagina: null, origem: 'usuario' },
    ],
  })
  const eventos = [
    sit(A, 'TESTE-1', {
      grafias: [
        { texto: 'Tall et-Um', livro: 'TESTE', tradicao: 'arabe' },
        { texto: 'Testheim', livro: 'TESTE2', tradicao: 'alema' },
        { texto: 'Probetal Um', tradicao: 'alema' },
        { texto: 'tell um' },
      ],
    }),
    sit(A, 'SI-aaaaaaaa-1', { nome: 'Tell Exemplo' }, 'criar'),
    sit(A, 'SI-aaaaaaaa-1', { mescladoEm: 'TESTE-1' }),
  ]
  const estado = fundir(eventos)
  const nomes: Record<string, string> = { 'TESTE-1': 'Tell Um', 'TESTE-2': 'Tell Dois', 'TESTE-3': 'Tel Três', 'SI-aaaaaaaa-1': 'Tell Exemplo' }
  const nome = (id: string) => nomes[id] ?? id
  const r = resolverSitios(estado, pacote8)

  it('as do livro (do sítio e dos absorvidos, cada livro com o sítio de que é) com a tradição dada; a mesma grafia de dois livros vira uma; sem o nome de agora; depois as suas e os nomes dos absorvidos', () => {
    expect(grafiasDoSitio(r, 'TESTE-1', pacote8, nome)).toEqual([
      {
        texto: 'Tall et-Um',
        tradicao: 'arabe',
        livros: [
          { sigla: 'TESTE', pagina: '12', sitio: 'TESTE-1' },
          { sigla: 'TESTE2', pagina: '4', sitio: 'TESTE-3' },
        ],
        doUsuario: false,
        grupo: 'arabe',
      },
      // o nome do absorvido do livro: a grafia do livro, com a página, à espera da tradição (e com `nomeDe`)
      { texto: 'Tel Três', tradicao: null, livros: [{ sigla: 'TESTE2', pagina: '3', sitio: 'TESTE-3' }], doUsuario: false, grupo: 'sem-tradicao', nomeDe: 'TESTE-3' },
      { texto: 'Testheim', tradicao: 'alema', livros: [{ sigla: 'TESTE2', pagina: null }], doUsuario: true, grupo: 'alema' },
      // a da camada; a linha `origem='usuario'` do pacote não a duplica
      { texto: 'Probetal Um', tradicao: 'alema', livros: [], doUsuario: true, grupo: 'alema' },
      // o nome do absorvido seu: sem origem até receber uma
      { texto: 'Tell Exemplo', tradicao: null, livros: [], doUsuario: true, grupo: 'sem-origem', nomeDe: 'SI-aaaaaaaa-1' },
    ])
  })

  it('a tradição que a camada não dá não vem do pacote: a camada vence (a linha do livro só a repete)', () => {
    const comTradicao = { ...pacote8, grafias: pacote8.grafias.map((g) => (g.texto === 'Tel Três' ? { ...g, tradicao: 'biblica' as const } : g)) }
    expect(grafiasDoSitio(resolverSitios(estado, comTradicao), 'TESTE-1', comTradicao, nome).find((g) => g.texto === 'Tel Três')).toMatchObject({ tradicao: null, grupo: 'sem-tradicao' })
  })

  it('M3: a grafia sua com a chave de uma do livro: sem livro, dá a tradição (as de antes); com outro livro, o livro entra na lista dela; nunca se repete', () => {
    const semLivro = fundir([sit(A, 'TESTE-1', { grafias: [{ texto: 'tall et-um', tradicao: 'biblica' }] })])
    expect(grafiasDoSitio(resolverSitios(semLivro, pacote8), 'TESTE-1', pacote8, nome).filter((g) => g.texto.startsWith('Tall'))).toEqual([
      expect.objectContaining({ texto: 'Tall et-Um', tradicao: 'biblica', doUsuario: false, grupo: 'biblica' }),
    ])
    const outroLivro = fundir([sit(A, 'TESTE-1', { grafias: [{ texto: 'tall et-um', livro: 'OUTRO', tradicao: 'outra' }] })])
    expect(grafiasDoSitio(resolverSitios(outroLivro, pacote8), 'TESTE-1', pacote8, nome).filter((g) => g.texto.startsWith('Tall'))).toEqual([
      {
        texto: 'Tall et-Um',
        tradicao: 'outra',
        livros: [
          { sigla: 'TESTE', pagina: '12', sitio: 'TESTE-1' },
          { sigla: 'TESTE2', pagina: '4', sitio: 'TESTE-3' },
          { sigla: 'OUTRO', pagina: null },
        ],
        doUsuario: false,
        grupo: 'outra',
      },
    ])
    // a do livro certo vence a sem livro
    const as2 = fundir([sit(A, 'TESTE-1', { grafias: [{ texto: 'Tall et-Um', tradicao: 'biblica' }, { texto: 'Tall et-Um', livro: 'TESTE2', tradicao: 'arabe' }] })])
    expect(grafiasDoSitio(resolverSitios(as2, pacote8), 'TESTE-1', pacote8, nome)[0]).toMatchObject({ texto: 'Tall et-Um', tradicao: 'arabe' })
  })

  it('o nome de agora corrigido: a grafia impressa (o nome do livro) aparece, com a página', () => {
    const vistas = grafiasDoSitio(r, 'TESTE-1', pacote8, (id) => (id === 'TESTE-1' ? 'Tell Um Corrigido' : nome(id)))
    expect(vistas[0]).toEqual({ texto: 'Tell Um', tradicao: null, livros: [{ sigla: 'TESTE', pagina: '1', sitio: 'TESTE-1' }], doUsuario: false, grupo: 'sem-tradicao' })
  })

  it('M1: o nome do absorvido que recebeu uma tradição (na lista do absorvido) vem com ela, uma vez, e continua com `nomeDe` (sem ×)', () => {
    const e = fundir([...eventos, sit(A, 'SI-aaaaaaaa-1', { grafias: [{ texto: 'Tell Exemplo', tradicao: 'inglesa' }] })])
    const vistas = grafiasDoSitio(resolverSitios(e, pacote8), 'TESTE-1', pacote8, nome)
    expect(vistas.filter((g) => g.texto === 'Tell Exemplo')).toEqual([{ texto: 'Tell Exemplo', tradicao: 'inglesa', livros: [], doUsuario: true, grupo: 'inglesa', nomeDe: 'SI-aaaaaaaa-1' }])
  })

  it('I2: pacote 5–7, um sítio do livro mesclado no app: o nome dele é grafia do livro (a sigla, sem página); o corrigido é seu', () => {
    const e = fundir([sit(A, 'TESTE-2', { variantes: ['Tal Dois'] }), sit(A, 'TESTE-2', { mescladoEm: 'TESTE-1' })])
    const p7 = pacote([1, 2])
    expect(grafiasDoSitio(resolverSitios(e, p7), 'TESTE-1', p7, nome, (id) => nomes[id] ?? null)).toEqual([
      { texto: 'Tell Dois', tradicao: null, livros: [{ sigla: 'TESTE', pagina: null, sitio: 'TESTE-2' }], doUsuario: false, grupo: 'sem-tradicao', nomeDe: 'TESTE-2' },
      { texto: 'Tal Dois', tradicao: null, livros: [], doUsuario: true, grupo: 'sem-origem' },
    ])
    // corrigido pela pessoa (o nome de agora não é o do livro): é dela
    expect(grafiasDoSitio(resolverSitios(e, p7), 'TESTE-1', p7, (id) => (id === 'TESTE-2' ? 'Tell Dois Novo' : nome(id)), (id) => nomes[id] ?? null)).toContainEqual({
      texto: 'Tell Dois Novo',
      tradicao: null,
      livros: [],
      doUsuario: true,
      grupo: 'sem-origem',
      nomeDe: 'TESTE-2',
    })
  })

  it('I2: a tradição dada no pacote 7 ({texto, livro, tradicao} no absorvido) continua quando o pacote 8 traz a linha do livro; a de antes, sem livro, também', () => {
    const p7 = pacote([1, 3])
    const merge = sit(A, 'TESTE-3', { mescladoEm: 'TESTE-1' })
    const r7 = resolverSitios(fundir([merge]), p7)
    const [vista] = grafiasDoSitio(r7, 'TESTE-1', p7, nome)
    expect(vista).toEqual({ texto: 'Tel Três', tradicao: null, livros: [{ sigla: 'TESTE', pagina: null, sitio: 'TESTE-3' }], doUsuario: false, grupo: 'sem-tradicao', nomeDe: 'TESTE-3' })
    const gravacao = gravacaoDaGrafia([{ id: 'TESTE-1', grafias: [] }, { id: 'TESTE-3', grafias: [] }], vista!, { tradicao: 'arabe' })
    expect(gravacao).toEqual([{ id: 'TESTE-3', grafias: [{ texto: 'Tel Três', livro: 'TESTE', tradicao: 'arabe' }] }])
    const p8 = pacote([1, 3], { grafias: [doLivro('TESTE-3', 'Tel Três', 'TESTE', '3')] })
    const depois = fundir([merge, sit(A, 'TESTE-3', { grafias: gravacao[0]!.grafias.map((g) => ({ ...g })) })])
    expect(grafiasDoSitio(resolverSitios(depois, p8), 'TESTE-1', p8, nome)).toEqual([
      { texto: 'Tel Três', tradicao: 'arabe', livros: [{ sigla: 'TESTE', pagina: '3', sitio: 'TESTE-3' }], doUsuario: false, grupo: 'arabe', nomeDe: 'TESTE-3' },
    ])
    // escrita antes desta correção (sem livro): a tradição também vem
    const antiga = fundir([merge, sit(A, 'TESTE-3', { grafias: [{ texto: 'Tel Três', tradicao: 'arabe' }] })])
    expect(grafiasDoSitio(resolverSitios(antiga, p8), 'TESTE-1', p8, nome)[0]).toMatchObject({ tradicao: 'arabe', doUsuario: false })
  })
})

describe('grafiasProprias e gravacaoDaGrafia (Tarefa 13): de onde a edição parte e onde grava', () => {
  it('grafiasProprias: as do sítio pela regra da resolução, juntando o registro do livro e o `SI-…` publicado como ele (vale o mais recente)', () => {
    const p = pacote([2], { publicados: { 'SI-aaaaaaaa-9': 'TESTE-2' } })
    const e = fundir([sit(A, 'SI-aaaaaaaa-9', { nome: 'Tell Dois', grafias: [{ texto: 'Tel Dois', tradicao: 'biblica' }] }, 'criar')])
    expect(grafiasProprias(e, p, 'TESTE-2')).toEqual([{ texto: 'Tel Dois', tradicao: 'biblica' }])
    expect(grafiasProprias(e, p, 'SI-aaaaaaaa-9')).toEqual([{ texto: 'Tel Dois', tradicao: 'biblica' }])
    // as `variantes` de antes, sem origem
    expect(grafiasProprias(fundir([sit(A, 'TESTE-2', { variantes: ['Tal Velho'] })]), p, 'TESTE-2')).toEqual([{ texto: 'Tal Velho' }])
    expect(grafiasProprias(fundir([]), p, 'TESTE-2')).toEqual([])
  })

  const listas = [
    { id: 'TESTE-1', grafias: [{ texto: 'Testheim', livro: 'TESTE2', tradicao: 'alema' as const }, { texto: 'Tall et-Um', livro: 'TESTE', tradicao: 'arabe' as const }, { texto: 'Tel Velho' }] },
    { id: 'SI-aaaaaaaa-1', grafias: [{ texto: 'Tal Exemplo', tradicao: 'outra' as const }] },
    { id: 'TESTE-3', grafias: [] },
  ]
  const livro = (texto: string, ...livros: [string, string | null, string?][]) => ({
    texto,
    tradicao: null,
    livros: livros.map(([sigla, pagina, sitio]) => ({ sigla, pagina, ...(sitio ? { sitio } : {}) })),
    doUsuario: false,
    grupo: 'sem-tradicao' as const,
  })
  const sua = (texto: string, sigla?: string) => ({ texto, tradicao: null, livros: sigla ? [{ sigla, pagina: null }] : [], doUsuario: true, grupo: 'sem-origem' as const })

  it('I1: a tradição de uma grafia do livro fica no sítio de que é cada linha (o destino ou o absorvido), no lugar da que havia', () => {
    expect(gravacaoDaGrafia(listas, livro('Tall et-Um', ['TESTE', '12', 'TESTE-1'], ['TESTE2', '4', 'TESTE-3']), { tradicao: 'biblica' })).toEqual([
      { id: 'TESTE-1', grafias: [listas[0]!.grafias[0], { texto: 'Tall et-Um', livro: 'TESTE', tradicao: 'biblica' }, { texto: 'Tel Velho' }] },
      { id: 'TESTE-3', grafias: [{ texto: 'Tall et-Um', livro: 'TESTE2', tradicao: 'biblica' }] },
    ])
    // uma grafia do livro de um absorvido: no registro dele, não no destino
    expect(gravacaoDaGrafia(listas, livro('Tel Três', ['TESTE2', '3', 'TESTE-3']), { tradicao: 'arabe' })).toEqual([
      { id: 'TESTE-3', grafias: [{ texto: 'Tel Três', livro: 'TESTE2', tradicao: 'arabe' }] },
    ])
  })

  it('I1: «sem origem» tira a entrada de todas as listas que a têm (com o livro da linha, ou sem livro: M3); a de outro livro fica, sem tradição', () => {
    const espalhadas = [
      { id: 'TESTE-1', grafias: [{ texto: 'Tall X', livro: 'TESTE', tradicao: 'arabe' as const }, { texto: 'tall x', tradicao: 'biblica' as const }] },
      { id: 'TESTE-3', grafias: [{ texto: 'Tall X', livro: 'TESTE2', tradicao: 'arabe' as const }, { texto: 'Tall X', livro: 'OUTRO', tradicao: 'arabe' as const }] },
    ]
    expect(gravacaoDaGrafia(espalhadas, livro('Tall X', ['TESTE', '4', 'TESTE-1'], ['TESTE2', '5', 'TESTE-3'], ['OUTRO', null]), { tradicao: null })).toEqual([
      { id: 'TESTE-1', grafias: [] },
      { id: 'TESTE-3', grafias: [{ texto: 'Tall X', livro: 'OUTRO' }] },
    ])
    // e uma mudança: cada linha no sítio dela; a de outro livro recebe a mesma tradição
    expect(gravacaoDaGrafia(espalhadas, livro('Tall X', ['TESTE', '4', 'TESTE-1'], ['TESTE2', '5', 'TESTE-3'], ['OUTRO', null]), { tradicao: 'inglesa' })).toEqual([
      { id: 'TESTE-1', grafias: [{ texto: 'Tall X', livro: 'TESTE', tradicao: 'inglesa' }] },
      { id: 'TESTE-3', grafias: [{ texto: 'Tall X', livro: 'TESTE2', tradicao: 'inglesa' }, { texto: 'Tall X', livro: 'OUTRO', tradicao: 'inglesa' }] },
    ])
  })

  it('uma grafia sua: muda a tradição ou o livro no registro do sítio que a tem; tirar a tira de todas as listas (M2)', () => {
    expect(gravacaoDaGrafia(listas, sua('Tel Velho'), { tradicao: 'hebraica-moderna' })).toEqual([
      { id: 'TESTE-1', grafias: [listas[0]!.grafias[0], listas[0]!.grafias[1], { texto: 'Tel Velho', tradicao: 'hebraica-moderna' }] },
    ])
    expect(gravacaoDaGrafia(listas, sua('Testheim', 'TESTE2'), { livro: null })).toEqual([
      { id: 'TESTE-1', grafias: [{ texto: 'Testheim', tradicao: 'alema' }, listas[0]!.grafias[1], { texto: 'Tel Velho' }] },
    ])
    expect(gravacaoDaGrafia(listas, sua('Tal Exemplo'), { tradicao: 'inglesa' })).toEqual([{ id: 'SI-aaaaaaaa-1', grafias: [{ texto: 'Tal Exemplo', tradicao: 'inglesa' }] }])
    const duas = [
      { id: 'TESTE-1', grafias: [{ texto: 'Tel X' }] },
      { id: 'SI-aaaaaaaa-1', grafias: [{ texto: 'tel x', tradicao: 'outra' as const }, { texto: 'Tel Y' }] },
    ]
    expect(gravacaoDaGrafia(duas, sua('Tel X'), { tirar: true })).toEqual([
      { id: 'TESTE-1', grafias: [] },
      { id: 'SI-aaaaaaaa-1', grafias: [{ texto: 'Tel Y' }] },
    ])
    // nada muda: nada a gravar
    expect(gravacaoDaGrafia(listas, sua('Tel Velho'), { tradicao: null })).toEqual([])
  })

  it('uma vista atrasada (o livro mudou numa gravação ainda não mostrada): a mudança vale para a entrada com o mesmo texto, sem duplicar', () => {
    const agora = [{ id: 'TESTE-1', grafias: [{ texto: 'Testheim', livro: 'TESTE', tradicao: 'alema' as const }] }]
    expect(gravacaoDaGrafia(agora, sua('Testheim', 'TESTE2'), { tradicao: 'inglesa' })).toEqual([{ id: 'TESTE-1', grafias: [{ texto: 'Testheim', livro: 'TESTE', tradicao: 'inglesa' }] }])
  })

  it('o nome de um absorvido seu: a tradição (ou o livro) fica no registro dele; tirar não vale; tirar uma do livro também não', () => {
    const nomeDe = { ...sua('Tell Exemplo'), nomeDe: 'SI-aaaaaaaa-1' }
    expect(gravacaoDaGrafia(listas, nomeDe, { tradicao: 'arabe' })).toEqual([{ id: 'SI-aaaaaaaa-1', grafias: [{ texto: 'Tal Exemplo', tradicao: 'outra' }, { texto: 'Tell Exemplo', tradicao: 'arabe' }] }])
    expect(gravacaoDaGrafia(listas, nomeDe, { livro: 'TESTE' })).toEqual([{ id: 'SI-aaaaaaaa-1', grafias: [{ texto: 'Tal Exemplo', tradicao: 'outra' }, { texto: 'Tell Exemplo', livro: 'TESTE' }] }])
    // já com uma entrada (depois de uma tradição): muda nela, no registro dele
    const comEntrada = [listas[0]!, { id: 'SI-aaaaaaaa-1', grafias: [{ texto: 'Tell Exemplo', tradicao: 'arabe' as const }] }]
    expect(gravacaoDaGrafia(comEntrada, { ...nomeDe, tradicao: 'arabe' }, { tradicao: 'inglesa' })).toEqual([{ id: 'SI-aaaaaaaa-1', grafias: [{ texto: 'Tell Exemplo', tradicao: 'inglesa' }] }])
    expect(gravacaoDaGrafia(listas, nomeDe, { tirar: true })).toEqual([])
    expect(gravacaoDaGrafia(listas, livro('Tall et-Um', ['TESTE', '12', 'TESTE-1']), { tirar: true })).toEqual([])
  })
})

describe('Tarefa 13, revisão 2: o que muda num sítio absorvido seu (N1, N2, N3), aplicando as gravações como eventos', () => {
  const doLivro = (sitio: string, texto: string, sigla: string, pagina: string): GrafiaDoPacote => ({ sitio, texto, tradicao: null, sigla, pagina, origem: 'livro' })
  /** Escolhe na vista `texto` do destino, grava como eventos e devolve o estado novo (o caminho de «Corrigir»). */
  const escolher = (eventos: ReturnType<typeof sit>[], p: PacoteDeSitios, destino: string, texto: string, m: MudancaDaGrafia, nome: (id: string) => string, nomeDoLivro?: (id: string) => string | null) => {
    const estado = fundir(eventos)
    const r = resolverSitios(estado, p)
    const v = grafiasDoSitio(r, destino, p, nome, nomeDoLivro).find((g) => g.texto === texto)!
    const listas = [destino, ...r.absorvidos(destino)].map((x) => ({ id: x, grafias: grafiasProprias(estado, p, x) }))
    const gravacoes = gravacaoDaGrafia(listas, v, m)
    for (const g of gravacoes) eventos.push(sit(A, g.id, { grafias: g.grafias.map((x) => ({ ...x })) }))
    return { estado: fundir(eventos), gravacoes, vista: v }
  }

  it('N1: a grafia sem livro de um sítio seu mesclado, com a chave de uma do livro do destino, sobrevive a «Árabe», «sem origem» e ao «desfazer»', () => {
    const p = pacote([1], { grafias: [doLivro('TESTE-1', 'Tall et-Um', 'TESTE', '12')] })
    const nomes: Record<string, string> = { 'TESTE-1': 'Tell Um', 'SI-aaaaaaaa-1': 'Tell Exemplo' }
    const nome = (id: string) => nomes[id] ?? id
    const eventos = [sit(A, 'SI-aaaaaaaa-1', { nome: 'Tell Exemplo', grafias: [{ texto: 'Tall et-Um' }, { texto: 'Tel Y' }] }, 'criar'), sit(A, 'SI-aaaaaaaa-1', { mescladoEm: 'TESTE-1' })]
    const arabe = escolher(eventos, p, 'TESTE-1', 'Tall et-Um', { tradicao: 'arabe' }, nome)
    expect(arabe.gravacoes).toEqual([
      { id: 'TESTE-1', grafias: [{ texto: 'Tall et-Um', livro: 'TESTE', tradicao: 'arabe' }] },
      { id: 'SI-aaaaaaaa-1', grafias: [{ texto: 'Tall et-Um', tradicao: 'arabe' }, { texto: 'Tel Y' }] },
    ])
    expect(grafiasProprias(arabe.estado, p, 'SI-aaaaaaaa-1').map((g) => g.texto)).toEqual(['Tall et-Um', 'Tel Y'])
    const sem = escolher(eventos, p, 'TESTE-1', 'Tall et-Um', { tradicao: null }, nome)
    expect(grafiasProprias(sem.estado, p, 'SI-aaaaaaaa-1')).toEqual([{ texto: 'Tall et-Um' }, { texto: 'Tel Y' }])
    expect(grafiasProprias(sem.estado, p, 'TESTE-1')).toEqual([])
    eventos.push(sit(A, 'SI-aaaaaaaa-1', { mescladoEm: null }))
    const r = resolverSitios(fundir(eventos), p)
    expect(r.grafiasDoUsuario('SI-aaaaaaaa-1')).toEqual([{ texto: 'Tall et-Um' }, { texto: 'Tel Y' }])
    expect(r.grafiasDoUsuario('TESTE-1')).toEqual([])
  })

  // R1: nas listas que não são do sítio dono da linha nada sai, qualquer que seja o livro da entrada; só a tradição muda
  it.each([
    {
      caso: 'o sítio seu absorvido tem «Tall et-Um» com o livro da linha (TESTE)',
      sitios: [1],
      linha: doLivro('TESTE-1', 'Tall et-Um', 'TESTE', '12'),
      absorvido: 'SI-aaaaaaaa-1',
      criar: [sit(A, 'SI-aaaaaaaa-1', { nome: 'Tell Exemplo', grafias: [{ texto: 'Tall et-Um', livro: 'TESTE' }, { texto: 'Tel Y' }] }, 'criar')],
      fora: 'SI-aaaaaaaa-1',
      dono: 'TESTE-1',
      antes: [{ texto: 'Tall et-Um', livro: 'TESTE' }, { texto: 'Tel Y' }],
    },
    {
      caso: 'livro → livro: o absorvido TESTE-3 tem a grafia da pessoa com o livro TESTE; a linha é do destino',
      sitios: [1, 3],
      linha: doLivro('TESTE-1', 'Tall et-Um', 'TESTE', '12'),
      absorvido: 'TESTE-3',
      criar: [sit(A, 'TESTE-3', { grafias: [{ texto: 'Tall et-Um', livro: 'TESTE' }] })],
      fora: 'TESTE-3',
      dono: 'TESTE-1',
      antes: [{ texto: 'Tall et-Um', livro: 'TESTE' }],
    },
    {
      caso: 'ao contrário: a linha é do absorvido TESTE-3; o destino tem a grafia da pessoa com o livro TESTE',
      sitios: [1, 3],
      linha: doLivro('TESTE-3', 'Tall et-Um', 'TESTE', '4'),
      absorvido: 'TESTE-3',
      criar: [sit(A, 'TESTE-1', { grafias: [{ texto: 'Tall et-Um', livro: 'TESTE' }] })],
      fora: 'TESTE-1',
      dono: 'TESTE-3',
      antes: [{ texto: 'Tall et-Um', livro: 'TESTE' }],
    },
  ])('R1: $caso — sobrevive a «Árabe», «sem origem» e ao «desfazer»', ({ sitios, linha, absorvido, criar, fora, dono, antes }) => {
    const p = pacote(sitios, { grafias: [linha] })
    const nomes: Record<string, string> = { 'TESTE-1': 'Tell Um', 'TESTE-3': 'Tel Tres', 'SI-aaaaaaaa-1': 'Tell Exemplo' }
    const nome = (id: string) => nomes[id] ?? id
    const nomeDoLivro = (id: string) => (id.startsWith('SI-') ? null : (nomes[id] ?? null))
    const comTradicao = (t: string | null) => antes.map((g) => (g.texto === 'Tall et-Um' ? { ...g, ...(t ? { tradicao: t } : {}) } : g))
    const eventos = [...criar, sit(A, absorvido, { mescladoEm: 'TESTE-1' })]
    const arabe = escolher(eventos, p, 'TESTE-1', 'Tall et-Um', { tradicao: 'arabe' }, nome, nomeDoLivro)
    expect(grafiasProprias(arabe.estado, p, fora)).toEqual(comTradicao('arabe'))
    expect(grafiasProprias(arabe.estado, p, dono)).toEqual([{ texto: 'Tall et-Um', livro: 'TESTE', tradicao: 'arabe' }])
    expect(grafiasDoSitio(resolverSitios(arabe.estado, p), 'TESTE-1', p, nome, nomeDoLivro).filter((g) => g.texto === 'Tall et-Um')).toEqual([
      expect.objectContaining({ tradicao: 'arabe', doUsuario: false }),
    ])
    const sem = escolher(eventos, p, 'TESTE-1', 'Tall et-Um', { tradicao: null }, nome, nomeDoLivro)
    expect(grafiasProprias(sem.estado, p, fora)).toEqual(comTradicao(null))
    expect(grafiasProprias(sem.estado, p, dono)).toEqual([])
    // «sem origem» fica: nenhuma lista guarda a tradição
    expect(grafiasDoSitio(resolverSitios(sem.estado, p), 'TESTE-1', p, nome, nomeDoLivro).find((g) => g.texto === 'Tall et-Um')).toMatchObject({ tradicao: null })
    eventos.push(sit(A, absorvido, { mescladoEm: null }))
    expect(grafiasProprias(fundir(eventos), p, fora)).toEqual(comTradicao(null))
    // e depois de «Árabe», o «desfazer» também a deixa no sítio dela, com a tradição dada
    const deNovo = [...criar, sit(A, absorvido, { mescladoEm: 'TESTE-1' })]
    escolher(deNovo, p, 'TESTE-1', 'Tall et-Um', { tradicao: 'arabe' }, nome, nomeDoLivro)
    deNovo.push(sit(A, absorvido, { mescladoEm: null }))
    expect(grafiasProprias(fundir(deNovo), p, fora)).toEqual(comTradicao('arabe'))
  })

  it('N2: a grafia sua do destino com a chave do nome de um absorvido: a mudança fica nela, e o × a tira (o nome do absorvido fica)', () => {
    const p = pacote([1])
    const nomes: Record<string, string> = { 'TESTE-1': 'Tell Um', 'SI-aaaaaaaa-1': 'Tell Exemplo' }
    const nome = (id: string) => nomes[id] ?? id
    const eventos = [
      sit(A, 'TESTE-1', { grafias: [{ texto: 'Tell Exemplo', tradicao: 'inglesa' }] }),
      sit(A, 'SI-aaaaaaaa-1', { nome: 'Tell Exemplo' }, 'criar'),
      sit(A, 'SI-aaaaaaaa-1', { mescladoEm: 'TESTE-1' }),
    ]
    const arabe = escolher(eventos, p, 'TESTE-1', 'Tell Exemplo', { tradicao: 'arabe' }, nome)
    expect(arabe.gravacoes).toEqual([{ id: 'TESTE-1', grafias: [{ texto: 'Tell Exemplo', tradicao: 'arabe' }] }])
    expect(grafiasDoSitio(resolverSitios(arabe.estado, p), 'TESTE-1', p, nome).find((g) => g.texto === 'Tell Exemplo')).toMatchObject({ tradicao: 'arabe', nomeDe: 'SI-aaaaaaaa-1' })
    const tirada = escolher(eventos, p, 'TESTE-1', 'Tell Exemplo', { tirar: true }, nome)
    expect(tirada.gravacoes).toEqual([{ id: 'TESTE-1', grafias: [] }])
    // o nome do absorvido continua, sem origem; e agora não há o que tirar (a tela não mostra o ×)
    const depois = grafiasDoSitio(resolverSitios(tirada.estado, p), 'TESTE-1', p, nome).find((g) => g.texto === 'Tell Exemplo')!
    expect(depois).toMatchObject({ tradicao: null, doUsuario: true, nomeDe: 'SI-aaaaaaaa-1' })
    const listas = [{ id: 'TESTE-1', grafias: grafiasProprias(tirada.estado, p, 'TESTE-1') }, { id: 'SI-aaaaaaaa-1', grafias: grafiasProprias(tirada.estado, p, 'SI-aaaaaaaa-1') }]
    expect(gravacaoDaGrafia(listas, depois, { tirar: true })).toEqual([])
  })

  it.each([
    ['pacote 7', [] as GrafiaDoPacote[]],
    ['pacote 8', [doLivro('TESTE-1', 'Tell Um', 'TESTE', '1')]],
  ])('N3 (%s): um sítio seu publicado com id de livro (SI-… → TESTE-91), mesclado num do livro: o nome continua seu («SKC»), e a tradição não leva livro', (_n, grafias) => {
    const p = pacote([1, 91], { publicados: { 'SI-aaaaaaaa-1': 'TESTE-91' }, criados: ['TESTE-91'], grafias })
    const nomes: Record<string, string> = { 'TESTE-1': 'Tell Um', 'TESTE-91': 'Tell Usuário Teste' }
    const nome = (id: string) => nomes[id] ?? id
    const eventos = [sit(A, 'SI-aaaaaaaa-1', { nome: 'Tell Usuário Teste' }, 'criar'), sit(A, 'TESTE-91', { mescladoEm: 'TESTE-1' })]
    const r = resolverSitios(fundir(eventos), p)
    expect(r.absorvidos('TESTE-1')).toEqual(['TESTE-91'])
    // o nome da linha do pub é o seu (o build o copia): sem `publicados`, pareceria um nome do livro
    const vistas = grafiasDoSitio(r, 'TESTE-1', p, nome, (id) => nomes[id] ?? null)
    expect(vistas).toEqual([{ texto: 'Tell Usuário Teste', tradicao: null, livros: [], doUsuario: true, grupo: 'sem-origem', nomeDe: 'TESTE-91' }])
    const arabe = escolher(eventos, p, 'TESTE-1', 'Tell Usuário Teste', { tradicao: 'arabe' }, nome, (id) => nomes[id] ?? null)
    expect(arabe.gravacoes).toEqual([{ id: 'TESTE-91', grafias: [{ texto: 'Tell Usuário Teste', tradicao: 'arabe' }] }])
    expect(relacoesDe(resolverSitios(arabe.estado, p)).grafias).toEqual({ 'TESTE-1': [{ texto: 'Tell Usuário Teste', tradicao: 'arabe', livro: null }] })
  })

  it('N3, «criado 0»: um sítio do livro a que um SI-… só leva (TESTE-2), mesclado num do livro: o nome dele é grafia do livro, sem «SKC»', () => {
    const p = pacote([1, 2], { publicados: { 'SI-aaaaaaaa-2': 'TESTE-2' } }) // sem `criados`: TESTE-2 já era do livro
    const nomes: Record<string, string> = { 'TESTE-1': 'Tell Um', 'TESTE-2': 'Tell Probe Teste' }
    const nome = (id: string) => nomes[id] ?? id
    const r = resolverSitios(fundir([sit(A, 'SI-aaaaaaaa-2', { nome: 'Tell Probe Teste' }, 'criar'), sit(A, 'TESTE-2', { mescladoEm: 'TESTE-1' })]), p)
    expect(r.absorvidos('TESTE-1')).toEqual(['TESTE-2'])
    expect(r.eDoUsuario('TESTE-2')).toBe(false)
    const vistas = grafiasDoSitio(r, 'TESTE-1', p, nome, (id) => nomes[id] ?? null)
    expect(vistas).toEqual([expect.objectContaining({ texto: 'Tell Probe Teste', doUsuario: false, grupo: 'sem-tradicao', livros: [{ sigla: 'TESTE', pagina: null, sitio: 'TESTE-2' }] })])
  })
})

