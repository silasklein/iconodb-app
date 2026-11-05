/// <reference types="node" />
/**
 * Vetores de teste da numeração dos objetos SKC (passos 1–5 de `numerar`, com a decisão 48 e a chave `LIVRO:<id>` da
 * revisão 2 da Tarefa 16): tests/fixtures/numerar-vetores.json. O porte em Python (`iconodb/usuario.py`, `numerar`) lê o
 * MESMO arquivo, copiado byte a byte para `tests/fixtures/` do repositório privado, e tem de dar o mesmo resultado em cada
 * caso. O arquivo é gerado a partir dos casos abaixo:
 *
 *   ATUALIZAR_VETORES=1 npx vitest run src/objetos-skc/numerar.vetores.test.ts
 *
 * Sem a variável, o teste confere que o arquivo bate com os casos E com a implementação.
 * O resultado de cada caso tem só o que o porte calcula: por id, `numero`, `situacao`, `periodo`, `conflito`, `reserva` e
 * `numeroTomadoPeloLivro`; e `maiores` (período → maior n ocupado). O SKC, Nr. (passos 6–9) não é portado.
 *
 * O arquivo é `{ "numerar": [...], "uniao": [...] }`. O bloco `uniao` (Tarefa 17, D-8) traz pares de mapas de confirmados
 * e a união deles (`unirConfirmados`, `unir_confirmados` no porte): o menor número por id de objeto, o menor inteiro nas
 * chaves `SKC:<id>`, o MAIOR número nas chaves `LIVRO:<id>`, e nada das entradas malformadas. A união vale nos dois
 * sentidos (a ∪ b = b ∪ a).
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Evento, Json } from '../usuario/eventos'
import { fundir } from '../usuario/fusao'
import { A, B, C, T0, ev, gerador } from '../../tests/suporte/eventosDeTeste'
import { chaveDoNrSkc, chaveDoNumeroNovo, formatarNumero, numerar, unirConfirmados } from './numeracao'

const ARQUIVO = join(import.meta.dirname, '..', '..', 'tests', 'fixtures', 'numerar-vetores.json')
/**
 * O sha256 do arquivo (revisão 3 da Tarefa 16, m-V): o MESMO valor está no teste do repositório privado, que falha se a
 * cópia de lá não for esta. Ao regenerar, troque aqui e lá (o teste mostra o valor novo) e copie o arquivo.
 */
const SHA256_DO_ARQUIVO = '00db81646ec838d40c906e9e9ba5cbd3f3c01c6a07096754062169c2f86e5ffa'

interface Resultado {
  porId: Record<string, { numero: string | null; situacao: string; periodo: string | null; conflito: string | null; reserva: string | null; numeroTomadoPeloLivro: string | null }>
  maiores: Record<string, number>
}
interface Caso {
  nome: string
  descricao: string
  eventos: Evento[]
  pacote: string[]
  confirmados: Record<string, string>
  resultado: Resultado
}
interface CasoDeUniao {
  nome: string
  descricao: string
  a: Record<string, string>
  b: Record<string, string>
  uniao: Record<string, string>
}
interface Arquivo {
  numerar: Caso[]
  uniao: CasoDeUniao[]
}

const ca = (n: number) => formatarNumero('CA', n)
const pacoteCa = (ate: number) => Array.from({ length: ate }, (_, i) => ca(i + 1))

function resultadoDe(eventos: Evento[], pacote: string[], confirmados: Record<string, string>): Resultado {
  const n = numerar(fundir(eventos), new Set(pacote), confirmados)
  const porId: Resultado['porId'] = {}
  for (const [id, i] of n.porId) {
    porId[id] = { numero: i.numero, situacao: i.situacao, periodo: i.periodo, conflito: i.conflito, reserva: i.reserva, numeroTomadoPeloLivro: i.numeroTomadoPeloLivro }
  }
  const maiores = Object.fromEntries([...n.maiores].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))
  return { porId, maiores }
}

