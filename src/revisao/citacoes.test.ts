/**
 * As citações não resolvidas na fila (Tarefa 11): de que `bib_ref` é cada linha `citacao_nao_resolvida`, o caso que sai da
 * fila quando a camada liga todas as citações dele, a citação ligada pelo usuário no pacote que volta quando a camada a
 * desfaz (foco 3), as iguais do «Ligar» e o «Desfazer». Só o pacote sintético TESTE e citações inventadas.
 */
import { bancoDeTeste } from '../../tests/suporte/bancoDeTeste'
import { usarMotor } from '../banco/cliente'
import { citacoesNaoResolvidasNoPacote, linhasDaFila, ondeApareceACitacao, type CitacaoDoPacote, type LinhaDaFila } from '../banco/consultas'
import { criarObra, excluirObra, restaurarObra } from '../bibliografia/operacoes'
import { estadoAtual, registrar, registrarVarios } from '../usuario/estado'
import { alvoDaLigacao, citacoesDaLinha, fotografia, indiceDasCitacoes, linhasDesfeitas, pedidosDeLigarOCaso, pedidosDeVoltar, rotuloDeLigar, separarLugarDaCitacao } from './citacoes'
import { chaveDoCaso } from './chave'
import { montarFila } from './fila'
import { excluirLigacao, ligar } from './ligacoes'

let linhas: LinhaDaFila[]
let citacoes: CitacaoDoPacote[]

beforeAll(async () => {
  usarMotor(await bancoDeTeste())
  linhas = await linhasDaFila()
  citacoes = await citacoesNaoResolvidasNoPacote()
})
afterAll(() => usarMotor(null))

/** Uma citação sintética do item TESTE-0009 (fora do pacote). */
const sintetica = (id: number, bruto: string, curta: string | null, categoria: number | null = 7, mais: Partial<CitacaoDoPacote> = {}): CitacaoDoPacote => ({
  id, sigla: 'TESTE', itemId: 'TESTE-0009', passagemId: null, hipoteseId: null, categoria, bruto, curta, obraId: null, resolvida: false, resolvidaPor: null, ...mais,
})

const fila = () =>
  montarFila({ linhas, lugares: null, verbetesDoPacote: [], estado: estadoAtual(), numeracao: { porId: new Map(), rascunhos: [] }, citacoes })
const grupoDasCitacoes = () => fila().grupos.find((g) => g.id === 'citacoes-nao-resolvidas')
const textos = () => grupoDasCitacoes()?.abertos.map((c) => c.o_que) ?? []

/** Tira as ligações dos testes. A da «Imaginária 2010» fica ligada à obra do pacote: excluí-la desfaria a ligação do pacote (foco 3). */
async function limparLigacoes() {
  for (const r of estadoAtual().registros.get('citacao')?.values() ?? []) if (!r.excluido && r.id !== 'imaginaria 2010') await excluirLigacao(r.id)
}
afterEach(limparLigacoes)

