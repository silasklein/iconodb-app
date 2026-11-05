/// <reference types="node" />
/**
 * Vetores de teste da fusão: tests/fixtures/fusao-vetores.json. A Tarefa 16 porta a fusão para Python
 * e tem de reproduzir exatamente estes estados canônicos. O arquivo é gerado a partir dos casos abaixo:
 *
 *   ATUALIZAR_VETORES=1 npx vitest run src/usuario/fusao.vetores.test.ts
 *
 * Sem a variável, o teste confere que o arquivo bate com os casos E com a implementação.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { A, B, C, embaralhar, ev, eventosAleatorios, gerador, hlc, HORA, MINUTO, T0 } from '../../tests/suporte/eventosDeTeste'
import { consolidar, estadoCanonico, fundir, validarBase, type EstadoConsolidado } from './fusao'
import { LIMITE_MS, novoHlc, receberHlc, TETO_MS } from './hlc'

const ARQUIVO = join(import.meta.dirname, '..', '..', 'tests', 'fixtures', 'fusao-vetores.json')
/**
 * O sha256 do arquivo (revisão 3 da Tarefa 16, m-V): o MESMO valor está no teste do repositório privado, que falha se a
 * cópia de lá não for esta. Ao regenerar, troque aqui e lá (o teste mostra o valor novo) e copie o arquivo.
 */
const SHA256_DO_ARQUIVO = '57a058a0a8aeb0f2a40895a27d1f7e00cc4e04afab1ebf4d7baeaac309821fe7'

interface Caso {
  nome: string
  descricao: string
  /** Uma base (estado.json) ou várias (a união delas). */
  base?: EstadoConsolidado | EstadoConsolidado[]
  eventos: unknown[]
  estado: string
}

const CO = 'CO-aaaaaaaa-1'