function casos(): Caso[] {
  const lista: Caso[] = []
  const caso = (nome: string, descricao: string, eventos: Evento[], pacote: string[], confirmados: Record<string, string> = {}) =>
    lista.push({ nome, descricao, eventos, pacote, confirmados, resultado: resultadoDe(eventos, pacote, confirmados) })

  let seq = 0
  const e = (ap: string, ms: number, reg: string, op: 'criar' | 'alterar' | 'excluir' | 'restaurar', campos: Record<string, Json> = {}) =>
    ev({ ap, seq: ++seq, ms: T0 + ms, tipo: 'objeto', reg, op, campos })

  const oA = `OB-${A}-1`
  const oB = `OB-${B}-1`
  const oC = `OB-${C}-1`

  caso('provisorios', 'Dois pedidos sem confirmação: o de hlc menor fica com o número mais baixo.', [e(B, 2, oB, 'criar', { periodo: 'CA' }), e(A, 1, oA, 'criar', { periodo: 'CA' })], pacoteCa(45))
  caso('confirmado-pelo-mapa', 'O mapa confirma; um pedido mais antigo que chega depois não toma o número.', [e(A, 5, oA, 'criar', { periodo: 'CA' }), e(B, 1, oB, 'criar', { periodo: 'CA' })], pacoteCa(45), { [oA]: ca(46) })
  caso('testemunha', 'A testemunha (`numero`) vence o mapa.', [e(A, 1, oA, 'criar', { periodo: 'CA' }), e(A, 2, oA, 'alterar', { numero: ca(50) })], pacoteCa(45), { [oA]: ca(46) })
  caso('rascunho-e-excluido', 'Sem período: rascunho; excluído sem confirmação: sem número; excluído confirmado guarda o seu.', [
    e(A, 1, oA, 'criar', { periodo: null }),
    e(B, 2, oB, 'criar', { periodo: 'CA' }),
    e(B, 3, oB, 'excluir'),
    e(C, 4, oC, 'criar', { periodo: 'CA' }),
    e(C, 5, oC, 'excluir'),
  ], pacoteCa(45), { [oC]: ca(46) })
  caso('id-sem-registro', 'Um id do mapa sem registro ocupa o número.', [e(A, 1, oA, 'criar', { periodo: 'CA' })], pacoteCa(45), { 'OB-dddddddd-3': ca(46) })
  caso('conflito-skc', 'Dois confirmados com o mesmo número (falha dupla): fica o de menor (hlc, id).', [
    e(A, 1, oA, 'criar', { periodo: 'CA' }),
    e(B, 2, oB, 'criar', { periodo: 'CA' }),
    e(A, 3, oA, 'alterar', { numero: ca(46) }),
    e(B, 4, oB, 'alterar', { numero: ca(46) }),
  ], pacoteCa(45))
  caso('reserva', 'A reserva do livro (aparelho pipeline) ocupa o número e não conflita com o pacote que a cumpre.', [
    e('pipeline', 1, 'OB-pipeline-1', 'criar', { periodo: 'CA', reserva: 'TESTE II' }),
    e(A, 2, oA, 'criar', { periodo: 'CA' }),
  ], pacoteCa(46), { 'OB-pipeline-1': ca(46) })
  caso('reserva-pelo-id', 'Só a testemunha da reserva chegou (sem o criar): o id OB-pipeline- basta.', [e(B, 3, 'OB-pipeline-2', 'alterar', { numero: ca(47) })], pacoteCa(47))
  caso('sem-numero', 'Acima de 99999 o pedido fica sem número.', [e(A, 1, oA, 'criar', { periodo: 'RO' })], [formatarNumero('RO', 99999)])
  caso('livro-toma', 'Decisão 48: o livro toma um número confirmado; o objeto ganha um provisório (conflito livro).', [
    e(A, 1, oA, 'criar', { periodo: 'CA', pedido: ca(46) }),
    e(A, 2, oA, 'alterar', { numero: ca(46) }),
    e(B, 3, oB, 'criar', { periodo: 'CA' }),
  ], pacoteCa(47), { [oA]: ca(46) })
  caso('livro-testemunha-nova', 'Decisão 48: depois da testemunha nova, o número novo é confirmado e não anda.', [
    e(A, 1, oA, 'criar', { periodo: 'CA', pedido: ca(46) }),
    e(A, 2, oA, 'alterar', { numero: ca(46) }),
    e(B, 3, oA, 'alterar', { numero: ca(48), numeroTomadoPeloLivro: ca(46) }),
    e(B, 4, oB, 'criar', { periodo: 'CA' }),
  ], pacoteCa(47), { [oA]: ca(46) })
  caso('livro-chave-no-mapa', 'Revisão 2 (I3): sem a testemunha nova, a chave LIVRO:<id> do mapa dá o mesmo número novo.', [
    e(A, 1, oA, 'criar', { periodo: 'CA', pedido: ca(46) }),
    e(A, 2, oA, 'alterar', { numero: ca(46) }),
    e(B, 4, oB, 'criar', { periodo: 'CA' }),
  ], pacoteCa(47), { [oA]: ca(46), [chaveDoNumeroNovo(oA)]: ca(48), [oB]: ca(49), [chaveDoNrSkc(oA)]: '1' })
  caso('livro-chave-sem-testemunha', 'Revisão 2: o mapa sem testemunha nenhuma, com a chave LIVRO:<id>.', [e(A, 1, oA, 'criar', { periodo: 'CA' })], pacoteCa(47), {
    [oA]: ca(46),
    [chaveDoNumeroNovo(oA)]: ca(48),
  })
  caso('livro-chave-pacote-velho', 'Revisão 2: sem o livro tomar o número (pacote velho), a chave não vale.', [e(A, 1, oA, 'criar', { periodo: 'CA' })], pacoteCa(45), {
    [oA]: ca(46),
    [chaveDoNumeroNovo(oA)]: ca(48),
  })
  caso('livro-chave-pacote-velho-outro', 'Revisão 3 (m-I3a): pacote velho; o número novo da chave LIVRO:<id> já está ocupado, e outro objeto do período recebe o seguinte.', [
    e(A, 1, oA, 'criar', { periodo: 'CA' }),
    e(B, 4, oB, 'criar', { periodo: 'CA' }),
  ], pacoteCa(46), { [oA]: ca(47), [chaveDoNumeroNovo(oA)]: ca(48) })
  caso('livro-chave-pacote-novo-outro', 'Revisão 3 (m-I3a): o mesmo, com o pacote novo: o objeto fica com o número novo e o outro mantém o seu.', [
    e(A, 1, oA, 'criar', { periodo: 'CA' }),
    e(B, 4, oB, 'criar', { periodo: 'CA' }),
  ], pacoteCa(47), { [oA]: ca(47), [chaveDoNumeroNovo(oA)]: ca(48), [oB]: ca(49) })
  caso('livro-toma-os-dois', 'Revisão 2: um livro toma também o número novo (falha dupla): conflito livro sobre o número novo.', [e(A, 1, oA, 'criar', { periodo: 'CA' })], pacoteCa(48), {
    [oA]: ca(46),
    [chaveDoNumeroNovo(oA)]: ca(48),
  })
  caso('livro-chave-reserva', 'Revisão 2: uma reserva nunca usa a chave LIVRO:<id>.', [e('pipeline', 1, 'OB-pipeline-1', 'criar', { periodo: 'CA', reserva: 'TESTE II' })], pacoteCa(46), {
    'OB-pipeline-1': ca(46),
    [chaveDoNumeroNovo('OB-pipeline-1')]: ca(50),
  })
  caso('livro-chave-id-sem-registro', 'Revisão 2: id do mapa sem registro, com a chave LIVRO:<id>: ocupa o número novo.', [e(B, 1, oB, 'criar', { periodo: 'CA' })], pacoteCa(46), {
    [oA]: ca(46),
    [chaveDoNumeroNovo(oA)]: ca(47),
  })

  // Aleatórios (semente fixa): testemunhas no pacote, numeroTomadoPeloLivro válido/igual/lixo/número/null, reservas,
  // exclusões e restaurações, ids do mapa sem registro, chaves LIVRO:<id> válidas e malformadas, entradas inválidas.
  const aleatorio = gerador(2026)
  const escolher = <T,>(xs: readonly T[]): T => xs[Math.floor(aleatorio() * xs.length)]!
  const periodos = ['CA', 'CA', 'CA', 'BA', 'BA', 'F1', null, 'xx'] as const
  for (let k = 0; k < 120; k++) {
    const eventos: Evento[] = []
    const ids: string[] = []
    let ms = 0
    const nCa = 40 + Math.floor(aleatorio() * 10)
    const pacote = [...pacoteCa(nCa), ...(aleatorio() < 0.5 ? ['BA00001', 'BA00002'] : []), ...(aleatorio() < 0.3 ? ['F100003'] : [])]
    const confirmados: Record<string, string> = {}
    const numeroAleatorio = (p: string) => formatarNumero(p, 38 + Math.floor(aleatorio() * 16))
    const quantos = 2 + Math.floor(aleatorio() * 6)
    for (let i = 0; i < quantos; i++) {
      const ap = aleatorio() < 0.1 ? 'pipeline' : escolher([A, B, C])
      const id = `OB-${ap}-${i + 1}`
      ids.push(id)
      const periodo = ap === 'pipeline' ? 'CA' : escolher(periodos)
      const campos: Record<string, Json> = { periodo }
      if (ap === 'pipeline' && aleatorio() < 0.7) campos.reserva = 'TESTE II'
      if (aleatorio() < 0.3) campos.pedido = numeroAleatorio('CA')
      ms += 1 + Math.floor(aleatorio() * 5)
      if (aleatorio() < 0.9) eventos.push(e(ap, ms, id, 'criar', campos))
      const r = aleatorio()
      if (r < 0.35) {
        ms += 1
        const tomado = escolher([numeroAleatorio('CA'), 'lixo', 7, null, ca(nCa)] as Json[])
        eventos.push(e(escolher([A, B, C]), ms, id, 'alterar', { numero: numeroAleatorio('CA'), ...(aleatorio() < 0.5 ? { numeroTomadoPeloLivro: tomado } : {}) }))
      }
      if (aleatorio() < 0.15) eventos.push(e(escolher([A, B, C]), (ms += 1), id, 'excluir'))
      if (aleatorio() < 0.08) eventos.push(e(escolher([A, B, C]), (ms += 1), id, 'restaurar'))
      if (aleatorio() < 0.2) eventos.push(e(escolher([A, B, C]), (ms += 1), id, 'alterar', { periodo: escolher(periodos) }))
      if (aleatorio() < 0.4) confirmados[id] = numeroAleatorio('CA')
      if (aleatorio() < 0.3) confirmados[chaveDoNumeroNovo(id)] = escolher([numeroAleatorio('CA'), ca(nCa + 1 + Math.floor(aleatorio() * 4)), 'ca00050', 'CA00000'])
    }
    if (aleatorio() < 0.3) confirmados[`OB-dddddddd-${k + 1}`] = numeroAleatorio('CA')
    if (aleatorio() < 0.2) confirmados[chaveDoNumeroNovo(`OB-dddddddd-${k + 1}`)] = numeroAleatorio('CA')
    if (aleatorio() < 0.2) confirmados['LIVRO:OB-x-1'] = ca(60)
    // A ordem dos eventos não importa (a fusão é pura): embaralhados por uma ordem fixa.
    const ordem = eventos.map((x, i) => ({ x, chave: aleatorio(), i })).sort((a, b) => a.chave - b.chave || a.i - b.i).map((y) => y.x)
    caso(`aleatorio-${String(k + 1).padStart(3, '0')}`, 'Aleatório (semente 2026).', ordem, pacote, confirmados)
  }
  return lista
}

