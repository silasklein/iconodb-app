import { Deflate, Inflate, zipSync, strToU8 } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErroDeZip, lerZip, montarZip } from './zip'

type Entrada = { nome: string; dados: Blob | Uint8Array }

async function* de(lista: Entrada[]): AsyncGenerator<Entrada> {
  for (const e of lista) yield e
}

const bytesDe = async (b: Blob) => new Uint8Array(await b.arrayBuffer())

function sintetico(n: number, semente: number): Uint8Array {
  const u = new Uint8Array(n)
  for (let i = 0; i < n; i++) u[i] = (i * 31 + semente * 7 + (i >> 8)) & 255
  return u
}

afterEach(() => vi.restoreAllMocks())

describe('montarZip e lerZip', () => {
  it('ida e volta byte a byte: nomes com acento, entrada vazia e 3 fotos', async () => {
    const fotos = [sintetico(5000, 1), sintetico(70_000, 2), sintetico(300, 3)]
    const entradas: Entrada[] = [
      { nome: 'registros/ações-café.json', dados: strToU8('{"título":"Ícone — São João"}') },
      { nome: 'vazio.txt', dados: new Uint8Array(0) },
      ...fotos.map((f, i) => ({ nome: `fotos/imagem-${i + 1}.jpg`, dados: i === 1 ? new Blob([f as BlobPart]) : f })),
    ]
    const avancos: number[] = []
    const zip = await montarZip(de(entradas), (n) => avancos.push(n))
    expect(zip.type).toBe('application/zip')
    expect(avancos[avancos.length - 1]).toBe(5)

    const mapa = await lerZip(zip)
    expect([...mapa.keys()]).toEqual(entradas.map((e) => e.nome))
    expect(new TextDecoder().decode(await bytesDe(await mapa.get('registros/ações-café.json')!()))).toBe(
      '{"título":"Ícone — São João"}',
    )
    expect((await mapa.get('vazio.txt')!()).size).toBe(0)
    for (let i = 0; i < 3; i++) {
      expect(await bytesDe(await mapa.get(`fotos/imagem-${i + 1}.jpg`)!())).toEqual(fotos[i])
    }
  })

  it('marca nomes com acento como UTF-8 (bit 11) e é lido por quem entende o formato', async () => {
    const zip = await montarZip(de([{ nome: 'ação.txt', dados: strToU8('x') }]))
    const u = await bytesDe(zip)
    // assinatura do cabeçalho local + bit 11 dos flags (byte 7, valor 0x08)
    expect(u[7]! & 0x08).toBe(0x08)
  })

  it('lê uma entrada comprimida (método 8) feita por outro programa', async () => {
    const texto = 'abc '.repeat(5000)
    // new Uint8Array(...): no jsdom o strToU8 (TextEncoder do Node) devolve um Uint8Array de outro realm,
    // que o zipSync do fflate não reconhece.
    const feito = zipSync({ 'a/ç.txt': new Uint8Array(strToU8(texto)), 'b.bin': [sintetico(1000, 9), { level: 0 }] }, { level: 6 })
    const mapa = await lerZip(new Blob([feito as BlobPart]))
    expect(new TextDecoder().decode(await bytesDe(await mapa.get('a/ç.txt')!()))).toBe(texto)
    expect(await bytesDe(await mapa.get('b.bin')!())).toEqual(sintetico(1000, 9))
  })

  it('arquivo truncado: danificado', async () => {
    const zip = await montarZip(de([{ nome: 'a.txt', dados: sintetico(4000, 1) }]))
    const cortado = zip.slice(0, zip.size - 30)
    await expect(lerZip(cortado)).rejects.toMatchObject({ name: 'ErroDeZip', motivo: 'danificado' })
  })

  it('um JSON qualquer: nao-e-zip; arquivo minúsculo e vazio também', async () => {
    const erro = await lerZip(new Blob(['{"a":1, "b": "um texto qualquer, mais longo que 22 bytes"}'])).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroDeZip)
    expect((erro as ErroDeZip).motivo).toBe('nao-e-zip')
    await expect(lerZip(new Blob([]))).rejects.toMatchObject({ motivo: 'nao-e-zip' })
    await expect(lerZip(new Blob(['{}']))).rejects.toMatchObject({ motivo: 'nao-e-zip' })
  })

  it('CRC errado é percebido ao abrir a entrada, não ao ler o diretório', async () => {
    const zip = await montarZip(de([{ nome: 'a.txt', dados: strToU8('conteúdo de teste') }, { nome: 'b.txt', dados: strToU8('outro') }]))
    const u = await bytesDe(zip)
    // o conteúdo de a.txt começa depois do cabeçalho local (30 + nome 5 = 35)
    u[35] = u[35]! ^ 0xff
    const mapa = await lerZip(new Blob([u as BlobPart]))
    await expect(mapa.get('a.txt')!()).rejects.toMatchObject({ motivo: 'danificado' })
    expect(new TextDecoder().decode(await bytesDe(await mapa.get('b.txt')!()))).toBe('outro')
  })

  it('método desconhecido e marcadores ZIP64: danificado', async () => {
    const zip = await montarZip(de([{ nome: 'a.txt', dados: strToU8('x') }]))
    const u = await bytesDe(zip)
    const dv = new DataView(u.buffer)
    let eocd = u.length - 22
    while (dv.getUint32(eocd, true) !== 0x06054b50) eocd--
    const cd = dv.getUint32(eocd + 16, true)

    const metodo = u.slice()
    new DataView(metodo.buffer).setUint16(cd + 10, 99, true)
    await expect(lerZip(new Blob([metodo as BlobPart]))).rejects.toMatchObject({
      motivo: 'danificado',
      message: expect.stringContaining('Método de compressão'),
    })

    const z64 = u.slice()
    new DataView(z64.buffer).setUint32(eocd + 16, 0xffffffff, true)
    await expect(lerZip(new Blob([z64 as BlobPart]))).rejects.toMatchObject({
      motivo: 'danificado',
      message: expect.stringContaining('ZIP64'),
    })

    const incoerente = u.slice()
    new DataView(incoerente.buffer).setUint32(cd + 20, 5000, true) // armazenada: tamanhos diferentes
    await expect(lerZip(new Blob([incoerente as BlobPart]))).rejects.toMatchObject({
      motivo: 'danificado',
      message: expect.stringContaining('Tamanhos incoerentes'),
    })
  })

  // --- ramos de arquivo malformado, cada um preso pela mensagem ---
  async function umaEntrada(extra: Entrada[] = []) {
    const zip = await montarZip(de([{ nome: 'a.txt', dados: strToU8('conteúdo de teste') }, ...extra]))
    const u = await bytesDe(zip)
    const dv = new DataView(u.buffer)
    let eocd = u.length - 22
    while (dv.getUint32(eocd, true) !== 0x06054b50) eocd--
    return { u, dv, eocd, cd: dv.getUint32(eocd + 16, true) }
  }
  const abrirMal = (u: Uint8Array) => lerZip(new Blob([u as BlobPart]))

  it('«Entrada fora do arquivo»: tamanhos (os dois) ou deslocamento grandes demais', async () => {
    const a = await umaEntrada()
    a.dv.setUint32(a.cd + 20, 50_000, true)
    a.dv.setUint32(a.cd + 24, 50_000, true)
    await expect(abrirMal(a.u)).rejects.toMatchObject({ motivo: 'danificado', message: expect.stringContaining('Entrada fora do arquivo') })
    const b = await umaEntrada()
    b.dv.setUint32(b.cd + 42, 50_000, true)
    await expect(abrirMal(b.u)).rejects.toMatchObject({ motivo: 'danificado', message: expect.stringContaining('Entrada fora do arquivo') })
  })

  it('início e tamanho do diretório central inflados: danificado', async () => {
    const a = await umaEntrada()
    a.dv.setUint32(a.eocd + 12, 100_000, true)
    await expect(abrirMal(a.u)).rejects.toMatchObject({ motivo: 'danificado', message: expect.stringContaining('Diretório central fora') })
    const b = await umaEntrada()
    b.dv.setUint32(b.eocd + 16, b.u.length - 10, true)
    await expect(abrirMal(b.u)).rejects.toMatchObject({ motivo: 'danificado', message: expect.stringContaining('Diretório central fora') })
  })

  it('nExtra do cabeçalho local inflado: percebido ao abrir a entrada', async () => {
    const a = await umaEntrada()
    a.dv.setUint16(28, 60_000, true)
    const mapa = await abrirMal(a.u)
    await expect(mapa.get('a.txt')!()).rejects.toMatchObject({ motivo: 'danificado', message: expect.stringContaining('Dado da entrada fora') })
  })

  it('entrada cifrada e .zip em várias partes: danificado', async () => {
    const a = await umaEntrada()
    a.dv.setUint16(a.cd + 8, a.dv.getUint16(a.cd + 8, true) | 1, true)
    await expect(abrirMal(a.u)).rejects.toMatchObject({ motivo: 'danificado', message: expect.stringContaining('cifrada') })
    const b = await umaEntrada()
    b.dv.setUint16(b.eocd + 4, 1, true)
    await expect(abrirMal(b.u)).rejects.toMatchObject({ motivo: 'danificado', message: expect.stringContaining('várias partes') })
  })

  it('entrada comprimida com CRC errado: danificado ao abrir', async () => {
    const feito = zipSync({ 'a.txt': new Uint8Array(strToU8('abc '.repeat(500))) }, { level: 6 })
    const u = new Uint8Array(feito)
    const dv = new DataView(u.buffer)
    let eocd = u.length - 22
    while (dv.getUint32(eocd, true) !== 0x06054b50) eocd--
    const cd = dv.getUint32(eocd + 16, true)
    expect(dv.getUint16(cd + 10, true)).toBe(8)
    dv.setUint32(cd + 16, dv.getUint32(cd + 16, true) ^ 1, true)
    const mapa = await abrirMal(u)
    await expect(mapa.get('a.txt')!()).rejects.toMatchObject({ motivo: 'danificado', message: expect.stringContaining('CRC errado') })
  })

  it('método 8: tamanho declarado impossível ou acima de 64 MiB é recusado antes de alocar', async () => {
    const texto = new Uint8Array(strToU8('abc '.repeat(500)))
    const u = new Uint8Array(zipSync({ 'a.txt': texto }, { level: 6 }))
    const dv = new DataView(u.buffer)
    let eocd = u.length - 22
    while (dv.getUint32(eocd, true) !== 0x06054b50) eocd--
    const cd = dv.getUint32(eocd + 16, true)
    const csize = dv.getUint32(cd + 20, true)
    // um pouco acima do máximo do deflate (1032:1 + 1024)
    dv.setUint32(cd + 24, csize * 1032 + 1025, true)
    await expect(abrirMal(u)).rejects.toMatchObject({ motivo: 'danificado', message: expect.stringContaining('impossível') })

    // dentro da razão, mas acima do teto absoluto de 64 MiB (dados incompressíveis de ~100 KB)
    const aleatorio = new Uint8Array(100_000)
    let x = 123456789
    for (let i = 0; i < aleatorio.length; i++) {
      x ^= x << 13
      x ^= x >>> 17
      x ^= x << 5
      aleatorio[i] = x & 255
    }
    const g = new Uint8Array(zipSync({ 'b.bin': aleatorio }, { level: 6 }))
    const gv = new DataView(g.buffer)
    let ge = g.length - 22
    while (gv.getUint32(ge, true) !== 0x06054b50) ge--
    const gcd = gv.getUint32(ge + 16, true)
    expect(gv.getUint16(gcd + 10, true)).toBe(8)
    expect(gv.getUint32(gcd + 20, true) * 1032 + 1024).toBeGreaterThan(64 * 1024 * 1024 + 1)
    gv.setUint32(gcd + 24, 64 * 1024 * 1024 + 1, true)
    await expect(abrirMal(g)).rejects.toMatchObject({ motivo: 'danificado', message: expect.stringContaining('grande demais') })
  })

  // --- deflate-bomba: declara pouco e descomprime muito ---
  function crcDe(u: Uint8Array): number {
    let c = 0xffffffff
    for (let i = 0; i < u.length; i++) {
      c ^= u[i]!
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    return (c ^ 0xffffffff) >>> 0
  }

  // um .zip de uma entrada, montado à mão, com os tamanhos e o CRC que o teste quiser declarar
  function zipDeUmaEntrada(nome: string, dados: Uint8Array, d: { metodo: number; crc: number; tamComprimido: number; tamOriginal: number }) {
    const n = strToU8(nome)
    const local = new Uint8Array(30 + n.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(8, d.metodo, true)
    lv.setUint32(14, d.crc, true)
    lv.setUint32(18, d.tamComprimido, true)
    lv.setUint32(22, d.tamOriginal, true)
    lv.setUint16(26, n.length, true)
    local.set(n, 30)
    const central = new Uint8Array(46 + n.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(10, d.metodo, true)
    cv.setUint32(16, d.crc, true)
    cv.setUint32(20, d.tamComprimido, true)
    cv.setUint32(24, d.tamOriginal, true)
    cv.setUint16(28, n.length, true)
    cv.setUint32(42, 0, true)
    central.set(n, 46)
    const eocd = new Uint8Array(22)
    const ev = new DataView(eocd.buffer)
    ev.setUint32(0, 0x06054b50, true)
    ev.setUint16(8, 1, true)
    ev.setUint16(10, 1, true)
    ev.setUint32(12, central.length, true)
    ev.setUint32(16, local.length + dados.length, true)
    return new Blob([local as BlobPart, dados as BlobPart, central as BlobPart, eocd as BlobPart])
  }

  // 256 MiB de zeros, comprimidos aos poucos (~250 KB de deflate)
  function bomba(): Uint8Array {
    const partes: Uint8Array[] = []
    const d = new Deflate({ level: 9 }, (p) => partes.push(p))
    const mega = new Uint8Array(1024 * 1024)
    for (let i = 0; i < 256; i++) d.push(mega, i === 255)
    const u = new Uint8Array(partes.reduce((s, p) => s + p.length, 0))
    let o = 0
    for (const p of partes) {
      u.set(p, o)
      o += p.length
    }
    return u
  }

  it('deflate-bomba (declara 1 KB, descomprime 256 MiB): danificado, lendo e descomprimindo só o começo', async () => {
    const dados = bomba()
    expect(dados.length).toBeGreaterThan(200_000)
    const declarado = 1024
    const arquivo = zipDeUmaEntrada('copia.json', dados, { metodo: 8, crc: crcDe(new Uint8Array(declarado)), tamComprimido: dados.length, tamOriginal: declarado })
    const mapa = await lerZip(arquivo)

    const lidos: number[] = []
    const ler = Blob.prototype.arrayBuffer
    vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(function (this: Blob) {
      lidos.push(this.size)
      return ler.call(this)
    })
    let alimentado = 0
    const empurrar = Inflate.prototype.push
    vi.spyOn(Inflate.prototype, 'push').mockImplementation(function (this: Inflate, pedaco: Uint8Array, final?: boolean) {
      alimentado += pedaco.length
      empurrar.call(this, pedaco, final)
    })

    const inicio = performance.now()
    await expect(mapa.get('copia.json')!()).rejects.toMatchObject({ motivo: 'danificado', message: expect.stringContaining('Tamanho errado') })
    const ms = performance.now() - inicio
    // o descompressor recebe no máximo um pedaço pequeno depois de passar do tamanho declarado
    expect(alimentado).toBeGreaterThan(0)
    expect(alimentado).toBeLessThanOrEqual(Math.ceil(declarado / 1032) + 16 * 1024)
    // e o arquivo não é lido inteiro: só o cabeçalho local e uma fatia do começo da entrada
    expect(lidos.reduce((s, n) => s + n, 0)).toBeLessThanOrEqual(30 + 64 * 1024 + 64)
    expect(ms).toBeLessThan(2000)
  }, 60_000)

  it('método 8: tamanho comprimido acima de 64 MiB é recusado ao ler o diretório', async () => {
    const dados = new Uint8Array(16)
    const arquivo = zipDeUmaEntrada('a.bin', dados, { metodo: 8, crc: 0, tamComprimido: 64 * 1024 * 1024 + 1, tamOriginal: 10 })
    await expect(lerZip(arquivo)).rejects.toMatchObject({ motivo: 'danificado', message: expect.stringContaining('grande demais') })
  })

  it('método 8 em pedaços: uma entrada maior que várias fatias volta igual (tamanho e CRC conferidos)', async () => {
    const grande = sintetico(600_000 + 777, 5)
    const feito = zipSync({ 'g.bin': [grande, { level: 1 }] })
    expect(new DataView(feito.buffer).getUint16(8, true)).toBe(8)
    const mapa = await lerZip(new Blob([feito as BlobPart]))
    expect(await bytesDe(await mapa.get('g.bin')!())).toEqual(grande)
  })

  it('comentário do arquivo com «PK\\x05\\x06» dentro não é tomado como o fim do diretório', async () => {
    const a = await umaEntrada()
    const falso = new Uint8Array(30).fill(0xff)
    falso.set([0x50, 0x4b, 0x05, 0x06], 0)
    const u = new Uint8Array(a.u.length + falso.length)
    u.set(a.u)
    u.set(falso, a.u.length)
    new DataView(u.buffer).setUint16(a.eocd + 20, falso.length, true)
    const mapa = await abrirMal(u)
    expect([...mapa.keys()]).toEqual(['a.txt'])
    expect(new TextDecoder().decode(await bytesDe(await mapa.get('a.txt')!()))).toBe('conteúdo de teste')
  })

  it('nomes repetidos: lerZip recusa (danificado) e montarZip recusa', async () => {
    const a = await umaEntrada([{ nome: 'b.txt', dados: strToU8('outro') }])
    const segundo = a.cd + 46 + 5
    a.u.set(strToU8('a.txt'), segundo + 46)
    await expect(abrirMal(a.u)).rejects.toMatchObject({ motivo: 'danificado', message: expect.stringContaining('repetido') })
    await expect(montarZip(de([{ nome: 'x', dados: strToU8('1') }, { nome: 'x', dados: strToU8('2') }]))).rejects.toThrow(/repetido/)
  })

  it('60 entradas de 2 MB: montar e ler sem arrayBuffer() do arquivo inteiro', async () => {
    const MB2 = 2 * 1024 * 1024
    const base = sintetico(MB2, 4)
    async function* sessenta(): AsyncGenerator<Entrada> {
      for (let i = 0; i < 60; i++) {
        const d = base.slice()
        d[0] = i
        d[MB2 - 1] = 255 - i
        yield { nome: `fotos/f${String(i).padStart(2, '0')}.jpg`, dados: new Blob([d as BlobPart]) }
      }
    }
    const tamanhos: number[] = []
    const original = Blob.prototype.arrayBuffer
    vi.spyOn(Blob.prototype, 'arrayBuffer').mockImplementation(function (this: Blob) {
      tamanhos.push(this.size)
      return original.call(this)
    })

    const zip = await montarZip(sessenta())
    expect(zip.size).toBeGreaterThan(60 * MB2)
    const mapa = await lerZip(zip)
    expect(mapa.size).toBe(60)
    for (const i of [0, 33, 59]) {
      const u = await bytesDe(await mapa.get(`fotos/f${String(i).padStart(2, '0')}.jpg`)!())
      expect(u.length).toBe(MB2)
      expect(u[0]).toBe(i)
      expect(u[MB2 - 1]).toBe(255 - i)
    }
    expect(tamanhos.length).toBeGreaterThan(0)
    // a maior leitura é a de uma entrada aberta pelo próprio teste (2 MiB); nada maior
    expect(Math.max(...tamanhos)).toBeLessThanOrEqual(2 * 1024 * 1024)
  }, 60_000)
})
