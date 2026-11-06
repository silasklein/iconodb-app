// O .zip das cópias, montado e lido em pedaços (2C, bloco 1, Tarefa 5).
//
// Regra: nunca ter o arquivo inteiro num só ArrayBuffer (no iPhone a cópia completa passa de 150 MB).
//  - montarZip: sem compressão (ZipPassThrough do fflate); cada pedaço que sai vira um Blob na hora.
//  - lerZip: lê só o fim do arquivo (diretório central) por Blob.slice; cada entrada armazenada é uma
//    fatia do arquivo, aberta sob demanda. Uma comprimida (método 8) é lida em fatias e descomprimida aos
//    poucos (Inflate do fflate), parando assim que a saída passa do tamanho declarado (deflate-bomba).
// Sem ZIP64 (menos de 65 535 entradas e menos de 4 GB): marcadores ZIP64 são tratados como danificado.
import { Inflate, Zip, ZipPassThrough } from 'fflate'

export type MotivoDeErroDeZip = 'danificado' | 'nao-e-zip'

export class ErroDeZip extends Error {
  readonly motivo: MotivoDeErroDeZip
  constructor(motivo: MotivoDeErroDeZip, detalhe?: string) {
    super(detalhe ?? (motivo === 'nao-e-zip' ? 'O arquivo não é um .zip.' : 'O .zip está danificado.'))
    this.name = 'ErroDeZip'
    this.motivo = motivo
  }
}

const danificado = (detalhe?: string) => new ErroDeZip('danificado', detalhe)

const PEDACO = 1024 * 1024
const MAX_COMENTARIO = 65_535
const TAM_EOCD = 22
const MAX_DEFLATE = 64 * 1024 * 1024
// método 8: o arquivo é lido em fatias de LEITURA bytes e cada fatia vai ao descompressor em pedaços de
// EMPURRAO bytes; depois de cada pedaço a saída é contada. Um pedaço de 16 KiB descomprime no máximo ~16 MiB,
// então uma bomba custa no pior caso um pedaço a mais que o tamanho declarado.
const LEITURA = 64 * 1024
const EMPURRAO = 16 * 1024
const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50

const comoParte = (u: Uint8Array) => u as unknown as BlobPart

export async function montarZip(
  entradas: AsyncIterable<{ nome: string; dados: Blob | Uint8Array }>,
  aoAvancar?: (feitas: number) => void,
): Promise<Blob> {
  const partes: Blob[] = []
  let falha: Error | null = null
  let terminou = false
  const zip = new Zip((erro, pedaco, final) => {
    if (erro) {
      falha = erro
      return
    }
    // O pedaço pode ser uma janela de um buffer reaproveitado: o Blob copia na hora.
    partes.push(new Blob([comoParte(pedaco)]))
    if (final) terminou = true
  })
  let feitas = 0
  const vistos = new Set<string>()
  try {
    for await (const { nome, dados } of entradas) {
      if (vistos.has(nome)) throw new Error(`Nome repetido no .zip: ${nome}`)
      vistos.add(nome)
      const arq = new ZipPassThrough(nome)
      zip.add(arq)
      // ArrayBuffer.isView, não instanceof: no jsdom o Uint8Array vem de outro "realm".
      if (ArrayBuffer.isView(dados)) {
        arq.push(new Uint8Array(dados.buffer, dados.byteOffset, dados.byteLength), true)
      } else if (dados.size === 0) {
        arq.push(new Uint8Array(0), true)
      } else {
        for (let de = 0; de < dados.size; de += PEDACO) {
          const ate = Math.min(de + PEDACO, dados.size)
          const bytes = new Uint8Array(await dados.slice(de, ate).arrayBuffer())
          arq.push(bytes, ate >= dados.size)
        }
      }
      if (falha) throw falha
      feitas++
      aoAvancar?.(feitas)
    }
    zip.end()
  } catch (e) {
    zip.terminate()
    throw e
  }
  if (falha) throw falha
  if (!terminou) throw new Error('O .zip não foi concluído.')
  return new Blob(partes, { type: 'application/zip' })
}