function casosDeUniao(): CasoDeUniao[] {
  const lista: CasoDeUniao[] = []
  const caso = (nome: string, descricao: string, a: Record<string, string>, b: Record<string, string>) =>
    lista.push({ nome, descricao, a, b, uniao: unirConfirmados(a, b) })
  const oA = `OB-${A}-1`
  const oB = `OB-${B}-1`

  caso('uniao-numero-menor', 'Por id de objeto: fica o menor número.', { [oA]: 'CA00047', [oB]: 'CA00050' }, { [oA]: 'CA00046' })
  caso('uniao-nr-skc-menor-inteiro', 'SKC:<id>: fica o menor inteiro ("9" antes de "12").', { [chaveDoNrSkc(oA)]: '12' }, { [chaveDoNrSkc(oA)]: '9' })
  caso('uniao-livro-maior', 'LIVRO:<id> (decisão 48): fica o MAIOR número.', { [chaveDoNumeroNovo(oA)]: 'CA00048' }, { [chaveDoNumeroNovo(oA)]: 'CA00049' })
  caso('uniao-livro-malformadas', 'LIVRO: sem id, com id que não é de objeto SKC ou com número malformado: não entram.', {
    [chaveDoNumeroNovo(oA)]: 'CA00048',
    'LIVRO:OB-x-1': 'CA00050',
    'LIVRO:': 'CA00050',
  }, { [chaveDoNumeroNovo(oA)]: 'ca00049', [chaveDoNumeroNovo(oB)]: 'ca00049' })
  caso('uniao-as-tres-juntas', 'As três regras no mesmo par de mapas, com lixo ao lado.', {
    [oA]: 'CA00004',
    [chaveDoNrSkc(oA)]: '12',
    [chaveDoNumeroNovo(oA)]: 'CA00048',
    lixo: 'x',
  }, { [oA]: 'CA00003', [chaveDoNrSkc(oA)]: '9', [chaveDoNumeroNovo(oA)]: 'CA00047', 'SKC:': '1' })
  caso('uniao-vazios', 'Dois mapas vazios: vazio.', {}, {})

  // Aleatórios (semente fixa): chaves válidas e malformadas das três espécies, números válidos, minúsculos, zero,
  // grandes e lixo; os dois lados podem ter a mesma chave.
  const aleatorio = gerador(2027)
  const escolher = <T,>(xs: readonly T[]): T => xs[Math.floor(aleatorio() * xs.length)]!
  const ids = [oA, oB, `OB-${C}-2`, 'OB-pipeline-1']
  const chaves = [...ids, ...ids.map(chaveDoNrSkc), ...ids.map(chaveDoNumeroNovo), 'LIVRO:', 'SKC:', 'LIVRO:OB-x-1', 'SKC:lixo', 'OB-x-1', 'lixo', 'CA00046']
  const valores = ['CA00046', 'CA00047', 'CA00048', 'CA00050', 'BA00001', 'F100003', 'ca00047', 'CA00000', 'CA100000', 'CA0004', '1', '9', '12', '0', '-1', '01', '1.5', 'x', '']
  const mapa = () => {
    const m: Record<string, string> = {}
    const n = Math.floor(aleatorio() * 7)
    for (let i = 0; i < n; i++) m[escolher(chaves)] = escolher(valores)
    return m
  }
  for (let k = 0; k < 40; k++) caso(`uniao-aleatorio-${String(k + 1).padStart(3, '0')}`, 'Aleatório (semente 2027).', mapa(), mapa())
  return lista
}

