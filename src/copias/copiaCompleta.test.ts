/**
 * A cópia completa, com fotos (2C, bloco 1, Tarefa 6): um .zip com `copia.json` (o mesmo arquivo do botão «Baixar cópia»,
 * byte a byte), `imagens/<id>/<arquivo>` de cada imagem não excluída e `LEIA-ME.txt`. Cada arquivo vem da fila local
 * (OPFS) ou, se não estiver lá, do Dropbox, um por vez. Dados sintéticos (TESTE).
 */
import { B, ev } from '../../tests/suporte/eventosDeTeste'
import { escritaFalsa, processadaFalsa } from '../../tests/suporte/imagensDeTeste'
import { ErroDeLogin, ErroDeRede } from '../pacote/manifesto'
import { ErroDePermissao } from '../dropbox/tentativas'
import { armazemMemoria } from '../pacote/armazem'
import { cacheMemoria } from '../pacote/imagens'
import { usarArmazemDasImagens, usarCacheDasImagens } from '../imagens-usuario/local'
import { adicionarImagem } from '../imagens-usuario/operacoes'
import { gerarArquivo } from '../usuario/arquivosDeExportacao'
import { carregarEstado, estadoAtual, receberEventos } from '../usuario/estado'
import { esquecerPendentes } from '../usuario/pendentes'
import { lerZip } from './zip'
import { montarCopiaCompleta, nomeDaCopiaCompleta, resumoDaCopiaCompleta, TEXTO_DO_LEIA_ME } from './copiaCompleta'

function apagarBanco() {
  return new Promise<void>((ok) => {
    const r = indexedDB.deleteDatabase('iconodb-usuario')
    r.onsuccess = r.onerror = r.onblocked = () => ok()
  })
}

const bytes = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())]
const texto = async (b: Blob) => new TextDecoder().decode(new Uint8Array(await b.arrayBuffer()))

/** Uma imagem de outro aparelho (B): o evento chega pela sincronização; os arquivos estão (ou não) no Dropbox. */
const imagemDeB = (seq: number, campos: Record<string, string | number | boolean>) =>
  ev({ ap: B, seq, tipo: 'imagem', reg: `IM-${B}-${seq}`, op: 'criar', campos: { alvoTipo: 'objeto', alvo: 'CA00001', tipo: 'tons', formato: 'webp', extensao: 'heic', ...campos } })

const AGORA = new Date(2026, 10, 5, 17, 12, 30)

beforeEach(async () => {
  await apagarBanco()
  await carregarEstado()
  esquecerPendentes()
  usarArmazemDasImagens(armazemMemoria())
  usarCacheDasImagens(cacheMemoria())
})
afterEach(() => {
  usarArmazemDasImagens(undefined)
  usarCacheDasImagens(undefined)
})

