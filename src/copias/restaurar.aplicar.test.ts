/**
 * `aplicarRestauracao` e `conferirFotos` (2C, bloco 1, Tarefa 7; especificação §6.2): os eventos numa transação, deste
 * aparelho; as fotos que faltam no Dropbox e estão no .zip entram na fila de envio. Focos 2, 3 e 4 da revisão. Sintético.
 */
import { A, B, ev, hlc, T0 } from '../../tests/suporte/eventosDeTeste'
import { escritaFalsa } from '../../tests/suporte/imagensDeTeste'
import type { Escrita } from '../dropbox/escrita'
import { enviarImagensPendentes } from '../imagens-usuario/fila'
import { idsLocais, usarArmazemDasImagens, usarCacheDasImagens } from '../imagens-usuario/local'
import { armazemMemoria } from '../pacote/armazem'
import { cacheMemoria } from '../pacote/imagens'
import { aparelhoAtual } from '../usuario/aparelho'
import { todosEventos } from '../usuario/armazem'
import { carregarEstado, estadoAtual, receberEventos, registrar } from '../usuario/estado'
import type { Evento } from '../usuario/eventos'
import { FORMATO_DA_COPIA, type CopiaDeSeguranca } from '../usuario/exportar'
import { consolidar, fundir } from '../usuario/fusao'
import { sincronizarAgora } from '../usuario/useSincronizacao'
import { lerCopia } from './lerCopia'
import { aplicarRestauracao, conferirFotos, listagemReaproveitavel, LISTAGEM_FRESCA_MS, planoDeRestauracao } from './restaurar'
import { montarZip } from './zip'

vi.mock('../usuario/useSincronizacao', async (original) => ({ ...(await original<typeof import('../usuario/useSincronizacao')>()), sincronizarAgora: vi.fn(async () => null) }))
vi.mock('../imagens-usuario/fila', async (original) => {
  const m = await original<typeof import('../imagens-usuario/fila')>()
  return { ...m, avisarFila: vi.fn(m.avisarFila), gravarEstadoDoEnvio: vi.fn(m.gravarEstadoDoEnvio) }
})
import { avisarFila, gravarEstadoDoEnvio } from '../imagens-usuario/fila'

function apagarBanco() {
  return new Promise<void>((ok) => {
    const r = indexedDB.deleteDatabase('iconodb-usuario')
    r.onsuccess = r.onerror = r.onblocked = () => ok()
  })
}

function copiaDe(eventos: Evento[], extra: Partial<CopiaDeSeguranca> = {}): CopiaDeSeguranca {
  return {
    formato: FORMATO_DA_COPIA,
    versao: 1,
    geradoEm: new Date(T0).toISOString(),
    aparelho: { id: 'zzzzzzzz', nome: 'Mac' },
    aparelhos: {},
    eventos,
    naoEnviados: [],
    base: null,
    estado: consolidar(fundir(eventos)),
    marcas: {},
    numerosConfirmados: {},
    imagens: [],
    observacoes: [],
    ...extra,
  }
}

const Z = 'zzzzzzzz'
const imagem = (seq: number, extensao = 'heic') =>
  ev({ ap: Z, seq, tipo: 'imagem', reg: `IM-${Z}-${seq}`, op: 'criar', campos: { alvoTipo: 'objeto', alvo: 'CA00001', tipo: 'tons', formato: 'webp', extensao, nome: `IMG_${seq}.HEIC` } })
const nota = (seq: number, texto: string) => ev({ ap: Z, seq, tipo: 'nota', reg: `NT-${Z}-${seq}`, op: 'criar', campos: { texto, alvo: 'CA00001' } })

/** As fotos de um .zip, como `lerZip` as daria (só a busca por nome importa aqui). */
function fotosDe(arquivos: Record<string, number[]>): Map<string, () => Promise<Blob>> {
  return new Map(Object.entries(arquivos).map(([nome, bytes]) => [nome, async () => new Blob([new Uint8Array(bytes)])]))
}