function casos(): Caso[] {
  const lista: Array<Omit<Caso, 'estado'>> = []
  const caso = (nome: string, descricao: string, eventos: unknown[], base?: EstadoConsolidado | EstadoConsolidado[]) => lista.push({ nome, descricao, ...(base ? { base } : {}), eventos })

  const criar = ev({ ap: A, seq: 1, ms: T0, op: 'criar', campos: { titulo: 'Nota', texto: 'Texto' } })
  caso('por-campo', 'A muda o título e B muda o texto da mesma nota: os dois ficam.', [
    ev({ ap: B, seq: 1, ms: T0 + 5 * MINUTO, campos: { texto: 'Texto de B' } }),
    criar,
    ev({ ap: A, seq: 2, ms: T0 + 10 * MINUTO, campos: { titulo: 'Título de A' } }),
  ])

  caso('mesmo-campo', 'Vence o maior hlc; os anteriores ficam no histórico em ordem de hlc.', [
    ev({ ap: C, seq: 1, ms: T0 + 3, campos: { titulo: 'quatro' } }),
    ev({ ap: B, seq: 1, ms: T0 + 1, campos: { titulo: 'dois' } }),
    ev({ ap: A, seq: 2, ms: T0 + 2, campos: { titulo: 'um' } }),
    ev({ ap: A, seq: 1, ms: T0, campos: { titulo: 'um' } }),
  ])

  caso('empates', 'Mesmo milissegundo: o contador desempata; mesmo contador: o id do aparelho no hlc.', [
    ev({ ap: B, seq: 1, ms: T0, c: 0, campos: { a: 'B0' } }),
    ev({ ap: A, seq: 1, ms: T0, c: 1, campos: { a: 'A1', b: 'A1' } }),
    ev({ ap: B, seq: 2, ms: T0, c: 1, campos: { b: 'B1' } }),
  ])

  const hCriar = novoHlc(null, T0, A)
  const hB = novoHlc(null, T0 + MINUTO + HORA, B)
  const hA = novoHlc(receberHlc(hCriar, hB, T0 + 2 * MINUTO), T0 + 3 * MINUTO, A)
  caso('relogio-adiantado', 'B está 1 h adiantado; A edita depois de receber o evento de B e vence (Foco 3).', [
    ev({ ap: A, seq: 2, h: hA, campos: { titulo: 'Edição de A (nova)' } }),
    ev({ ap: B, seq: 1, h: hB, campos: { titulo: 'Edição de B (velha)' } }),
    ev({ ap: A, seq: 1, h: hCriar, op: 'criar', campos: { titulo: 'Original' } }),
  ])

  const excluir = ev({ seq: 2, ms: T0 + 1000, op: 'excluir' })
  const restaurar = ev({ seq: 3, ms: T0 + 2000, op: 'restaurar' })
  const criarX = ev({ seq: 1, ms: T0, op: 'criar', campos: { titulo: 'x' } })
  caso('excluir', 'Excluir é uma marca: o registro e os campos continuam.', [excluir, criarX])
  caso('excluir-restaurar', 'Excluir e depois restaurar volta o registro.', [restaurar, criarX, excluir])
  caso('restaurar-excluir', 'A marca de maior hlc entre excluir e restaurar decide.', [restaurar, ev({ seq: 4, ms: T0 + 3000, op: 'excluir' }), criarX, excluir])
  caso('editar-depois-de-excluir', 'Uma edição depois de excluir não desfaz a exclusão, mas fica nos campos.', [
    ev({ ap: B, seq: 1, ms: T0 + 1500, campos: { titulo: 'editado' } }),
    excluir,
    criarX,
  ])
  caso('so-exclusao', 'Um registro só com evento de exclusão existe, excluído e sem campos.', [ev({ ap: B, seq: 1, tipo: 'colecao', reg: CO, op: 'excluir' })])

  caso('nulo-e-ausente', 'null é um valor (limpa o campo); um campo nunca escrito fica ausente.', [
    ev({ seq: 1, ms: T0, op: 'criar', campos: { texto: 'a' } }),
    ev({ seq: 2, ms: T0 + 1, campos: { texto: null } }),
  ])

  caso('colecao-ordem', 'A ordem de uma coleção é uma lista inteira: vence a do maior hlc (Foco 1).', [
    ev({ ap: B, seq: 1, ms: T0 + HORA + 1, tipo: 'colecao', reg: CO, campos: { itens: ['IT-2', 'IT-3'] } }),
    ev({ ap: A, seq: 1, ms: T0, tipo: 'colecao', reg: CO, op: 'criar', campos: { nome: 'Íbex', itens: ['IT-1', 'IT-2', 'IT-3'] } }),
    ev({ ap: A, seq: 2, ms: T0 + HORA, tipo: 'colecao', reg: CO, campos: { itens: ['IT-3', 'IT-1', 'IT-2'] } }),
  ])

  caso('mesmo-reg-tipos', 'O mesmo reg em tipos diferentes são registros diferentes.', [
    ev({ seq: 1, tipo: 'posicao', reg: 'IT-0001', campos: { x: 0.25, y: 0.5 } }),
    ev({ seq: 2, tipo: 'revisao', reg: 'IT-0001', campos: { estado: 'aprovado' } }),
  ])

  const bom = ev({ seq: 1, op: 'criar', campos: { titulo: 'ok' } })
  caso('malformados', 'Eventos malformados ou de versão desconhecida são ignorados e contados (ignorados = 13).', [
    { ...ev({ seq: 2, campos: { titulo: 'v2' } }), v: 2 },
    { ...ev({ seq: 3 }), v: '1' },
    { ...ev({ seq: 4 }), v: true },
    { ...ev({ seq: 5 }), hlc: 'lixo' },
    { ...ev({ seq: 6 }), hlc: hlc(T0, 0, B) },
    { ...ev({ seq: 7 }), id: `${B}-7-0` },
    { ...ev({ seq: 8 }), tipo: 'livro' },
    { ...ev({ seq: 9 }), op: 'apagar' },
    { ...ev({ seq: 10 }), reg: '' },
    { ...ev({ seq: 11 }), campos: [] },
    null,
    'texto',
    [bom],
    bom,
    { ...ev({ seq: 12, campos: { extra: 'aceito' } }), chaveDesconhecida: 1 },
  ])

  const e1 = ev({ seq: 1, ms: T0, campos: { titulo: 'um' } })
  caso('id-repetido', 'Mesmo id com conteúdo diferente (corrompido), mesmo hlc: vence a cópia inteira de maior JSON canônico (por ponto de código); não há união de campos.', [{ ...e1, campos: { titulo: 'dois', outro: 1 } }, e1])
  const original = ev({ seq: 1, ms: T0, op: 'alterar', campos: { titulo: 'original' } })
  caso('id-repetido-hlc-op', 'Mesmo id, cópia com hlc maior e outra op (excluir): vence a de maior hlc, em qualquer ordem.', [
    { ...original, hlc: hlc(T0 + 5, 0, A), op: 'excluir', campos: {} },
    original,
    ev({ seq: 2, ms: T0 + 9, campos: { texto: 'depois' } }),
  ])

  const aleatorios = eventosAleatorios(7, 120)
  caso('repetidos', 'Eventos repetidos não mudam nada (idempotência).', embaralhar([...aleatorios.slice(0, 40), ...aleatorios.slice(0, 40), ...aleatorios.slice(5, 15)], gerador(8)))
  caso('aleatorio', '120 eventos de 3 aparelhos, embaralhados (o porte deve dar o mesmo estado para qualquer permutação).', embaralhar(aleatorios, gerador(9)))
  caso(
    'base-mais-eventos',
    'Base consolidada (estado.json) com os 70 primeiros eventos + os eventos 50 a 119 (repetindo 20 da base): igual à fusão de tudo.',
    embaralhar(aleatorios.slice(50), gerador(10)),
    consolidar(fundir(aleatorios.slice(0, 70))),
  )

  caso('varias-bases', 'Duas bases (a união delas) + eventos que repetem parte delas: igual à fusão de tudo.', embaralhar(aleatorios.slice(60, 120), gerador(11)), [
    consolidar(fundir(aleatorios.slice(0, 50))),
    consolidar(fundir(aleatorios.slice(30, 80))),
  ])

  caso('chaves-e-numeros', 'Chaves ordenadas por ponto de código (U+FF01 antes de U+1F600); números como o JavaScript os escreve (5e-7, não 5e-07).', [
    ev({ seq: 1, campos: { '\u{1F600}': 1, '！': { z: [0.1, 1.5, 5e-7, -3, 9007199254740991, -9007199254740991, 1e-300], a: 'Maḥteṣ 𝔸' }, Z: true, a: false } }),
  ])
  caso('numeros-grandes', 'Números com módulo acima de 2^53 − 1 (9007199254740991) tornam o evento inválido (motivo numero; ignorados = 4).', [
    ev({ seq: 1, campos: { n: 9007199254740991 } }),
    ev({ seq: 2, campos: { n: 9007199254740992 } }),
    ev({ seq: 3, campos: { n: [-9007199254740992] } }),
    ev({ seq: 4, campos: { n: { m: 1e21 } } }),
    ev({ seq: 5, campos: { n: 1.7976931348623157e308 } }),
  ])
  caso('controle', 'Textos e chaves com caracteres de controle: escapados como JSON.stringify (\\u0000, \\n…); U+007F, U+2028 e "/" ficam crus.', [
    ev({ seq: 1, campos: { 'a\nb': '\u0000\u0001\u001f\u007f\b\f\n\r\t  "\\/', '\t': ['\u0000'] } }),
  ])
  caso('hlc-limites', 'hlc com ms acima de LIMITE_MS (2250-01-01 = 8835955200000) é inválido (ignorados = 2); até o limite, mesmo acima de TETO_MS (2200), é válido.', [
    ev({ seq: 1, h: '9999999999999-9999-aaaaaaaa', campos: { a: 'absurdo' } }),
    ev({ seq: 2, h: hlc(LIMITE_MS + 1, 0, A), campos: { a: 'além do limite' } }),
    ev({ seq: 3, h: hlc(LIMITE_MS, 0, A), campos: { b: 'no limite' } }),
    ev({ seq: 4, h: hlc(TETO_MS + 1, 0, A), campos: { a: 'além do teto' } }),
    ev({ seq: 5, ms: T0, campos: { a: 'agora' } }),
  ])

  return lista.map((c) => ({ ...c, estado: estadoCanonico(fundir(c.eventos, c.base)) }))
}