describe('montarCopiaCompleta', () => {
  it('o .zip: copia.json igual ao «Baixar cópia» do mesmo instante, as fotos (locais e do Dropbox, com os nomes do Dropbox) e o LEIA-ME; a excluída fica de fora', async () => {
    const local = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), { tipo: 'tons', legenda: '', credito: 'foto própria', principal: false })
    await receberEventos([
      imagemDeB(1, { nome: 'IMG_1000.HEIC', bytes: 3_000_000 }),
      imagemDeB(2, { nome: 'IMG_1001.HEIC', bytes: 1_000 }),
      ev({ ap: B, seq: 3, tipo: 'imagem', reg: `IM-${B}-2`, op: 'excluir' }),
    ])
    const escrita = escritaFalsa()
    const noDropbox = (nome: string, conteudo: number[]) => escrita.enviados.set(`usuario/imagens/IM-${B}-1/${nome}`, new Uint8Array(conteudo))
    noDropbox('tela.webp', [1, 1])
    noDropbox('miniatura.webp', [2])
    noDropbox('original.heic', [3, 3, 3])

    const avancos: [number, number][] = []
    const { arquivo, faltaram } = await montarCopiaCompleta({ escrita, agora: AGORA, aoAvancar: (f, t) => avancos.push([f, t]) })

    expect(arquivo.name).toBe('iconodb-copia-completa-2026-11-05-1712.zip')
    expect(arquivo.type).toBe('application/zip')
    expect(faltaram).toEqual([])
    const zip = await lerZip(arquivo)
    expect([...zip.keys()].sort()).toEqual(
      [
        'LEIA-ME.txt',
        'copia.json',
        `imagens/${local}/tela.webp`,
        `imagens/${local}/miniatura.webp`,
        `imagens/${local}/original.jpg`,
        `imagens/IM-${B}-1/tela.webp`,
        `imagens/IM-${B}-1/miniatura.webp`,
        `imagens/IM-${B}-1/original.heic`,
      ].sort(),
    )
    // copia.json: byte a byte o arquivo do botão de cima, no mesmo instante.
    const copia = await gerarArquivo('copia', AGORA)
    expect(await texto(await zip.get('copia.json')!())).toBe(copia.conteudo)
    // As fotos locais vêm da fila (OPFS); as do outro aparelho, do Dropbox. Nada da excluída é pedido.
    expect(await bytes(await zip.get(`imagens/${local}/tela.webp`)!())).toEqual([1, 2, 3, 4, 5])
    expect(await bytes(await zip.get(`imagens/${local}/original.jpg`)!())).toEqual([9, 9, 9, 9, 9, 9, 9, 9])
    expect(await bytes(await zip.get(`imagens/IM-${B}-1/original.heic`)!())).toEqual([3, 3, 3])
    expect(escrita.chamadas.filter((c) => c.startsWith('baixar'))).toEqual([
      `baixar usuario/imagens/IM-${B}-1/tela.webp`,
      `baixar usuario/imagens/IM-${B}-1/miniatura.webp`,
      `baixar usuario/imagens/IM-${B}-1/original.heic`,
    ])
    expect(await texto(await zip.get('LEIA-ME.txt')!())).toBe(TEXTO_DO_LEIA_ME)
    // Uma vez no começo (0 de 2) e uma a cada foto.
    expect(avancos).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ])
  })

  it('um por vez: o próximo arquivo só é pedido ao Dropbox depois de o anterior chegar', async () => {
    await receberEventos([imagemDeB(1, { nome: 'IMG_1000.HEIC' }), imagemDeB(2, { nome: 'IMG_1001.HEIC' })])
    const escrita = escritaFalsa()
    for (const id of [1, 2]) for (const n of ['tela.webp', 'miniatura.webp', 'original.heic']) escrita.enviados.set(`usuario/imagens/IM-${B}-${id}/${n}`, new Uint8Array([id]))
    let emCurso = 0
    let maximo = 0
    const baixar = escrita.baixar.bind(escrita)
    escrita.baixar = async (c) => {
      maximo = Math.max(maximo, ++emCurso)
      await Promise.resolve()
      try {
        return await baixar(c)
      } finally {
        emCurso--
      }
    }
    const { faltaram } = await montarCopiaCompleta({ escrita, agora: AGORA, aoAvancar: () => undefined })
    expect(faltaram).toEqual([])
    expect(maximo).toBe(1)
  })

  it('um arquivo que falha fica de fora e a foto entra em «faltaram» uma vez só (pelo nome do arquivo original); o resto sai', async () => {
    await receberEventos([
      imagemDeB(1, { nome: 'IMG_2041.HEIC' }),
      imagemDeB(2, { nome: 'IMG_2050.HEIC' }),
      imagemDeB(3, { nome: 'IMG_2060.HEIC' }),
    ])
    const escrita = escritaFalsa()
    // 1: nenhum arquivo no Dropbox (o evento chegou antes dos arquivos). 2: só a tela. 3: completa.
    escrita.enviados.set(`usuario/imagens/IM-${B}-2/tela.webp`, new Uint8Array([7]))
    for (const n of ['tela.webp', 'miniatura.webp', 'original.heic']) escrita.enviados.set(`usuario/imagens/IM-${B}-3/${n}`, new Uint8Array([3]))
    const avancos: number[] = []
    const { arquivo, faltaram } = await montarCopiaCompleta({ escrita, agora: AGORA, aoAvancar: (f) => avancos.push(f) })
    expect(faltaram).toEqual(['IMG_2041.HEIC', 'IMG_2050.HEIC'])
    const nomes = [...(await lerZip(arquivo)).keys()]
    expect(nomes).toContain(`imagens/IM-${B}-2/tela.webp`)
    expect(nomes).not.toContain(`imagens/IM-${B}-2/original.heic`)
    expect(nomes.filter((n) => n.startsWith(`imagens/IM-${B}-1/`))).toEqual([])
    expect(nomes.filter((n) => n.startsWith(`imagens/IM-${B}-3/`))).toHaveLength(3)
    expect(avancos).toEqual([0, 1, 2, 3])
  })

  it('sem nome do original no registro, «faltaram» diz o id da imagem', async () => {
    await receberEventos([imagemDeB(1, {})])
    const { faltaram } = await montarCopiaCompleta({ escrita: escritaFalsa(), agora: AGORA, aoAvancar: () => undefined })
    expect(faltaram).toEqual([`IM-${B}-1`])
  })

  it('a rede cai no meio: o Dropbox não é mais chamado (as fotos seguintes entram em «faltaram» sem esperar), mas as locais continuam entrando', async () => {
    await receberEventos([imagemDeB(1, { nome: 'IMG_1000.HEIC' }), imagemDeB(2, { nome: 'IMG_1001.HEIC' })])
    const local = await adicionarImagem({ objeto: 'CA00002' }, processadaFalsa({ nome: 'local.jpg' }), { tipo: 'tons', legenda: '', credito: 'x', principal: false })
    const escrita = escritaFalsa()
    escrita.falhas.set('baixar *', new ErroDeRede())
    const { arquivo, faltaram } = await montarCopiaCompleta({ escrita, agora: AGORA, aoAvancar: () => undefined })
    expect(faltaram).toEqual(['IMG_1000.HEIC', 'IMG_1001.HEIC'])
    expect(escrita.chamadas.filter((c) => c.startsWith('baixar'))).toHaveLength(1)
    expect([...(await lerZip(arquivo)).keys()].filter((n) => n.startsWith(`imagens/${local}/`))).toHaveLength(3)
  })

  it('revisão 1: um erro só daquele arquivo (um 409 que não é «ausente», uma resposta estranha) marca só aquela foto; o Dropbox continua para as outras', async () => {
    await receberEventos([imagemDeB(1, { nome: 'IMG_1000.HEIC' }), imagemDeB(2, { nome: 'IMG_1001.HEIC' })])
    const escrita = escritaFalsa()
    for (const id of [1, 2]) for (const n of ['tela.webp', 'miniatura.webp', 'original.heic']) escrita.enviados.set(`usuario/imagens/IM-${B}-${id}/${n}`, new Uint8Array([id]))
    escrita.falhas.set(`baixar usuario/imagens/IM-${B}-1/tela.webp`, Object.assign(new Error('path/restricted_content'), { status: 409, error: { error_summary: 'path/restricted_content/..' } }))
    escrita.falhas.set(`baixar usuario/imagens/IM-${B}-1/miniatura.webp`, new SyntaxError('resposta ilegível'))
    const { arquivo, faltaram } = await montarCopiaCompleta({ escrita, agora: AGORA, aoAvancar: () => undefined })
    expect(faltaram).toEqual(['IMG_1000.HEIC'])
    expect(escrita.chamadas.filter((c) => c.startsWith('baixar'))).toHaveLength(6)
    const nomes = [...(await lerZip(arquivo)).keys()]
    expect(nomes).toContain(`imagens/IM-${B}-1/original.heic`)
    expect(nomes.filter((n) => n.startsWith(`imagens/IM-${B}-2/`))).toHaveLength(3)
  })

  it.each([
    ['login vencido', () => new ErroDeLogin()],
    ['sem a permissão de leitura', () => new ErroDePermissao('files.content.read')],
    ['rede (falha do fetch que escapou das tentativas)', () => new TypeError('Failed to fetch')],
  ])('revisão 1: %s desliga o Dropbox para o resto da cópia', async (_nome, erro) => {
    await receberEventos([imagemDeB(1, { nome: 'IMG_1000.HEIC' }), imagemDeB(2, { nome: 'IMG_1001.HEIC' })])
    const escrita = escritaFalsa()
    escrita.falhas.set('baixar *', erro())
    const { faltaram } = await montarCopiaCompleta({ escrita, agora: AGORA, aoAvancar: () => undefined })
    expect(faltaram).toEqual(['IMG_1000.HEIC', 'IMG_1001.HEIC'])
    expect(escrita.chamadas.filter((c) => c.startsWith('baixar'))).toHaveLength(1)
  })

  it('revisão 1: o LEIA-ME não diz que tudo veio do que estava gravado no aparelho (as fotos podem vir do Dropbox)', () => {
    expect(TEXTO_DO_LEIA_ME).not.toContain('com o que estava gravado nele')
    expect(TEXTO_DO_LEIA_ME).toContain('Ele foi gerado pelo app neste aparelho, com os registros gravados nele e as fotos que estavam nele ou no Dropbox.')
  })

  it('sem Escrita (sem internet ou sem login): só as fotos da fila deste aparelho; as outras em «faltaram»', async () => {
    await receberEventos([imagemDeB(1, { nome: 'IMG_2041.HEIC' })])
    const local = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), { tipo: 'tons', legenda: '', credito: 'x', principal: false })
    const { arquivo, faltaram } = await montarCopiaCompleta({ escrita: null, agora: AGORA, aoAvancar: () => undefined })
    expect(faltaram).toEqual(['IMG_2041.HEIC'])
    const nomes = [...(await lerZip(arquivo)).keys()]
    expect(nomes.filter((n) => n.startsWith('imagens/'))).toEqual([`imagens/${local}/tela.webp`, `imagens/${local}/miniatura.webp`, `imagens/${local}/original.jpg`])
  })

  it('sem nenhuma foto: o .zip tem só copia.json e o LEIA-ME', async () => {
    const avancos: [number, number][] = []
    const { arquivo, faltaram } = await montarCopiaCompleta({ escrita: null, agora: AGORA, aoAvancar: (f, t) => avancos.push([f, t]) })
    expect(faltaram).toEqual([])
    expect([...(await lerZip(arquivo)).keys()]).toEqual(['LEIA-ME.txt', 'copia.json'])
    expect(avancos).toEqual([[0, 0]])
  })
})

describe('resumoDaCopiaCompleta e o nome', () => {
  it('conta as fotos não excluídas e soma os tamanhos conhecidos (o do original)', async () => {
    expect(resumoDaCopiaCompleta(estadoAtual())).toEqual({ fotos: 0, bytes: 0 })
    await receberEventos([
      imagemDeB(1, { nome: 'a.heic', bytes: 4_500_000 }),
      imagemDeB(2, { nome: 'b.heic' }),
      imagemDeB(3, { nome: 'c.heic', bytes: 2_000_000 }),
      ev({ ap: B, seq: 4, tipo: 'imagem', reg: `IM-${B}-3`, op: 'excluir' }),
    ])
    expect(resumoDaCopiaCompleta(estadoAtual())).toEqual({ fotos: 2, bytes: 4_500_000 })
  })

  it('iconodb-copia-completa-AAAA-MM-DD-HHMM.zip, na hora local', () => {
    expect(nomeDaCopiaCompleta(new Date(2026, 0, 2, 3, 4))).toBe('iconodb-copia-completa-2026-01-02-0304.zip')
  })
})