/** Uma Escrita cujo `listar` lê os arquivos dela (como o Dropbox), anotando cada prefixo listado. */
function escritaComListagem() {
  const e = escritaFalsa()
  const listados: string[] = []
  const falsa = e as typeof e & { listados: string[]; falharListagem: unknown }
  falsa.listados = listados
  falsa.falharListagem = null
  falsa.listar = async (prefixo: string) => {
    listados.push(prefixo)
    if (falsa.falharListagem) throw falsa.falharListagem
    return [...e.enviados.keys()].filter((c) => c.startsWith(`${prefixo}/`)).map((caminho) => ({ caminho, rev: 'r', tamanho: e.enviados.get(caminho)!.length }))
  }
  return falsa
}

let armazem: ReturnType<typeof armazemMemoria>

beforeEach(async () => {
  await apagarBanco()
  await carregarEstado()
  armazem = armazemMemoria()
  usarArmazemDasImagens(armazem)
  usarCacheDasImagens(cacheMemoria())
  vi.mocked(sincronizarAgora).mockClear()
  vi.mocked(avisarFila).mockClear()
})
afterEach(() => {
  usarArmazemDasImagens(undefined)
  usarCacheDasImagens(undefined)
})

describe('aplicarRestauracao', () => {
  it('grava os eventos numa só transação, deste aparelho, com os ids dos registros da cópia; pede uma sincronização', async () => {
    const copia = copiaDe([nota(1, 'nota TESTE 1'), nota(2, 'nota TESTE 2')])
    const plano = planoDeRestauracao(copia, estadoAtual())
    const r = await aplicarRestauracao(plano, null, { escrita: null })
    const eu = (await aparelhoAtual()).id
    const eventos = await todosEventos()
    expect(eventos).toHaveLength(2)
    expect(eventos.every((e) => e.aparelho === eu && e.id.startsWith(`${eu}-1-`))).toBe(true)
    expect(eventos.map((e) => e.reg).sort()).toEqual([`NT-${Z}-1`, `NT-${Z}-2`])
    expect(estadoAtual().registro('nota', `NT-${Z}-2`)?.campos).toEqual({ texto: 'nota TESTE 2', alvo: 'CA00001' })
    expect(r).toEqual({ fotosRestauradas: 0, fotosSemConferir: true, fotosQueFalharam: 0 })
    expect(sincronizarAgora).toHaveBeenCalledWith('restauracao')
    expect(avisarFila).toHaveBeenCalled()
  })

  it('restaurar duas vezes: zero eventos na segunda, mesmo com a cópia vinda de um relógio adiantado', async () => {
    // A cópia foi feita num aparelho com o relógio 2 dias adiantado: os eventos novos daqui passam dele mesmo assim.
    const adiantado = Date.now() + 2 * 86_400_000
    const copia = copiaDe([ev({ ap: Z, seq: 1, ms: adiantado, tipo: 'nota', reg: `NT-${Z}-1`, op: 'criar', campos: { texto: 'TESTE' } })])
    await aplicarRestauracao(planoDeRestauracao(copia, estadoAtual()), null, { escrita: null })
    expect((await todosEventos())[0]!.hlc > hlc(adiantado, 0, Z)).toBe(true)
    const segundo = planoDeRestauracao(copia, estadoAtual())
    expect(segundo.pedidos).toEqual([])
    await aplicarRestauracao(segundo, null, { escrita: null })
    expect(await todosEventos()).toHaveLength(1)
  })

  it('foco 2: com eventos locais ainda não enviados (e a cópia feita depois deles), nada se duplica nem se perde', async () => {
    await registrar('nota', 'NT-x-1', 'criar', { texto: 'pendente TESTE' })
    await receberEventos([ev({ ap: B, seq: 1, tipo: 'nota', reg: 'NT-bbbbbbbb-1', op: 'criar', campos: { texto: 'de B' } })])
    const daqui = await todosEventos()
    const copia = copiaDe(daqui)
    await registrar('nota', 'NT-x-1', 'alterar', { texto: 'pendente TESTE, mais nova que a cópia' })
    const antes = await todosEventos()
    await aplicarRestauracao(planoDeRestauracao(copia, estadoAtual()), null, { escrita: null })
    expect(await todosEventos()).toEqual(antes)
    expect(estadoAtual().registro('nota', 'NT-x-1')?.campos.texto).toBe('pendente TESTE, mais nova que a cópia')
  })

  it('foco 3: cópia de outra conta (aparelhos de ids desconhecidos): eventos deste aparelho, ids dos registros da cópia', async () => {
    const copia = copiaDe([ev({ ap: 'yyyyyyyy', seq: 4, tipo: 'objeto', reg: 'OB-yyyyyyyy-4', op: 'criar', campos: { periodo: 'CA', titulo: 'Objeto TESTE' } })], {
      numerosConfirmados: { 'OB-yyyyyyyy-4': 'CA00046' },
    })
    await aplicarRestauracao(planoDeRestauracao(copia, estadoAtual()), null, { escrita: null })
    const eu = (await aparelhoAtual()).id
    const eventos = await todosEventos()
    expect(eventos.map((e) => `${e.aparelho} ${e.reg} ${e.op}`)).toEqual([`${eu} OB-yyyyyyyy-4 criar`, `${eu} OB-yyyyyyyy-4 alterar`])
    expect(estadoAtual().registro('objeto', 'OB-yyyyyyyy-4')?.campos).toMatchObject({ titulo: 'Objeto TESTE', numero: 'CA00046' })
  })

  it('fotos: as que faltam no Dropbox e estão no .zip entram na fila; as que estão lá não; e depois sobem sem erro', async () => {
    const copia = copiaDe([imagem(1), imagem(2), imagem(3, 'jpg'), imagem(4)])
    const escrita = escritaComListagem()
    // 2: só o original falta no Dropbox. 3: tudo está lá. 1: nada está lá. 4: falta e o .zip não tem.
    escrita.enviados.set(`usuario/imagens/IM-${Z}-2/tela.webp`, new Uint8Array([20]))
    escrita.enviados.set(`usuario/imagens/IM-${Z}-2/miniatura.webp`, new Uint8Array([21]))
    for (const n of ['tela.webp', 'miniatura.webp', 'original.jpg']) escrita.enviados.set(`usuario/imagens/IM-${Z}-3/${n}`, new Uint8Array([30]))
    const fotos = fotosDe({
      [`imagens/IM-${Z}-1/tela.webp`]: [10],
      [`imagens/IM-${Z}-1/miniatura.webp`]: [11],
      [`imagens/IM-${Z}-1/original.heic`]: [12, 12],
      [`imagens/IM-${Z}-2/tela.webp`]: [20],
      [`imagens/IM-${Z}-2/miniatura.webp`]: [21],
      [`imagens/IM-${Z}-2/original.heic`]: [22, 22],
      [`imagens/IM-${Z}-3/original.jpg`]: [30],
      [`imagens/IM-${Z}-4/tela.webp`]: [40],
    })
    const plano = planoDeRestauracao(copia, estadoAtual())
    const conferencia = await conferirFotos(plano, fotos, escrita)
    expect(conferencia).toMatchObject({ conferido: true, voltam: [`IM-${Z}-1`, `IM-${Z}-2`], semArquivo: [`IM-${Z}-4`] })
    // Revisão 1: uma só listagem (recursiva) de usuario/imagens, para todas as imagens.
    expect(escrita.listados).toEqual(['usuario/imagens'])

    // Sem a listagem de antes, aplicar lista de novo (uma vez).
    const r = await aplicarRestauracao(plano, fotos, { escrita })
    expect(escrita.listados).toEqual(['usuario/imagens', 'usuario/imagens'])
    expect(r).toEqual({ fotosRestauradas: 3, fotosSemConferir: false, fotosQueFalharam: 0 })
    expect(await idsLocais()).toEqual([`IM-${Z}-1`, `IM-${Z}-2`])
    expect(await armazem.listar(`IM-${Z}-2`)).toEqual([`IM-${Z}-2/original.heic`, `IM-${Z}-2/local.json`, `IM-${Z}-2/envio.json`])
    expect(JSON.parse(new TextDecoder().decode((await armazem.ler(`IM-${Z}-2/envio.json`))!)).enviados).toEqual(['tela.webp', 'miniatura.webp'])
    expect(escrita.chamadas).toEqual([])
    expect(avisarFila).toHaveBeenCalled()

    // A fila sobe o que entrou, sem «cópia ausente» para os que já estavam no Dropbox.
    const envio = await enviarImagensPendentes(escrita)
    expect(envio).toMatchObject({ falhas: 0, concluidas: 2 })
    expect([...escrita.enviados.get(`usuario/imagens/IM-${Z}-1/original.heic`)!]).toEqual([12, 12])
    expect([...escrita.enviados.get(`usuario/imagens/IM-${Z}-2/original.heic`)!]).toEqual([22, 22])
    expect(await idsLocais()).toEqual([])

    // De novo: nada a trazer, nada na fila.
    const segundo = planoDeRestauracao(copia, estadoAtual())
    expect(segundo.pedidos).toEqual([])
    expect((await conferirFotos(segundo, fotos, escrita)).voltam).toEqual([])
  })

  it('foco 4: sem Dropbox (sem internet), os registros voltam e as fotos ficam «sem conferir»; nada entra na fila', async () => {
    const copia = copiaDe([imagem(1), nota(2, 'TESTE')])
    const fotos = fotosDe({ [`imagens/IM-${Z}-1/tela.webp`]: [1], [`imagens/IM-${Z}-1/miniatura.webp`]: [1], [`imagens/IM-${Z}-1/original.heic`]: [1] })
    const r = await aplicarRestauracao(planoDeRestauracao(copia, estadoAtual()), fotos, { escrita: null })
    expect(r).toEqual({ fotosRestauradas: 1, fotosSemConferir: true, fotosQueFalharam: 0 })
    expect(estadoAtual().registro('imagem', `IM-${Z}-1`)).toBeDefined()
    expect(await idsLocais()).toEqual([])
    // Mais tarde, com internet: restaurar de novo põe as fotos na fila (sem eventos novos).
    const escrita = escritaComListagem()
    const n = (await todosEventos()).length
    const r2 = await aplicarRestauracao(planoDeRestauracao(copia, estadoAtual()), fotos, { escrita })
    expect(r2).toEqual({ fotosRestauradas: 1, fotosSemConferir: false, fotosQueFalharam: 0 })
    expect(await todosEventos()).toHaveLength(n)
    expect(await idsLocais()).toEqual([`IM-${Z}-1`])
  })

  it('a listagem falha: «sem conferir» e nada entra na fila', async () => {
    const copia = copiaDe([imagem(1), imagem(2)])
    const fotos = fotosDe({ [`imagens/IM-${Z}-1/tela.webp`]: [1], [`imagens/IM-${Z}-1/miniatura.webp`]: [1], [`imagens/IM-${Z}-1/original.heic`]: [1] })
    const escrita = escritaComListagem()
    escrita.falharListagem = new TypeError('Failed to fetch')
    const r = await aplicarRestauracao(planoDeRestauracao(copia, estadoAtual()), fotos, { escrita })
    expect(r).toEqual({ fotosRestauradas: 2, fotosSemConferir: true, fotosQueFalharam: 0 })
    expect(await idsLocais()).toEqual([])
  })

  it('uma foto que já está na fila deste aparelho não é regravada', async () => {
    const copia = copiaDe([imagem(1)])
    await armazem.gravar(`IM-${Z}-1/tela.webp`, new Uint8Array([99]))
    const fotos = fotosDe({ [`imagens/IM-${Z}-1/tela.webp`]: [1], [`imagens/IM-${Z}-1/miniatura.webp`]: [1], [`imagens/IM-${Z}-1/original.heic`]: [1] })
    // Na fila, ela está a caminho: não conta como faltando no Dropbox.
    expect(await conferirFotos(planoDeRestauracao(copia, estadoAtual()), fotos, escritaComListagem())).toMatchObject({ conferido: true, voltam: [], semArquivo: [] })
    await aplicarRestauracao(planoDeRestauracao(copia, estadoAtual()), fotos, { escrita: escritaComListagem() })
    expect([...(await armazem.ler(`IM-${Z}-1/tela.webp`))!]).toEqual([99])
    expect(await armazem.listar(`IM-${Z}-1`)).toEqual([`IM-${Z}-1/tela.webp`])
  })

  it('uma foto do .zip que não abre (danificada) não entra; as outras sim', async () => {
    const copia = copiaDe([imagem(1), imagem(2)])
    const fotos = fotosDe({ [`imagens/IM-${Z}-2/tela.webp`]: [2], [`imagens/IM-${Z}-2/miniatura.webp`]: [2], [`imagens/IM-${Z}-2/original.heic`]: [2] })
    fotos.set(`imagens/IM-${Z}-1/tela.webp`, async () => Promise.reject(new Error('CRC errado')))
    fotos.set(`imagens/IM-${Z}-1/miniatura.webp`, async () => new Blob([new Uint8Array([1])]))
    fotos.set(`imagens/IM-${Z}-1/original.heic`, async () => new Blob([new Uint8Array([1])]))
    const r = await aplicarRestauracao(planoDeRestauracao(copia, estadoAtual()), fotos, { escrita: escritaComListagem() })
    expect(r).toEqual({ fotosRestauradas: 1, fotosSemConferir: false, fotosQueFalharam: 1 })
    expect(await idsLocais()).toEqual([`IM-${Z}-2`])
  })

  it('o envio.json não pôde ser gravado: a pasta sai inteira (a fila não tentaria subir o que já está no Dropbox)', async () => {
    const copia = copiaDe([imagem(1)])
    const escrita = escritaComListagem()
    escrita.enviados.set(`usuario/imagens/IM-${Z}-1/tela.webp`, new Uint8Array([1]))
    escrita.enviados.set(`usuario/imagens/IM-${Z}-1/miniatura.webp`, new Uint8Array([1]))
    vi.mocked(gravarEstadoDoEnvio).mockRejectedValueOnce(new Error('OPFS cheio'))
    const r = await aplicarRestauracao(planoDeRestauracao(copia, estadoAtual()), fotosDe({ [`imagens/IM-${Z}-1/original.heic`]: [1] }), { escrita })
    expect(r).toEqual({ fotosRestauradas: 0, fotosSemConferir: false, fotosQueFalharam: 1 })
    expect(await armazem.listar('')).toEqual([])
  })

  it('segurança: nomes do .zip como «imagens/../../x» ou «/etc/x», e um id de imagem que sairia da pasta, nunca viram caminho', async () => {
    const malicioso = ev({ ap: Z, seq: 9, tipo: 'imagem', reg: 'IM-../../x', op: 'criar', campos: { alvoTipo: 'objeto', alvo: 'CA00001', formato: 'webp', extensao: 'jpg' } })
    const copia = copiaDe([imagem(1), malicioso])
    const fotos = fotosDe({
      'imagens/../../x': [6, 6, 6],
      '/etc/x': [6, 6, 6],
      [`imagens/IM-${Z}-1/../../../x`]: [6],
      [`imagens/IM-${Z}-1/tela.webp`]: [1],
      [`imagens/IM-${Z}-1/miniatura.webp`]: [1],
      [`imagens/IM-${Z}-1/original.heic`]: [1],
      'imagens/IM-../../x/tela.webp': [6],
      'imagens/IM-../../x/miniatura.webp': [6],
      'imagens/IM-../../x/original.jpg': [6],
    })
    const escrita = escritaComListagem()
    const plano = planoDeRestauracao(copia, estadoAtual())
    expect(plano.imagens).toEqual([`IM-${Z}-1`])
    await aplicarRestauracao(plano, fotos, { escrita })
    expect((await armazem.listar('')).sort()).toEqual([`IM-${Z}-1/local.json`, `IM-${Z}-1/miniatura.webp`, `IM-${Z}-1/original.heic`, `IM-${Z}-1/tela.webp`])
    expect(escrita.listados).toEqual(['usuario/imagens'])
    // Nada foi escrito no Dropbox pela restauração (só a fila, que escreve em usuario/imagens/ depois).
    expect(escrita.chamadas).toEqual([])
  })

  it('segurança, com um .zip de verdade (lerZip aceita os nomes): «imagens/../../x», «/etc/x» e «../x» são ignorados do começo ao fim', async () => {
    const copia = copiaDe([imagem(1)])
    async function* entradas() {
      const t = new TextEncoder()
      yield { nome: 'copia.json', dados: t.encode(JSON.stringify(copia)) }
      for (const nome of ['imagens/../../x', '/etc/x', '../x', `imagens/IM-${Z}-1/../../../x`, `imagens/IM-${Z}-1/../tela.webp`]) yield { nome, dados: new Uint8Array([6, 6, 6]) }
      for (const n of ['tela.webp', 'miniatura.webp', 'original.heic']) yield { nome: `imagens/IM-${Z}-1/${n}`, dados: new Uint8Array([1]) }
    }
    const lida = await lerCopia(new File([await montarZip(entradas())], 'iconodb-copia-completa-TESTE.zip'))
    // Só as entradas de imagens/ ficam no mapa; servem só para procurar.
    expect([...lida.fotos!.keys()].some((k) => k === '/etc/x' || k === '../x')).toBe(false)
    const escrita = escritaComListagem()
    const plano = planoDeRestauracao(lida.copia, estadoAtual())
    const r = await aplicarRestauracao(plano, lida.fotos, { escrita })
    expect(r).toEqual({ fotosRestauradas: 1, fotosSemConferir: false, fotosQueFalharam: 0 })
    expect((await armazem.listar('')).sort()).toEqual([`IM-${Z}-1/local.json`, `IM-${Z}-1/miniatura.webp`, `IM-${Z}-1/original.heic`, `IM-${Z}-1/tela.webp`])
    for (const c of await armazem.listar('')) if (!c.endsWith('local.json')) expect([...(await armazem.ler(c))!], c).toEqual([1])
    expect(escrita.listados).toEqual(['usuario/imagens'])
    expect(escrita.chamadas).toEqual([])
  })

  it('a gravação dos eventos falha: nada muda, nada entra na fila, nenhuma sincronização é pedida', async () => {
    const copia = copiaDe([imagem(1)])
    const fotos = fotosDe({ [`imagens/IM-${Z}-1/tela.webp`]: [1], [`imagens/IM-${Z}-1/miniatura.webp`]: [1], [`imagens/IM-${Z}-1/original.heic`]: [1] })
    const plano = planoDeRestauracao(copia, estadoAtual())
    plano.pedidos.push({ tipo: 'nota', reg: '', op: 'criar', campos: {} })
    await expect(aplicarRestauracao(plano, fotos, { escrita: escritaComListagem() as Escrita })).rejects.toThrow()
    expect(await todosEventos()).toEqual([])
    expect(await idsLocais()).toEqual([])
    expect(sincronizarAgora).not.toHaveBeenCalled()
  })
})