describe('vetores da fusão (tests/fixtures/fusao-vetores.json)', () => {
  const gerados = casos()
  const texto = `${JSON.stringify(gerados, null, 2)}\n`
  if (process.env.ATUALIZAR_VETORES) writeFileSync(ARQUIVO, texto)

  it('o arquivo existe e bate com os casos (gere com ATUALIZAR_VETORES=1)', () => {
    expect(existsSync(ARQUIVO)).toBe(true)
    expect(readFileSync(ARQUIVO, 'utf8')).toBe(texto)
  })

  it('o sha256 do arquivo é o fixado (o mesmo do teste do repositório privado)', () => {
    expect(createHash('sha256').update(readFileSync(ARQUIVO)).digest('hex')).toBe(SHA256_DO_ARQUIVO)
  })

  it('cada caso do arquivo, lido como JSON, dá o estado canônico gravado', () => {
    const doArquivo = JSON.parse(readFileSync(ARQUIVO, 'utf8')) as Caso[]
    expect(doArquivo.length).toBeGreaterThanOrEqual(23)
    for (const c of doArquivo) {
      const bases = c.base === undefined ? [] : Array.isArray(c.base) ? c.base : [c.base]
      const validas = bases.map((b) => validarBase(b))
      for (const v of validas) expect(v?.ignorados, c.nome).toBe(0)
      expect(estadoCanonico(fundir(c.eventos, validas.map((v) => v!.base))), c.nome).toBe(c.estado)
    }
  })

  it('cobre as regras: os casos têm os efeitos esperados', () => {
    const porNome = new Map(casos().map((c) => [c.nome, JSON.parse(c.estado) as { ignorados: number; registros: Array<{ id: string; exclusao: { op: string } | null; campos: Record<string, unknown[]> }> }]))
    expect(porNome.get('malformados')!.ignorados).toBe(13)
    expect(porNome.get('numeros-grandes')!.ignorados).toBe(4)
    expect(porNome.get('hlc-limites')!.ignorados).toBe(2)
    expect(porNome.get('id-repetido')!.registros[0]!.campos).not.toHaveProperty('outro')
    expect(porNome.get('id-repetido-hlc-op')!.registros[0]!.exclusao!.op).toBe('excluir')
    expect(porNome.get('varias-bases')!.registros).toEqual(JSON.parse(estadoCanonico(fundir(eventosAleatorios(7, 120)))).registros)
    expect(porNome.get('excluir')!.registros[0]!.exclusao!.op).toBe('excluir')
    expect(porNome.get('excluir-restaurar')!.registros[0]!.exclusao!.op).toBe('restaurar')
    expect(porNome.get('mesmo-campo')!.registros[0]!.campos.titulo).toHaveLength(4)
    const tudo = estadoCanonico(fundir(eventosAleatorios(7, 120)))
    expect(casos().find((c) => c.nome === 'aleatorio')!.estado).toBe(tudo)
    expect(JSON.parse(casos().find((c) => c.nome === 'base-mais-eventos')!.estado).registros).toEqual(JSON.parse(tudo).registros)
    expect(JSON.parse(casos().find((c) => c.nome === 'repetidos')!.estado)).toEqual(JSON.parse(estadoCanonico(fundir(eventosAleatorios(7, 120).slice(0, 40)))))
  })
})