// CRC-32 em pedaços (o fflate não exporta o seu).
const TABELA = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crcAcumular(crc: number, dados: Uint8Array): number {
  let c = crc
  for (let i = 0; i < dados.length; i++) c = TABELA[(c ^ dados[i]!) & 255]! ^ (c >>> 8)
  return c
}

async function crcDoBlob(blob: Blob): Promise<number> {
  let c = 0xffffffff
  for (let de = 0; de < blob.size; de += PEDACO) {
    c = crcAcumular(c, new Uint8Array(await blob.slice(de, Math.min(de + PEDACO, blob.size)).arrayBuffer()))
  }
  return (c ^ 0xffffffff) >>> 0
}

type Cadastro = {
  nome: string
  metodo: number
  crc: number
  tamComprimido: number
  tamOriginal: number
  deslocamento: number
}

export async function lerZip(arquivo: Blob): Promise<Map<string, () => Promise<Blob>>> {
  const total = arquivo.size
  const comecaComoZip = async () => {
    if (total < 4) return false
    const v = new DataView(await arquivo.slice(0, 4).arrayBuffer())
    const s = v.getUint32(0, true)
    return s === SIG_LOCAL || s === SIG_EOCD || s === SIG_CENTRAL
  }
  if (total < TAM_EOCD) throw new ErroDeZip((await comecaComoZip()) ? 'danificado' : 'nao-e-zip')

  const inicioFim = Math.max(0, total - (TAM_EOCD + MAX_COMENTARIO))
  const fim = new Uint8Array(await arquivo.slice(inicioFim, total).arrayBuffer())
  const dvFim = new DataView(fim.buffer, fim.byteOffset, fim.byteLength)
  let e = fim.length - TAM_EOCD
  // só vale a assinatura cujo comentário cabe até o fim do arquivo (uma assinatura dentro do comentário não vale)
  while (e >= 0 && !(dvFim.getUint32(e, true) === SIG_EOCD && e + TAM_EOCD + dvFim.getUint16(e + 20, true) <= fim.length)) e--
  if (e < 0) throw new ErroDeZip((await comecaComoZip()) ? 'danificado' : 'nao-e-zip')

  const disco = dvFim.getUint16(e + 4, true)
  const discoCentral = dvFim.getUint16(e + 6, true)
  const nesteDisco = dvFim.getUint16(e + 8, true)
  const quantidade = dvFim.getUint16(e + 10, true)
  const tamCentral = dvFim.getUint32(e + 12, true)
  const inicioCentral = dvFim.getUint32(e + 16, true)
  if (quantidade === 0xffff || tamCentral === 0xffffffff || inicioCentral === 0xffffffff) {
    throw danificado('ZIP64 não é aceito.')
  }
  if (disco !== 0 || discoCentral !== 0 || nesteDisco !== quantidade) throw danificado('.zip em várias partes.')
  const posEocd = inicioFim + e
  if (inicioCentral + tamCentral > posEocd) throw danificado('Diretório central fora do arquivo.')

  const central = new Uint8Array(await arquivo.slice(inicioCentral, inicioCentral + tamCentral).arrayBuffer())
  const dv = new DataView(central.buffer, central.byteOffset, central.byteLength)
  const decodificador = new TextDecoder('utf-8')
  const cadastros: Cadastro[] = []
  const nomes = new Set<string>()
  let p = 0
  for (let i = 0; i < quantidade; i++) {
    if (p + 46 > central.length || dv.getUint32(p, true) !== SIG_CENTRAL) throw danificado('Diretório central ilegível.')
    const flags = dv.getUint16(p + 8, true)
    const metodo = dv.getUint16(p + 10, true)
    const crc = dv.getUint32(p + 16, true)
    const tamComprimido = dv.getUint32(p + 20, true)
    const tamOriginal = dv.getUint32(p + 24, true)
    const nNome = dv.getUint16(p + 28, true)
    const nExtra = dv.getUint16(p + 30, true)
    const nComentario = dv.getUint16(p + 32, true)
    const deslocamento = dv.getUint32(p + 42, true)
    if (p + 46 + nNome + nExtra + nComentario > central.length) throw danificado('Diretório central ilegível.')
    if (flags & 1) throw danificado('Entrada cifrada.')
    if (metodo !== 0 && metodo !== 8) throw danificado('Método de compressão desconhecido.')
    if (tamComprimido === 0xffffffff || tamOriginal === 0xffffffff || deslocamento === 0xffffffff) {
      throw danificado('ZIP64 não é aceito.')
    }
    if (metodo === 0 && tamComprimido !== tamOriginal) throw danificado('Tamanhos incoerentes.')
    if (metodo === 8) {
      // o deflate não passa de ~1032:1; e tetos absolutos, porque a saída fica toda na memória e a
      // descompressão roda na linha principal
      if (tamOriginal > tamComprimido * 1032 + 1024) throw danificado('Tamanho declarado impossível para o deflate.')
      if (tamOriginal > MAX_DEFLATE || tamComprimido > MAX_DEFLATE) throw danificado('Entrada comprimida grande demais.')
    }
    // o dado fica antes do diretório central, depois de um cabeçalho local de ao menos 30 bytes + nome
    if (deslocamento + 30 + nNome + tamComprimido > inicioCentral) throw danificado('Entrada fora do arquivo.')
    const nome = decodificador.decode(central.subarray(p + 46, p + 46 + nNome))
    if (nomes.has(nome)) throw danificado(`Nome repetido no .zip: ${nome}`)
    nomes.add(nome)
    cadastros.push({ nome, metodo, crc, tamComprimido, tamOriginal, deslocamento })
    p += 46 + nNome + nExtra + nComentario
  }

  const abrir = (c: Cadastro) => async (): Promise<Blob> => {
    const cab = new DataView(await arquivo.slice(c.deslocamento, c.deslocamento + 30).arrayBuffer())
    if (cab.byteLength < 30 || cab.getUint32(0, true) !== SIG_LOCAL) throw danificado('Cabeçalho local ilegível.')
    const inicio = c.deslocamento + 30 + cab.getUint16(26, true) + cab.getUint16(28, true)
    const ate = inicio + c.tamComprimido
    if (ate > inicioCentral) throw danificado('Dado da entrada fora do arquivo (cabeçalho local).')
    const fatia = arquivo.slice(inicio, ate)
    if (c.metodo === 0) {
      if ((await crcDoBlob(fatia)) !== c.crc) throw danificado(`CRC errado em ${c.nome}.`)
      return fatia
    }
    return descomprimir(c, fatia)
  }

  const descomprimir = async (c: Cadastro, fatia: Blob): Promise<Blob> => {
    const partes: Uint8Array[] = []
    let saiu = 0
    let crc = 0xffffffff
    let terminou = false
    const inflador = new Inflate((pedaco, final) => {
      saiu += pedaco.length
      // passou do declarado: para já, sem guardar nem conferir o resto
      if (saiu > c.tamOriginal) return
      if (pedaco.length) {
        partes.push(pedaco)
        crc = crcAcumular(crc, pedaco)
      }
      if (final) terminou = true
    })
    try {
      if (fatia.size === 0) inflador.push(new Uint8Array(0), true)
      for (let de = 0; de < fatia.size && saiu <= c.tamOriginal; de += LEITURA) {
        const ate = Math.min(de + LEITURA, fatia.size)
        const bytes = new Uint8Array(await fatia.slice(de, ate).arrayBuffer())
        for (let i = 0; i < bytes.length && saiu <= c.tamOriginal; i += EMPURRAO) {
          const fim = Math.min(i + EMPURRAO, bytes.length)
          inflador.push(bytes.subarray(i, fim), ate >= fatia.size && fim >= bytes.length)
        }
      }
    } catch {
      throw danificado(`Dados comprimidos ilegíveis em ${c.nome}.`)
    }
    if (saiu !== c.tamOriginal || !terminou) throw danificado(`Tamanho errado em ${c.nome}.`)
    if (((crc ^ 0xffffffff) >>> 0) !== c.crc) throw danificado(`CRC errado em ${c.nome}.`)
    return new Blob(partes.map(comoParte))
  }

  const mapa = new Map<string, () => Promise<Blob>>()
  for (const c of cadastros) mapa.set(c.nome, abrir(c))
  return mapa
}