describe('revisão 1: uma listagem, reaproveitada', () => {
  const fotosDe1 = () => fotosDe({ [`imagens/IM-${Z}-1/tela.webp`]: [1], [`imagens/IM-${Z}-1/miniatura.webp`]: [1], [`imagens/IM-${Z}-1/original.heic`]: [1] })

  it('a listagem de «Lendo…» (conferirFotos) passada a aplicarRestauracao: nenhuma chamada ao Dropbox ao restaurar', async () => {
    const copia = copiaDe([imagem(1), imagem(2)])
    const escrita = escritaComListagem()
    for (const n of ['tela.webp', 'miniatura.webp', 'original.heic']) escrita.enviados.set(`usuario/imagens/IM-${Z}-2/${n}`, new Uint8Array([2]))
    const plano = planoDeRestauracao(copia, estadoAtual())
    const conferencia = await conferirFotos(plano, fotosDe1(), escrita)
    expect(conferencia.listagem).not.toBeNull()
    expect(escrita.listados).toEqual(['usuario/imagens'])
    const r = await aplicarRestauracao(plano, fotosDe1(), { escrita, listagem: conferencia.listagem })
    expect(escrita.listados).toEqual(['usuario/imagens'])
    expect(r).toEqual({ fotosRestauradas: 2, fotosSemConferir: false, fotosQueFalharam: 0 })
    expect(await idsLocais()).toEqual([`IM-${Z}-1`])
  })

  it('listagemReaproveitavel: o mesmo plano e ainda fresca → a listagem; outro plano ou velha → null (lista de novo)', async () => {
    const copia = copiaDe([imagem(1), nota(2, 'TESTE')])
    const escrita = escritaComListagem()
    const plano = planoDeRestauracao(copia, estadoAtual())
    const { listagem } = await conferirFotos(plano, fotosDe1(), escrita)
    const agora = listagem!.em
    expect(listagemReaproveitavel({ plano, listagem }, planoDeRestauracao(copia, estadoAtual()), agora + 1000)).toBe(listagem)
    expect(listagemReaproveitavel({ plano, listagem }, plano, agora + LISTAGEM_FRESCA_MS + 1)).toBeNull()
    expect(listagemReaproveitavel({ plano, listagem: null }, plano, agora)).toBeNull()
    // O estado mudou desde o resumo (a nota chegou): outro plano.
    await receberEventos([nota(2, 'TESTE')])
    expect(listagemReaproveitavel({ plano, listagem }, planoDeRestauracao(copia, estadoAtual()), agora + 1000)).toBeNull()
  })
})