describe('as citações do pacote', () => {
  it('traz as não resolvidas e as ligadas pelo usuário, com a sigla', () => {
    expect(citacoes.map((c) => `${c.sigla}:${c.bruto}:${c.resolvidaPor ?? '-'}`)).toEqual([
      'TESTE:Fantasma 1888: 3:-',
      'TESTE:Inventado 2001: 5:-',
      'TESTE:Inventado 2001: 9:-',
      'TESTE:1999: 12:-',
      'TESTE:Imaginária 2010: 3:user',
    ])
  })

  it('cada linha da fila acha as suas citações (o trecho, o campo do item, a sem autor)', () => {
    const ind = indiceDasCitacoes(linhas, citacoes)
    const porTexto = new Map([...ind.porLinha].map(([i, cs]) => [linhas[i]!.detalhe, cs.map((c) => c.bruto)]))
    expect(porTexto).toEqual(
      new Map([
        ['Fantasma 1888: 3: obra fora da bibliografia', ['Fantasma 1888: 3']],
        ['campo 7: Inventado 2001: 5', ['Inventado 2001: 5']],
        ['campo 7: Inventado 2001: 9', ['Inventado 2001: 9']],
        ['campo 7: 1999: 12; sem autor na citação', ['1999: 12']],
      ]),
    )
    expect(ind.porChave.get('inventado 2001')?.map((c) => c.bruto)).toEqual(['Inventado 2001: 5', 'Inventado 2001: 9'])
  })

  it('a linha junta as citações do mesmo rótulo na mesma entidade: os campos 7 e 8 juntos, como o build; o aparato à parte', () => {
    const lista = [
      sintetica(1, 'Exemplo 2002', 'Exemplo 2002'),
      sintetica(2, 'Exemplo 2002: 4', 'Exemplo 2002'),
      sintetica(3, 'Exemplo 2002: 8', 'Exemplo 2002', 8),
      sintetica(4, 'Exemplo 2002: 9', 'Exemplo 2002', null),
      sintetica(5, 'Outra 2003: 1', 'Outra 2003', 8),
      sintetica(6, 'Ligada 2005: 2', 'Ligada 2005', 7, { resolvida: true, resolvidaPor: 'user', obraId: 'BIB-900001' }),
      sintetica(7, 'Ligada 2005: 3', 'Ligada 2005', 8),
      sintetica(8, 'Resolvida 2006', 'Resolvida 2006', 7, { resolvida: true, resolvidaPor: 'auto', obraId: 'BIB-900001' }),
    ]
    const ind = { passagens: new Map(), hipoteses: new Map(), itens: new Map([['TESTE-0009', lista]]) }
    const linha = (detalhe: string) => ({ entidade: 'item', entidadeId: 'TESTE-0009', detalhe })
    // a linha «campo 7» cobre também a do campo 8 com o mesmo rótulo (o build não escreve «campo 8: Exemplo 2002»)
    expect(citacoesDaLinha(linha('campo 7: Exemplo 2002'), ind).map((x) => x.id)).toEqual([1, 2, 3])
    // um rótulo só do campo 8 tem a sua linha «campo 8»
    expect(citacoesDaLinha(linha('campo 8: Outra 2003: 1'), ind).map((x) => x.id)).toEqual([5])
    expect(citacoesDaLinha(linha('aparato não dividido: Exemplo 2002: 9'), ind).map((x) => x.id)).toEqual([4])
    // a ligada pelo usuário no pacote também é da linha; a resolvida pelo processamento, não
    expect(citacoesDaLinha(linha('campo 7: Ligada 2005: 2'), ind).map((x) => x.id)).toEqual([6, 7])
    expect(citacoesDaLinha(linha('campo 7: Resolvida 2006'), ind)).toEqual([])
    expect(citacoesDaLinha(linha('campo 7: Outro 1990'), ind)).toEqual([])
    expect(separarLugarDaCitacao('posição relatada de Fulano: Exemplo 2002')).toEqual({ lugar: 'posição relatada de Fulano', citacao: 'Exemplo 2002' })
  })

  it('a linha refeita: os campos 7 e 8 numa só (o campo da primeira); a posição relatada com os autores', async () => {
    const a = sintetica(11, 'Ligada 2005: 2', 'Ligada 2005', 7, { resolvida: true, resolvidaPor: 'user', obraId: 'BIB-sem0dono-1' })
    const b = sintetica(12, 'Ligada 2005: 3', 'Ligada 2005', 8, { resolvida: true, resolvidaPor: 'user', obraId: 'BIB-sem0dono-1' })
    const h = sintetica(13, 'Relatada 2007: 5', 'Relatada 2007', null, { resolvida: true, resolvidaPor: 'user', obraId: 'BIB-sem0dono-1', hipoteseId: 'HY-900099', relatadoPor: ['Fulano', 'Beltrana'] })
    expect(linhasDesfeitas(estadoAtual(), [a, b, h])).toEqual([]) // a camada não diz nada: vale o pacote
    // a camada desfaz as ligações do pacote (as chaves desligadas): as linhas voltam, como o build as escreveria
    await ligar('ligada 2005', null)
    await ligar('relatada 2007', null)
    const linhas = linhasDesfeitas(estadoAtual(), [a, b, h])
    expect(linhas.map((l) => [l.linha.detalhe, l.citacoes.map((c) => c.id)])).toEqual([
      ['campo 7: Ligada 2005: 2', [11, 12]],
      ['posição relatada de Fulano; Beltrana: Relatada 2007: 5', [13]],
    ])
  })

  it('onde aparece: o campo 7 do item; o trecho da introdução', async () => {
    const [fantasma, inventado5] = citacoes
    expect(await ondeApareceACitacao(inventado5!)).toEqual({ tipo: 'campo', campo: 7, texto: 'Testhausen, Sammlung Probe, Nr. 4. Autor 1999: 20; Inventado 2001: 5.', lingua: 'de' })
    expect(await ondeApareceACitacao(fantasma!)).toMatchObject({ tipo: 'trecho', campo: null, texto: expect.stringContaining('Fantasma 1888: 3') })
  })
})