describe('vetores da numeração (tests/fixtures/numerar-vetores.json)', () => {
  const gerados = casos()
  const uniao = casosDeUniao()
  const texto = `${JSON.stringify({ numerar: gerados, uniao } satisfies Arquivo, null, 1)}\n`
  if (process.env.ATUALIZAR_VETORES) writeFileSync(ARQUIVO, texto)

  it('o arquivo existe e bate com os casos (gere com ATUALIZAR_VETORES=1)', () => {
    expect(existsSync(ARQUIVO)).toBe(true)
    expect(readFileSync(ARQUIVO, 'utf8')).toBe(texto)
  })

  it('o sha256 do arquivo é o fixado (o mesmo do teste do repositório privado)', () => {
    expect(createHash('sha256').update(readFileSync(ARQUIVO)).digest('hex')).toBe(SHA256_DO_ARQUIVO)
  })

  it('cada caso do arquivo, lido como JSON, dá o resultado gravado', () => {
    const doArquivo = (JSON.parse(readFileSync(ARQUIVO, 'utf8')) as Arquivo).numerar
    expect(doArquivo.length).toBeGreaterThanOrEqual(130)
    for (const c of doArquivo) expect(resultadoDe(c.eventos, c.pacote, c.confirmados), c.nome).toEqual(c.resultado)
  })

  it('o bloco uniao (D-8): cada par de mapas do arquivo dá a união gravada, nos dois sentidos', () => {
    const doArquivo = (JSON.parse(readFileSync(ARQUIVO, 'utf8')) as Arquivo).uniao
    expect(doArquivo.length).toBeGreaterThanOrEqual(45)
    for (const c of doArquivo) {
      expect(unirConfirmados(c.a, c.b), c.nome).toEqual(c.uniao)
      expect(unirConfirmados(c.b, c.a), `${c.nome} (b ∪ a)`).toEqual(c.uniao)
    }
  })

  it('o bloco uniao cobre as regras: LIVRO: fica com o maior, o id com o menor, malformadas não entram', () => {
    const porNome = new Map(casosDeUniao().map((c) => [c.nome, c.uniao]))
    expect(porNome.get('uniao-livro-maior')).toEqual({ [`LIVRO:OB-${A}-1`]: 'CA00049' })
    expect(porNome.get('uniao-numero-menor')).toEqual({ [`OB-${A}-1`]: 'CA00046', [`OB-${B}-1`]: 'CA00050' })
    expect(porNome.get('uniao-nr-skc-menor-inteiro')).toEqual({ [`SKC:OB-${A}-1`]: '9' })
    expect(porNome.get('uniao-livro-malformadas')).toEqual({ [`LIVRO:OB-${A}-1`]: 'CA00048' })
    expect(porNome.get('uniao-as-tres-juntas')).toEqual({ [`LIVRO:OB-${A}-1`]: 'CA00048', [`OB-${A}-1`]: 'CA00003', [`SKC:OB-${A}-1`]: '9' })
    // Os aleatórios passam pelas três espécies e pelas malformadas (não ficam só no caminho comum).
    const todas = casosDeUniao().flatMap((c) => Object.keys(c.uniao))
    expect(todas.filter((k) => k.startsWith('LIVRO:')).length).toBeGreaterThan(10)
    expect(todas.filter((k) => k.startsWith('SKC:')).length).toBeGreaterThan(10)
    expect(todas.filter((k) => k.startsWith('OB-')).length).toBeGreaterThan(10)
    const entradas = casosDeUniao().flatMap((c) => [...Object.keys(c.a), ...Object.keys(c.b)])
    expect(entradas.length - todas.length).toBeGreaterThan(40)
  })

  it('cobre as regras: os casos têm os efeitos esperados', () => {
    const porNome = new Map(casos().map((c) => [c.nome, c.resultado]))
    expect(porNome.get('livro-chave-no-mapa')!.porId[`OB-${A}-1`]).toMatchObject({ numero: 'CA00048', situacao: 'confirmado', numeroTomadoPeloLivro: 'CA00046' })
    expect(porNome.get('livro-toma')!.porId[`OB-${A}-1`]).toMatchObject({ numero: 'CA00048', situacao: 'provisorio', conflito: 'livro' })
    expect(porNome.get('livro-toma-os-dois')!.porId[`OB-${A}-1`]).toMatchObject({ conflito: 'livro', numeroTomadoPeloLivro: 'CA00048' })
    expect(porNome.get('livro-chave-reserva')!.porId['OB-pipeline-1']).toMatchObject({ numero: 'CA00046', numeroTomadoPeloLivro: null })
    expect(porNome.get('livro-chave-pacote-velho-outro')!.porId[`OB-${B}-1`]).toMatchObject({ numero: 'CA00049', situacao: 'provisorio', conflito: null })
    expect(porNome.get('livro-chave-pacote-novo-outro')!.porId[`OB-${A}-1`]).toMatchObject({ numero: 'CA00048', situacao: 'confirmado' })
    expect(porNome.get('livro-chave-pacote-novo-outro')!.porId[`OB-${B}-1`]).toMatchObject({ numero: 'CA00049', situacao: 'confirmado', conflito: null })
    expect(porNome.get('sem-numero')!.porId[`OB-${A}-1`]!.situacao).toBe('sem-numero')
    // Os aleatórios exercitam o que importa (não ficam só no caminho comum).
    const todos = casos().flatMap((c) => Object.values(c.resultado.porId))
    const contar = (f: (i: (typeof todos)[number]) => boolean) => todos.filter(f).length
    expect(contar((i) => i.conflito === 'livro')).toBeGreaterThan(20)
    expect(contar((i) => i.conflito === 'skc')).toBeGreaterThan(5)
    expect(contar((i) => i.numeroTomadoPeloLivro !== null && i.situacao === 'confirmado')).toBeGreaterThan(5)
    expect(contar((i) => i.reserva !== null)).toBeGreaterThan(5)
    expect(contar((i) => i.situacao === 'excluido')).toBeGreaterThan(5)
    expect(contar((i) => i.situacao === 'rascunho')).toBeGreaterThan(5)
  })
})