describe('conferirFotos', () => {
  it('cópia sem fotos (.json): as que faltam no Dropbox ficam em `semArquivo`', async () => {
    const plano = planoDeRestauracao(copiaDe([imagem(1), imagem(2), ev({ ap: A, seq: 1, tipo: 'nota', reg: 'NT-aaaaaaaa-1', op: 'criar', campos: {} })]), fundir([]))
    const escrita = escritaComListagem()
    for (const n of ['tela.webp', 'miniatura.webp', 'original.heic']) escrita.enviados.set(`usuario/imagens/IM-${Z}-2/${n}`, new Uint8Array([1]))
    expect(await conferirFotos(plano, null, escrita)).toMatchObject({ conferido: true, voltam: [], semArquivo: [`IM-${Z}-1`] })
  })

  it('sem Dropbox, ou com a listagem falhando: não conferido', async () => {
    const plano = planoDeRestauracao(copiaDe([imagem(1)]), fundir([]))
    expect(await conferirFotos(plano, null, null)).toMatchObject({ conferido: false, voltam: [], semArquivo: [] })
    const escrita = escritaComListagem()
    escrita.falharListagem = new TypeError('Failed to fetch')
    expect(await conferirFotos(plano, null, escrita)).toMatchObject({ conferido: false, voltam: [], semArquivo: [] })
  })

  it('o Dropbox pode devolver o caminho com outras maiúsculas (path_display): conta como presente', async () => {
    const plano = planoDeRestauracao(copiaDe([imagem(1)]), fundir([]))
    const escrita = escritaComListagem()
    escrita.listar = async () => ['Tela.webp', 'MINIATURA.webp', 'original.HEIC'].map((n) => ({ caminho: `usuario/imagens/IM-${Z}-1/${n}`, rev: 'r', tamanho: 1 }))
    expect(await conferirFotos(plano, null, escrita)).toMatchObject({ conferido: true, voltam: [], semArquivo: [] })
  })
})
