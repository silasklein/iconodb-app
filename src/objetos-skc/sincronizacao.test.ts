/**
 * A numeração SKC pela sincronização de verdade (Tarefa 3): dois e três aparelhos simulados, cada um com o próprio
 * IndexedDB e os próprios módulos, ligados ao mesmo Dropbox em memória. A confirmação é o mapa `numeros` do estado.json.
 */
import { novoAparelho, type AparelhoSimulado } from '../../tests/suporte/aparelhoSimulado'
import { DropboxEmMemoria } from '../../tests/suporte/dropboxEmMemoria'
import { formatarNumero, numerar, proximoNrSkc, proximoNumero, type Numeracao } from './numeracao'

const ESTADO = 'usuario/estado.json'
const PACOTE = Array.from({ length: 45 }, (_, i) => formatarNumero('CA', i + 1))

let nuvem: DropboxEmMemoria
beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', undefined)
  nuvem = new DropboxEmMemoria()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function aparelho(nome: string, comPacote = true): Promise<AparelhoSimulado> {
  const ap = await novoAparelho(nuvem, nome)
  if (comPacote) ap.pacote.definirFonteDosNumerosDoPacote(async () => PACOTE)
  return ap
}
const sincronizar = (ap: AparelhoSimulado) => ap.sync.sincronizar(ap.escrita, { motivo: 'manual' })
async function numeracao(ap: AparelhoSimulado): Promise<Numeracao> {
  return numerar(ap.estado.estadoAtual() as never, new Set(PACOTE), await ap.numeros.lerConfirmados())
}
/** Cria um objeto como o app: o pedido é o próximo número (e o próximo SKC, Nr.) que ESTE aparelho vê. */
async function criar(ap: AparelhoSimulado, periodo: 'CA' | 'BA' = 'CA'): Promise<string> {
  const id = await ap.estado.proximoId('OB')
  const confirmados = await ap.numeros.lerConfirmados()
  const pedido = proximoNumero(periodo, ap.estado.estadoAtual() as never, new Set(PACOTE), confirmados)
  const pedidoNrSkc = String(proximoNrSkc(ap.estado.estadoAtual() as never, new Set(PACOTE), confirmados))
  await ap.estado.registrar('objeto', id, 'criar', { periodo, pedido, pedidoNrSkc, titulo: `objeto de ${ap.id}` })
  return id
}
const arquivoDeEstado = () => JSON.parse(nuvem.texto(ESTADO)) as { numeros?: Record<string, string> }
/** A chave do SKC, Nr. no mapa `numeros` (decisão 38). */
const nr = (id: string) => `SKC:${id}`