describe('a fila com as ligações', () => {
  it('ligar a chave tira da fila os dois casos iguais, de uma vez; desligar os devolve', async () => {
    expect(textos()).toEqual(['Fantasma 1888: 3: obra fora da bibliografia', 'Inventado 2001: 5', 'Inventado 2001: 9', '1999: 12; sem autor na citação'])
    await ligar('inventado 2001', 'BIB-900001')
    expect(textos()).toEqual(['Fantasma 1888: 3: obra fora da bibliografia', '1999: 12; sem autor na citação'])
    expect(fila().ligadas.map((l) => [l.caso.o_que, l.obra])).toEqual([
      ['Inventado 2001: 5', 'BIB-900001'],
      ['Inventado 2001: 9', 'BIB-900001'],
    ])
    expect(fila().total).toBe(fila().grupos.reduce((s, g) => s + (g.soConsulta ? 0 : g.quantidade), 0))
    await ligar('inventado 2001', null)
    expect(textos()).toHaveLength(4)
  })

  it('a obra do usuário excluída devolve as citações à fila; «Restaurar» as liga de novo (foco 3)', async () => {
    const obra = await criarObra({ type: 'book', title: 'Livro Inventado', author: [{ family: 'Inventado' }], issued: { 'date-parts': [[2001]] } }, 'Inventado 2001', { ligarA: 'inventado 2001' })
    expect(textos()).toHaveLength(2)
    await excluirObra(obra)
    expect(textos()).toHaveLength(4)
    await restaurarObra(obra)
    expect(textos()).toHaveLength(2)
    await excluirObra(obra)
  })

  it('a citação ligada pelo usuário no pacote volta à fila quando a camada a desfaz, com o texto que o build escreveria', async () => {
    expect(textos()).not.toContain('Imaginária 2010: 3')
    await ligar('imaginaria 2010', null)
    expect(textos()).toContain('Imaginária 2010: 3')
    const caso = grupoDasCitacoes()!.abertos.find((c) => c.o_que === 'Imaginária 2010: 3')!
    expect(caso.onde).toContain('campo 7')
    expect(fila().citacoes.get(caso.chave)?.map((c) => c.bruto)).toEqual(['Imaginária 2010: 3'])
    expect(linhasDesfeitas(estadoAtual(), indiceDasCitacoes(linhas, citacoes).doUsuario).map((l) => l.linha.detalhe)).toEqual(['campo 7: Imaginária 2010: 3'])
    await ligar('imaginaria 2010', 'BIB-900090')
    expect(textos()).not.toContain('Imaginária 2010: 3')
  })
})

describe('a linha que junta os campos 7 e 8 (R1 do fix round 1)', () => {
  const linhaMista: LinhaDaFila = { tipo: 'citacao_nao_resolvida', entidade: 'item', entidadeId: 'TESTE-0009', detalhe: 'campo 7: Mista 2004: 1', numero: null }
  const mistas = [sintetica(21, 'Mista 2004: 1', 'Mista 2004', 7), sintetica(22, 'Mista 2004: 6', 'Mista 2004', 8)]
  const filaMista = () =>
    montarFila({ linhas: [linhaMista], lugares: null, verbetesDoPacote: [], estado: estadoAtual(), numeracao: { porId: new Map(), rascunhos: [] }, citacoes: mistas })
  const abertas = () => filaMista().grupos.find((g) => g.id === 'citacoes-nao-resolvidas')?.abertos.map((c) => c.o_que) ?? []

  it('ligar a chave tira a linha; desligar só a do campo 8 a devolve à fila (como o build seguinte)', async () => {
    expect(filaMista().citacoes.get(chaveDoCaso(linhaMista))?.map((c) => c.id)).toEqual([21, 22])
    await ligar('mista 2004', 'BIB-900001')
    expect(abertas()).toEqual([])
    await ligar('mista 2004@TESTE|TESTE-0009|Mista 2004: 6', null)
    expect(abertas()).toEqual(['Mista 2004: 1'])
    // e o «Ligar» da Revisão tira a exceção dela junto: a linha sai de novo
    const ind = indiceDasCitacoes([linhaMista], mistas)
    const alvo = alvoDaLigacao(estadoAtual(), mistas, ind.porChave)!
    expect(alvo.iguais).toBe(2)
    await registrarVarios(pedidosDeLigarOCaso(estadoAtual(), mistas, alvo, 'BIB-900002').pedidos)
    expect(abertas()).toEqual([])
  })
})