describe('numeração SKC pela sincronização', () => {
  it('salvar e sincronizar confirma o número no estado.json (mesmo fora da consolidação diária) e escreve a testemunha', async () => {
    const A = await aparelho('Mac')
    await A.estado.registrar('nota', 'NT-x-1', 'criar', { texto: 'antes' })
    await sincronizar(A) // a primeira consolidação do dia
    const id = await criar(A)
    expect((await numeracao(A)).porId.get(id)).toMatchObject({ numero: 'CA00046', situacao: 'provisorio', nrSkc: 1, situacaoNrSkc: 'provisorio' })
    const r = await sincronizar(A)
    expect(r.consolidacao).toBe('gravada')
    // Decisão 38: o SKC, Nr. se confirma na MESMA escrita condicional do estado.json.
    expect(arquivoDeEstado().numeros).toEqual({ [id]: 'CA00046', [nr(id)]: '1' })
    expect((await numeracao(A)).porId.get(id)).toMatchObject({ numero: 'CA00046', situacao: 'confirmado', nrSkc: 1, situacaoNrSkc: 'confirmado' })
    // A testemunha fica no diário e sobe NA MESMA rodada (revisão 1: a janela é de segundos, não até a próxima rodada).
    expect(A.estado.estadoAtual().registro('objeto', id)!.campos).toMatchObject({ numero: 'CA00046', nrSkc: '1' })
    expect(r.segmentosEnviados).toHaveLength(2)
    expect(nuvem.caminhos().some((c) => c.startsWith(`usuario/diario/${A.id}/`) && nuvem.texto(c).includes('"nrSkc":"1"') && nuvem.texto(c).includes('"numero":"CA00046"'))).toBe(true)
    expect(await A.sync.contarPorEnviar()).toBe(0)
  })

  it('Foco 4: dois aparelhos offline criam CA00046; quem confirma primeiro fica com ele, o outro recebe CA00047 com o aviso, e os dois convergem', async () => {
    const A = await aparelho('Mac')
    const B = await aparelho('iPhone')
    const a = await criar(A)
    const b = await criar(B)
    expect((await numeracao(A)).porId.get(a)?.numero).toBe('CA00046')
    expect((await numeracao(B)).porId.get(b)?.numero).toBe('CA00046')
    await sincronizar(A)
    await sincronizar(B)
    await sincronizar(A)
    const na = await numeracao(A)
    const nb = await numeracao(B)
    for (const n of [na, nb]) {
      expect(n.porId.get(a)).toMatchObject({ numero: 'CA00046', situacao: 'confirmado', mudou: false, nrSkc: 1, situacaoNrSkc: 'confirmado', mudouNrSkc: false })
      expect(n.porId.get(b)).toMatchObject({ numero: 'CA00047', situacao: 'confirmado', mudou: true, pedido: 'CA00046', nrSkc: 2, situacaoNrSkc: 'confirmado', mudouNrSkc: true, pedidoNrSkc: 1 })
    }
    expect(arquivoDeEstado().numeros).toEqual({ [a]: 'CA00046', [b]: 'CA00047', [nr(a)]: '1', [nr(b)]: '2' })
  })

  it('os dois pedidos chegam juntos a uma consolidação: o de hlc menor fica com o número', async () => {
    const A = await aparelho('Mac', false) // sem os números do pacote: envia, mas não confirma nada
    const B = await aparelho('iPhone')
    const b = await criar(B) // hlc menor (o relógio anda antes do segundo pedido)
    await new Promise((r) => setTimeout(r, 5))
    const a = await criar(A)
    await sincronizar(A)
    expect(arquivoDeEstado().numeros).toBeUndefined()
    await sincronizar(B)
    const nb = await numeracao(B)
    expect(nb.porId.get(b)).toMatchObject({ numero: 'CA00046', situacao: 'confirmado', nrSkc: 1, situacaoNrSkc: 'confirmado' })
    expect(nb.porId.get(a)).toMatchObject({ numero: 'CA00047', situacao: 'confirmado', mudou: true, nrSkc: 2, mudouNrSkc: true })
    await sincronizar(A)
    expect((await numeracao(A)).porId.get(a)).toMatchObject({ numero: 'CA00047', situacao: 'confirmado', nrSkc: 2, situacaoNrSkc: 'confirmado' })
  })

  it('um pedido de hlc mais antigo que chega depois de uma confirmação não toma o número (três aparelhos)', async () => {
    const A = await aparelho('Mac')
    const B = await aparelho('iPhone')
    const C = await aparelho('iPad')
    const c = await criar(C) // o mais antigo, offline por muito tempo
    const a = await criar(A)
    await sincronizar(A)
    expect(arquivoDeEstado().numeros).toEqual({ [a]: 'CA00046', [nr(a)]: '1' })
    await sincronizar(B)
    const b = await criar(B)
    await sincronizar(B)
    expect(arquivoDeEstado().numeros).toEqual({ [a]: 'CA00046', [b]: 'CA00047', [nr(a)]: '1', [nr(b)]: '2' })
    await sincronizar(C)
    for (const ap of [C, A, B]) await sincronizar(ap)
    for (const ap of [A, B, C]) {
      const n = await numeracao(ap)
      expect(n.porId.get(a)).toMatchObject({ numero: 'CA00046', nrSkc: 1 })
      expect(n.porId.get(b)).toMatchObject({ numero: 'CA00047', nrSkc: 2 })
      // C pediu o Nr. 1 (o que via offline) e ficou com o 3: o confirmado dos outros nunca muda.
      expect(n.porId.get(c)).toMatchObject({ numero: 'CA00048', situacao: 'confirmado', mudou: true, nrSkc: 3, situacaoNrSkc: 'confirmado', mudouNrSkc: true })
    }
  })

  it('o aparelho novo que entra pelo estado.json já vê os números confirmados; reabrir o app não os perde', async () => {
    const A = await aparelho('Mac')
    const a = await criar(A)
    await sincronizar(A)
    const D = await aparelho('Novo')
    await sincronizar(D)
    expect((await numeracao(D)).porId.get(a)).toMatchObject({ numero: 'CA00046', situacao: 'confirmado' })
    const D2 = await D.reabrir()
    D2.pacote.definirFonteDosNumerosDoPacote(async () => PACOTE)
    expect(D2.numeros.confirmadosAtuais()).toEqual({ [a]: 'CA00046', [nr(a)]: '1' })
    expect((await numeracao(D2)).porId.get(a)).toMatchObject({ nrSkc: 1, situacaoNrSkc: 'confirmado' })
  })

  it('sem os números do pacote nada novo é confirmado, e o estado.json não perde os já confirmados', async () => {
    const A = await aparelho('Mac')
    const a = await criar(A)
    await sincronizar(A)
    const B = await aparelho('iPhone', false)
    await sincronizar(B)
    const b = await criar(B)
    await sincronizar(B)
    expect(arquivoDeEstado().numeros).toEqual({ [a]: 'CA00046', [nr(a)]: '1' })
    expect((await numeracao(B)).porId.get(b)).toMatchObject({ numero: 'CA00047', situacao: 'provisorio', nrSkc: 2, situacaoNrSkc: 'provisorio' })
  })

  it('sem pedido novo, a rodada não regrava o estado.json só por causa dos números', async () => {
    const A = await aparelho('Mac')
    await criar(A)
    await sincronizar(A)
    await sincronizar(A) // sobe a testemunha
    const rev = nuvem.rev(ESTADO)
    expect((await sincronizar(A)).consolidacao).toBeNull()
    expect(nuvem.rev(ESTADO)).toBe(rev)
  })

  it('o estado.json apagado (o caminho de recuperação da Tarefa 3) não muda um número confirmado: a testemunha e o mapa local o guardam', async () => {
    const A = await aparelho('Mac')
    const B = await aparelho('iPhone')
    const a = await criar(A)
    await sincronizar(A)
    await sincronizar(A) // a testemunha sobe
    nuvem.arquivos.delete(ESTADO)
    const b = await criar(B)
    await sincronizar(B)
    await sincronizar(A)
    for (const ap of [A, B]) {
      const n = await numeracao(ap)
      expect(n.porId.get(a)).toMatchObject({ numero: 'CA00046', nrSkc: 1 })
      expect(n.porId.get(b)).toMatchObject({ numero: 'CA00047', nrSkc: 2 })
    }
  })

  it('Tarefa 16: um livro novo reserva números pelo diário (aparelho "pipeline"); a consolidação os confirma depois dos SKC, e o pacote novo não colide', async () => {
    const A = await aparelho('Mac')
    const a = await criar(A)
    await sincronizar(A) // CA00046 confirmado
    // O pipeline grava um segmento seu com duas reservas (hlc depois de tudo o que ele viu).
    const linha = (n: number) =>
      JSON.stringify({ v: 1, id: `pipeline-${n}-0`, hlc: `${String(Date.now() + 60_000 + n).padStart(13, '0')}-0000-pipeline`, aparelho: 'pipeline', tipo: 'objeto', reg: `OB-pipeline-${n}`, op: 'criar', campos: { periodo: 'CA', reserva: 'TESTE II' } })
    nuvem.colocar('usuario/diario/pipeline/000001.jsonl', `${linha(1)}\n${linha(2)}\n`)
    await sincronizar(A)
    // As reservas nunca consomem SKC, Nr. (decisão 38): nenhuma chave SKC: para elas.
    expect(arquivoDeEstado().numeros).toEqual({ [a]: 'CA00046', 'OB-pipeline-1': 'CA00047', 'OB-pipeline-2': 'CA00048', [nr(a)]: '1' })
    // As reservas não são objetos SKC (não aparecem), só ocupam os números.
    const n = await numeracao(A)
    expect(n.porId.get('OB-pipeline-1')).toMatchObject({ reserva: 'TESTE II', situacao: 'confirmado', nrSkc: null })
    expect(n.maiorNrSkc).toBe(1)
    // O pacote novo traz os objetos do livro com os números reservados: nenhum conflito, e o próximo SKC é CA00049.
    const novoPacote = new Set([...PACOTE, 'CA00047', 'CA00048'])
    const depois = numerar(A.estado.estadoAtual() as never, novoPacote, await A.numeros.lerConfirmados())
    expect(depois.porId.get('OB-pipeline-1')?.conflito).toBeNull()
    expect(depois.porId.get(a)?.numero).toBe('CA00046')
    expect(proximoNumero('CA', A.estado.estadoAtual() as never, novoPacote, await A.numeros.lerConfirmados())).toBe('CA00049')
  })

  it('decisão 48: um volume novo toma um número confirmado; a consolidação dá ao objeto o seguinte como definitivo, igual nos dois aparelhos, e ele não anda', async () => {
    const A = await aparelho('Mac')
    const B = await aparelho('iPhone')
    const a = await criar(A)
    await sincronizar(A)
    await sincronizar(B)
    expect((await numeracao(A)).porId.get(a)).toMatchObject({ numero: 'CA00046', situacao: 'confirmado' })
    // o pacote novo (o livro deu CA00046 e CA00047 a objetos seus) chega aos dois aparelhos
    const novo = [...PACOTE, 'CA00046', 'CA00047']
    for (const ap of [A, B]) ap.pacote.definirFonteDosNumerosDoPacote(async () => novo)
    const com = async (ap: AparelhoSimulado) => numerar(ap.estado.estadoAtual() as never, new Set(novo), await ap.numeros.lerConfirmados())
    expect((await com(A)).porId.get(a)).toMatchObject({ numero: 'CA00048', situacao: 'provisorio', conflito: 'livro', numeroTomadoPeloLivro: 'CA00046' })
    await sincronizar(A)
    // a testemunha nova está no diário e o número novo é o confirmado
    expect(A.estado.estadoAtual().registro('objeto', a)!.campos).toMatchObject({ numero: 'CA00048', numeroTomadoPeloLivro: 'CA00046' })
    expect(nuvem.caminhos().some((c) => c.startsWith(`usuario/diario/${A.id}/`) && nuvem.texto(c).includes('"numeroTomadoPeloLivro":"CA00046"'))).toBe(true)
    expect((await com(A)).porId.get(a)).toMatchObject({ numero: 'CA00048', situacao: 'confirmado', conflito: null, numeroTomadoPeloLivro: 'CA00046' })
    // B cria e confirma outro objeto do período: o de A continua CA00048, nos dois aparelhos
    const id = await B.estado.proximoId('OB')
    await B.estado.registrar('objeto', id, 'criar', { periodo: 'CA', titulo: 'de B' })
    await sincronizar(B)
    await sincronizar(A)
    for (const ap of [A, B]) {
      const n = await com(ap)
      expect(n.porId.get(a)).toMatchObject({ numero: 'CA00048', situacao: 'confirmado', numeroTomadoPeloLivro: 'CA00046' })
      expect(n.porId.get(id)).toMatchObject({ numero: 'CA00049', situacao: 'confirmado' })
    }
    // e a rodada seguinte não escreve outra testemunha
    const antes = A.estado.estadoAtual().registro('objeto', a)!.alteradoEm
    await sincronizar(A)
    expect(A.estado.estadoAtual().registro('objeto', a)!.alteradoEm).toBe(antes)
  })

  it('revisão 2 (I3): o número novo da decisão 48 viaja no estado.json; se a testemunha de B não sobe, A consolida e fica com o MESMO número', async () => {
    const A = await aparelho('Mac')
    const B = await aparelho('iPhone')
    const o = await criar(A)
    await sincronizar(A)
    await sincronizar(B)
    expect((await numeracao(B)).porId.get(o)).toMatchObject({ numero: 'CA00046', situacao: 'confirmado' })
    // o pacote novo (o livro deu CA00046 e CA00047 a objetos seus) chega aos dois aparelhos
    const novo = [...PACOTE, 'CA00046', 'CA00047']
    for (const ap of [A, B]) ap.pacote.definirFonteDosNumerosDoPacote(async () => novo)
    const com = async (ap: AparelhoSimulado) => numerar(ap.estado.estadoAtual() as never, new Set(novo), await ap.numeros.lerConfirmados())
    // B pede outro objeto do período (depois de o): na consolidação de B, o fica com CA00048 e r com CA00049
    const r = await B.estado.proximoId('OB')
    await B.estado.registrar('objeto', r, 'criar', { periodo: 'CA', titulo: 'de B' })
    // a subida do diário de B cai logo depois de gravar o estado.json (a rede some no celular)
    let gravouOEstado = false
    nuvem.antes = (op, caminho) => {
      if (op === 'enviar' && caminho === ESTADO) gravouOEstado = true
      else if (op === 'enviar' && gravouOEstado && caminho.startsWith(`usuario/diario/${B.id}/`)) throw new (class extends Error { name = 'ErroDeRede' })()
    }
    await expect(sincronizar(B)).rejects.toThrow()
    nuvem.antes = null
    expect(gravouOEstado).toBe(true)
    expect((await com(B)).porId.get(o)).toMatchObject({ numero: 'CA00048', situacao: 'confirmado', numeroTomadoPeloLivro: 'CA00046' })
    // o estado.json já leva o número novo (a chave LIVRO:<id>), na mesma escrita condicional
    expect(arquivoDeEstado().numeros).toMatchObject({ [o]: 'CA00046', [`LIVRO:${o}`]: 'CA00048', [r]: 'CA00049' })
    // A sincroniza e consolida sem a testemunha de B: fica com CA00048, não calcula outro
    await A.estado.registrar('nota', 'NT-x-1', 'criar', { texto: 'para A ter o que enviar' })
    await sincronizar(A)
    expect((await com(A)).porId.get(o)).toMatchObject({ numero: 'CA00048', situacao: 'confirmado', numeroTomadoPeloLivro: 'CA00046' })
    // B volta à rede; os dois continuam em CA00048, e ninguém escreveu CA00050
    for (const ap of [B, A, B]) await sincronizar(ap)
    for (const ap of [A, B]) {
      const n = await com(ap)
      expect(n.porId.get(o)).toMatchObject({ numero: 'CA00048', situacao: 'confirmado', numeroTomadoPeloLivro: 'CA00046' })
      expect(n.porId.get(r)).toMatchObject({ numero: 'CA00049', situacao: 'confirmado' })
    }
    expect(nuvem.caminhos('usuario/').some((c) => nuvem.texto(c).includes('CA00050'))).toBe(false)
    // A testemunha de B (CA00048) chegou ao diário, e a chave fica no mapa
    expect(nuvem.caminhos(`usuario/diario/${B.id}/`).some((c) => nuvem.texto(c).includes('"numero":"CA00048"'))).toBe(true)
    expect(arquivoDeEstado().numeros?.[`LIVRO:${o}`]).toBe('CA00048')
  })

  it('revisão 1: consolidações que se cruzam (A sincroniza inteiro entre a listagem de B e a escrita do estado.json de B): B nunca fica com conflito no próprio objeto', async () => {
    const A = await aparelho('Mac')
    const B = await aparelho('iPhone')
    await A.estado.registrar('nota', 'NT-x-1', 'criar', { texto: 'x' })
    await sincronizar(A)
    await sincronizar(B)
    const a = await criar(A)
    await new Promise((r) => setTimeout(r, 5))
    const b = await criar(B)
    const original = B.escrita.enviar.bind(B.escrita)
    let vez = 0
    B.escrita.enviar = async (c, bytes, op) => {
      if (c === ESTADO && vez++ === 0) await sincronizar(A)
      return original(c, bytes, op)
    }
    const rb = await sincronizar(B)
    expect(rb.consolidacao).toBe('outro-aparelho')
    // O que B viu na hora: o mapa de A (a CA00046, b CA00047), sem o b CA00046 que B ia gravar e perdeu.
    const nb = await numeracao(B)
    expect(nb.porId.get(b)).toMatchObject({ numero: 'CA00047', conflito: null, nrSkc: 2, conflitoNrSkc: false })
    expect(B.numeros.confirmadosAtuais()[b]).toBe('CA00047')
    expect(B.numeros.confirmadosAtuais()[nr(b)]).toBe('2')
    B.escrita.enviar = original
    for (const ap of [B, A, B, A]) await sincronizar(ap)
    for (const ap of [A, B]) {
      const n = await numeracao(ap)
      expect(n.porId.get(a)).toMatchObject({ numero: 'CA00046', conflito: null, nrSkc: 1, conflitoNrSkc: false })
      expect(n.porId.get(b)).toMatchObject({ numero: 'CA00047', conflito: null, nrSkc: 2, conflitoNrSkc: false })
    }
    expect(arquivoDeEstado().numeros).toEqual({ [a]: 'CA00046', [b]: 'CA00047', [nr(a)]: '1', [nr(b)]: '2' })
  })

  it('decisão 38: um número já confirmado sem SKC, Nr. confirmado (mapa de antes da decisão) basta para consolidar, e só o Nr. entra no mapa', async () => {
    const A = await aparelho('Mac')
    await A.estado.registrar('nota', 'NT-x-1', 'criar', { texto: 'antes' })
    expect((await sincronizar(A)).consolidacao).toBe('gravada') // a do dia
    // Um objeto confirmado pelo protocolo da revisão 1 (mapa e testemunha só com `numero`).
    const id = await A.estado.proximoId('OB')
    await A.estado.registrar('objeto', id, 'criar', { periodo: 'CA', pedido: 'CA00046', titulo: 'antigo' })
    await A.estado.registrar('objeto', id, 'alterar', { numero: 'CA00046' })
    await A.numeros.unirConfirmadosGuardados({ [id]: 'CA00046' })
    expect((await numeracao(A)).porId.get(id)).toMatchObject({ situacao: 'confirmado', situacaoNrSkc: 'provisorio', nrSkc: 1 })
    const r = await sincronizar(A)
    expect(r.consolidacao).toBe('gravada')
    expect(arquivoDeEstado().numeros).toEqual({ [id]: 'CA00046', [nr(id)]: '1' })
    expect(A.estado.estadoAtual().registro('objeto', id)!.campos.nrSkc).toBe('1')
  })

  it('revisão 1: a testemunha e um valor igual escrito nos dois aparelhos não viram "o mesmo campo nos dois aparelhos"', async () => {
    const A = await aparelho('Mac')
    const B = await aparelho('iPhone', false)
    const b = await criar(B)
    await sincronizar(B) // sobe o pedido; sem pacote, não confirma
    await sincronizar(A) // A confirma b e sobe a testemunha
    await A.estado.registrar('objeto', b, 'alterar', { material: 'Cobre' })
    await sincronizar(A)
    // B, antes de ver nada disso, escreve a mesma testemunha e o mesmo material (ainda não enviados).
    await B.estado.registrar('objeto', b, 'alterar', { numero: 'CA00046', material: 'Cobre' })
    const r = await sincronizar(B)
    expect(r.mesmoCampo).toEqual([])
    // Um valor diferente continua sendo avisado.
    await A.estado.registrar('objeto', b, 'alterar', { material: 'Bronze' })
    await sincronizar(A)
    await B.estado.registrar('objeto', b, 'alterar', { material: 'Prata' })
    expect((await sincronizar(B)).mesmoCampo.map((m) => m.campo)).toEqual(['material'])
  })
})