describe('o «Ligar» do caso', () => {
  const doCaso = (bruto: string) => citacoes.filter((c) => c.bruto === bruto)

  it('pela chave, as iguais; sem autor, só a ocorrência', () => {
    const ind = indiceDasCitacoes(linhas, citacoes)
    const a = alvoDaLigacao(estadoAtual(), doCaso('Inventado 2001: 5'), ind.porChave)!
    expect(a).toEqual({ id: 'inventado 2001', porChave: true, rotulo: 'Inventado 2001', iguais: 2 })
    expect(rotuloDeLigar(a)).toBe('Ligar as 2 citações “Inventado 2001”')
    const s = alvoDaLigacao(estadoAtual(), doCaso('1999: 12'), ind.porChave)!
    expect(s).toEqual({ id: '-@TESTE|TESTE-0006|1999: 12', porChave: false, rotulo: '1999: 12', iguais: 1 })
    expect(rotuloDeLigar(s)).toBe('Ligar a citação “1999: 12”')
  })

  it('uma igual desligada no objeto não conta; a do próprio caso sai junto, e «Desfazer» devolve tudo', async () => {
    const ind = indiceDasCitacoes(linhas, citacoes)
    await ligar('inventado 2001@TESTE|TESTE-0005|Inventado 2001: 9', null) // desligada no objeto
    expect(alvoDaLigacao(estadoAtual(), doCaso('Inventado 2001: 5'), ind.porChave)!.iguais).toBe(1)
    const alvo = alvoDaLigacao(estadoAtual(), doCaso('Inventado 2001: 9'), ind.porChave)!
    expect(alvo.iguais).toBe(2) // a do caso conta sempre (a exceção dela sai junto), e a outra não tem exceção
    const { pedidos, antes } = pedidosDeLigarOCaso(estadoAtual(), doCaso('Inventado 2001: 9'), alvo, 'BIB-900001')
    // a chave já existiu num teste anterior (excluída): `alterar`; nova seria `criar`. As duas levam o `restaurar`.
    expect(pedidos.map((p) => `${p.reg}:${p.op}`)).toEqual([expect.stringMatching(/^inventado 2001:(criar|alterar)$/), 'inventado 2001:restaurar', 'inventado 2001@TESTE|TESTE-0005|Inventado 2001: 9:excluir'])
    await registrarVarios(pedidos)
    expect(textos()).toEqual(['Fantasma 1888: 3: obra fora da bibliografia', '1999: 12; sem autor na citação'])
    await registrarVarios(pedidosDeVoltar(estadoAtual(), antes))
    expect(fotografia(estadoAtual(), 'inventado 2001')).toMatchObject({ existia: true, excluido: true })
    expect(fotografia(estadoAtual(), 'inventado 2001@TESTE|TESTE-0005|Inventado 2001: 9')).toMatchObject({ excluido: false, obra: null })
    expect(textos()).toHaveLength(4)
  })

  it('desfazer volta à obra de antes quando a chave já ligava a outra', async () => {
    await ligar('inventado 2001', 'BIB-900002')
    const antes = [fotografia(estadoAtual(), 'inventado 2001')]
    await ligar('inventado 2001', 'BIB-900001')
    await registrarVarios(pedidosDeVoltar(estadoAtual(), antes))
    expect(estadoAtual().registro('citacao', 'inventado 2001')?.campos.obra).toBe('BIB-900002')
    await registrar('citacao', 'inventado 2001', 'excluir')
  })
})
