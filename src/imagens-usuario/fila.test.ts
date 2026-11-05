/**
 * A fila de envio das imagens do usuário: o que está no OPFS e ainda não está confirmado no Dropbox. A fila É o OPFS
 * (cada imagem na sua pasta, com `envio.json` dizendo o que já subiu), por isso sobrevive a recarregar e fechar o app.
 */
import { ErroDeConflito, ErroDeLimiteDoEnvio } from '../dropbox/escrita'
import { ErroDePermissao } from '../dropbox/tentativas'
import { ErroDeRede } from '../pacote/manifesto'
import { cacheMemoria, type CacheImagens } from '../pacote/imagens'
import { armazemMemoria, type Armazem } from '../pacote/armazem'
import { estadoAtual } from '../usuario/estado'
import {
  ATRASOS_DO_ENVIO_MS,
  ESTADO_INICIAL,
  aposEnvio,
  aposFalha,
  completo,
  contarImagensPorEnviar,
  enviarImagensPendentes,
  faltando,
  gravarEstadoDoEnvio,
  imagensAindaNesteAparelho,
  imagensComProblema,
  liberarEsperasDeRede,
  LIMIAR_EM_PARTES,
  removerDaFila,
  podeTentar,
  tentarImagemDeNovo,
} from './fila'
import { usarArmazemDasImagens, usarCacheDasImagens } from './local'
import { adicionarImagem, excluirImagem } from './operacoes'
import { arquivosDaImagem, lerImagem } from './registro'
import { escritaFalsa, processadaFalsa } from '../../tests/suporte/imagensDeTeste'

const dados = { tipo: 'tons' as const, legenda: '', credito: 'foto própria', principal: false }
let armazem: Armazem
let cache: CacheImagens
beforeEach(() => {
  armazem = armazemMemoria()
  cache = cacheMemoria()
  usarArmazemDasImagens(armazem)
  usarCacheDasImagens(cache)
})
afterEach(() => {
  usarArmazemDasImagens(undefined)
  usarCacheDasImagens(undefined)
})

const ARQS = [
  { nome: 'tela.webp', fase: 'tela' as const },
  { nome: 'miniatura.webp', fase: 'tela' as const },
  { nome: 'original.jpg', fase: 'original' as const },
]

describe('a máquina de estados do envio (pura)', () => {
  it('começa sem nada enviado; envio confirmado marca o arquivo e zera o erro', () => {
    expect(faltando(ESTADO_INICIAL, ARQS).map((a) => a.nome)).toEqual(['tela.webp', 'miniatura.webp', 'original.jpg'])
    expect(faltando(ESTADO_INICIAL, ARQS, 'telas').map((a) => a.nome)).toEqual(['tela.webp', 'miniatura.webp'])
    expect(faltando(ESTADO_INICIAL, ARQS, 'originais').map((a) => a.nome)).toEqual(['original.jpg'])
    let e = aposFalha(ESTADO_INICIAL, 'erro x', 1000)
    e = aposEnvio(e, 'tela.webp')
    expect(e).toEqual({ v: 1, enviados: ['tela.webp'], tentativas: 0, proxima: null, erro: null, sessao: null, esperasDeRede: 0 })
    expect(completo(e, ARQS)).toBe(false)
    expect(completo(['tela.webp', 'miniatura.webp', 'original.jpg'].reduce(aposEnvio, ESTADO_INICIAL), ARQS)).toBe(true)
  })

  it('falha de um arquivo: espera crescente (30 s, 2 min, 10 min, 1 h, e fica em 1 h)', () => {
    expect(ATRASOS_DO_ENVIO_MS).toEqual([30_000, 120_000, 600_000, 3_600_000])
    let e = ESTADO_INICIAL
    const proximas: number[] = []
    for (let i = 0; i < 6; i++) {
      e = aposFalha(e, 'x', 0)
      proximas.push(e.proxima!)
    }
    expect(proximas).toEqual([30_000, 120_000, 600_000, 3_600_000, 3_600_000, 3_600_000])
    expect(podeTentar(e, 3_599_999)).toBe(false)
    expect(podeTentar(e, 3_600_000)).toBe(true)
    expect(podeTentar(ESTADO_INICIAL, 0)).toBe(true)
  })
})

describe('enviarImagensPendentes: sobe o que falta, só para usuario/imagens/<IM-…>/', () => {
  it('telas primeiro (tela e miniatura), originais numa segunda fase; depois de tudo confirmado, as cópias de tela vão ao Cache Storage e a pasta sai do OPFS', async () => {
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    const escrita = escritaFalsa()
    expect(await contarImagensPorEnviar()).toBe(1)

    await enviarImagensPendentes(escrita, 'telas')
    expect(escrita.chamadas).toEqual([`usuario/imagens/${id}/tela.webp`, `usuario/imagens/${id}/miniatura.webp`])
    expect(await armazem.existe(`${id}/original.jpg`)).toBe(true)
    expect(await contarImagensPorEnviar()).toBe(1)

    await enviarImagensPendentes(escrita, 'originais')
    expect(escrita.chamadas.at(-1)).toBe(`usuario/imagens/${id}/original.jpg`)
    expect([...escrita.enviados.get(`usuario/imagens/${id}/original.jpg`)!]).toEqual([9, 9, 9, 9, 9, 9, 9, 9])
    // Confirmado: a pasta sai do OPFS (o original também), a tela e a miniatura ficam no Cache Storage.
    expect(await armazem.listar(id)).toEqual([])
    expect(await cache.tem(`usuario/imagens/${id}/tela.webp`)).toBe(true)
    expect(await cache.tem(`usuario/imagens/${id}/miniatura.webp`)).toBe(true)
    expect(await cache.tem(`usuario/imagens/${id}/original.jpg`)).toBe(false)
    expect(await contarImagensPorEnviar()).toBe(0)
    for (const c of escrita.chamadas) expect(c.startsWith('usuario/imagens/')).toBe(true)
  })

  it('sem rede no meio: para, o que subiu fica marcado, o resto espera; a próxima rodada continua de onde parou', async () => {
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    const escrita = escritaFalsa()
    escrita.falhas.set(`usuario/imagens/${id}/miniatura.webp`, new ErroDeRede())
    await expect(enviarImagensPendentes(escrita, 'tudo')).rejects.toBeInstanceOf(ErroDeRede)
    expect(await armazem.existe(`${id}/envio.json`)).toBe(true)
    escrita.falhas.clear()
    escrita.chamadas.length = 0
    await enviarImagensPendentes(escrita, 'tudo')
    // A tela não sobe de novo.
    expect(escrita.chamadas).toEqual([`usuario/imagens/${id}/miniatura.webp`, `usuario/imagens/${id}/original.jpg`])
  })

  it('a fila sobrevive a recarregar: um "app novo" (só o OPFS e o estado) acha a imagem pendente e a envia', async () => {
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    // Recarregar: módulos novos, o mesmo OPFS e o mesmo IndexedDB.
    vi.resetModules()
    const fila = await import('./fila')
    const local = await import('./local')
    const estado = await import('../usuario/estado')
    local.usarArmazemDasImagens(armazem)
    local.usarCacheDasImagens(cache)
    await estado.carregarEstado()
    expect(await fila.contarImagensPorEnviar()).toBe(1)
    const escrita = escritaFalsa()
    await fila.enviarImagensPendentes(escrita, 'tudo')
    expect(escrita.enviados.has(`usuario/imagens/${id}/original.jpg`)).toBe(true)
  })

  it('missing_scope (ErroDePermissao): sobe para quem chamou (a sincronização mostra a mensagem) e a imagem continua na fila', async () => {
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    const escrita = escritaFalsa()
    escrita.falhas.set('*', new ErroDePermissao('files.content.write'))
    await expect(enviarImagensPendentes(escrita, 'tudo')).rejects.toBeInstanceOf(ErroDePermissao)
    expect(await armazem.existe(`${id}/original.jpg`)).toBe(true)
    expect(await contarImagensPorEnviar()).toBe(1)
    // A permissão não conta como tentativa: assim que a pessoa entrar de novo, sobe sem esperar.
    escrita.falhas.clear()
    await enviarImagensPendentes(escrita, 'tudo')
    expect(await contarImagensPorEnviar()).toBe(0)
  })

  it('erro só desta imagem: ela espera (com atraso) e as outras seguem', async () => {
    const a = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    const b = await adicionarImagem({ objeto: 'CA00002' }, processadaFalsa(), dados)
    const escrita = escritaFalsa()
    escrita.falhas.set(`usuario/imagens/${a}/tela.webp`, new Error('resposta 400: estranho'))
    let agora = 1_000_000
    await enviarImagensPendentes(escrita, 'tudo', { agora: () => agora })
    expect(escrita.enviados.has(`usuario/imagens/${b}/original.jpg`)).toBe(true)
    expect(await contarImagensPorEnviar()).toBe(1)
    escrita.falhas.clear()
    escrita.chamadas.length = 0
    agora += 10_000
    await enviarImagensPendentes(escrita, 'tudo', { agora: () => agora })
    expect(escrita.chamadas).toEqual([]) // ainda esperando os 30 s
    agora += 30_000
    await enviarImagensPendentes(escrita, 'tudo', { agora: () => agora })
    expect(await contarImagensPorEnviar()).toBe(0)
  })

  it('imagem excluída também sobe (a exclusão é reversível: o arquivo fica no Dropbox)', async () => {
    const a = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    await excluirImagem(a)
    const escrita = escritaFalsa()
    await enviarImagensPendentes(escrita, 'tudo')
    expect(escrita.enviados.has(`usuario/imagens/${a}/tela.webp`)).toBe(true)
  })

  it('pasta sem evento (o app morreu entre gravar os arquivos e o evento): não sobe e não é apagada', async () => {
    await armazem.gravar('IM-orfaorf-1/tela.webp', new Uint8Array([1]))
    const escrita = escritaFalsa()
    await enviarImagensPendentes(escrita, 'tudo')
    expect(escrita.chamadas).toEqual([])
    expect(await armazem.existe('IM-orfaorf-1/tela.webp')).toBe(true)
    expect(await contarImagensPorEnviar()).toBe(0)
  })

  it('reenviar o mesmo conteúdo é idempotente: os caminhos e os bytes são sempre os mesmos', async () => {
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    const img = lerImagem(estadoAtual().registro('imagem', id)!)!
    expect(arquivosDaImagem(img).map((a) => a.caminho)).toEqual([
      `usuario/imagens/${id}/tela.webp`,
      `usuario/imagens/${id}/miniatura.webp`,
      `usuario/imagens/${id}/original.jpg`,
    ])
  })

  it('sem OPFS (testes, navegador sem armazenamento): nada a enviar, sem erro', async () => {
    usarArmazemDasImagens(null)
    expect(await contarImagensPorEnviar()).toBe(0)
    await expect(enviarImagensPendentes(escritaFalsa(), 'tudo')).resolves.toMatchObject({ enviados: 0 })
  })
})

const tempoEsgotado = () => new DOMException('O Dropbox não respondeu a tempo.', 'TimeoutError')

describe('revisão 1 (I1): a fase dos originais nunca derruba a rodada', () => {
  it('o original estoura o prazo: a fase não lança; a imagem fica na fila com a própria espera; as telas já confirmadas ficam', async () => {
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    const escrita = escritaFalsa()
    await enviarImagensPendentes(escrita, 'telas')
    escrita.falhas.set(`usuario/imagens/${id}/original.jpg`, tempoEsgotado())
    const agora = 5_000_000
    await expect(enviarImagensPendentes(escrita, 'originais', { agora: () => agora })).resolves.toMatchObject({ enviados: 0, falhas: 1 })
    expect(await contarImagensPorEnviar()).toBe(1)
    const envio = JSON.parse(new TextDecoder().decode((await armazem.ler(`${id}/envio.json`))!))
    // Revisão 2: prazo/rede não conta tentativa; a espera é a curta.
    expect(envio).toMatchObject({ enviados: ['tela.webp', 'miniatura.webp'], tentativas: 0, proxima: agora + 30_000, espera: 'rede' })
    // Na espera: a próxima rodada não tenta; depois dela, sobe.
    escrita.falhas.clear()
    escrita.chamadas.length = 0
    await enviarImagensPendentes(escrita, 'originais', { agora: () => agora + 1000 })
    expect(escrita.chamadas).toEqual([])
    await enviarImagensPendentes(escrita, 'originais', { agora: () => agora + 30_000 })
    expect(escrita.enviados.has(`usuario/imagens/${id}/original.jpg`)).toBe(true)
  })

  it('sem rede numa imagem: as outras não são tentadas nesta fase (a rede caiu para todas)', async () => {
    const a = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    const b = await adicionarImagem({ objeto: 'CA00002' }, processadaFalsa(), dados)
    const escrita = escritaFalsa()
    await enviarImagensPendentes(escrita, 'telas')
    escrita.chamadas.length = 0
    escrita.falhas.set('*', new ErroDeRede())
    await enviarImagensPendentes(escrita, 'originais')
    expect(escrita.chamadas).toEqual([`usuario/imagens/${a}/original.jpg`])
    void b
  })

  it('original grande: vai em partes; a rede cai no meio; a sessão fica em envio.json e a rodada seguinte retoma de onde parou', async () => {
    const grande = new File([Uint8Array.from({ length: 50 }, (_, i) => i)], 'IMG_GRANDE.JPG', { type: 'image/jpeg' })
    const id = await adicionarImagem({ objeto: 'CA00003' }, processadaFalsa({ original: grande }), dados)
    const escrita = escritaFalsa()
    await enviarImagensPendentes(escrita, 'telas')
    escrita.cairDepoisDe = { partes: 3, erro: new ErroDeRede() }
    await enviarImagensPendentes(escrita, 'originais', { limiarEmPartes: 10, parte: 8 })
    const envio = JSON.parse(new TextDecoder().decode((await armazem.ler(`${id}/envio.json`))!))
    expect(envio.sessao).toEqual({ nome: 'original.jpg', id: 'sessao-1', offset: 24 })
    await enviarImagensPendentes(escrita, 'originais', { limiarEmPartes: 10, parte: 8, agora: () => Date.now() + 60_000 })
    expect(escrita.chamadas.filter((c) => c.startsWith('partes'))).toEqual([`partes usuario/imagens/${id}/original.jpg`, `partes usuario/imagens/${id}/original.jpg de 24`])
    expect([...escrita.enviados.get(`usuario/imagens/${id}/original.jpg`)!]).toEqual([...Array(50).keys()])
    expect(await contarImagensPorEnviar()).toBe(0)
    expect(LIMIAR_EM_PARTES).toBe(8 * 1024 * 1024)
  })

  it('o original vai como está no OPFS, sem passar por cópias: em partes, só fatias do arquivo', async () => {
    const grande = new File([new Uint8Array(40)], 'G.JPG', { type: 'image/jpeg' })
    const id = await adicionarImagem({ objeto: 'CA00004' }, processadaFalsa({ original: grande }), dados)
    const lidos: string[] = []
    const ler = armazem.ler.bind(armazem)
    armazem.ler = async (c) => {
      lidos.push(c)
      return ler(c)
    }
    await enviarImagensPendentes(escritaFalsa(), 'originais', { limiarEmPartes: 10, parte: 16 })
    expect(lidos.filter((c) => c.endsWith('original.jpg'))).toEqual([])
    void id
  })
})

describe('revisão 1 (M3): erro permanente de uma imagem', () => {
  it('conflito (outro conteúdo no mesmo caminho): para de tentar sozinha, sai da conta "por enviar" e aparece em imagensComProblema; "Tentar de novo" volta', async () => {
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    const escrita = escritaFalsa()
    await enviarImagensPendentes(escrita, 'telas')
    escrita.falhas.set(`usuario/imagens/${id}/original.jpg`, new ErroDeConflito(`usuario/imagens/${id}/original.jpg`))
    await enviarImagensPendentes(escrita, 'originais')
    expect(await contarImagensPorEnviar()).toBe(0)
    const problemas = await imagensComProblema()
    expect(problemas).toEqual([{ id, alvo: 'CA00001', nome: 'IMG_2041.JPG', causa: 'conflito', mensagem: expect.stringMatching(/Já existe no Dropbox um arquivo com este nome e outro conteúdo/) }])
    // Muito tempo depois: continua parada (nada de uma rodada a cada 5 min para sempre).
    escrita.chamadas.length = 0
    await enviarImagensPendentes(escrita, 'tudo', { agora: () => Date.now() + 365 * 24 * 3_600_000 })
    expect(escrita.chamadas).toEqual([])
    escrita.falhas.clear()
    await tentarImagemDeNovo(id)
    expect(await contarImagensPorEnviar()).toBe(1)
    await enviarImagensPendentes(escrita, 'originais')
    expect(await imagensComProblema()).toEqual([])
    expect(await contarImagensPorEnviar()).toBe(0)
  })

  it('arquivo acima do limite e cópia local sumida também são permanentes, cada um com a sua explicação', async () => {
    const a = await adicionarImagem({ objeto: 'CA00002' }, processadaFalsa(), dados)
    const b = await adicionarImagem({ objeto: 'CA00003' }, processadaFalsa(), dados)
    const escrita = escritaFalsa()
    escrita.falhas.set(`usuario/imagens/${a}/tela.webp`, new ErroDeLimiteDoEnvio(`usuario/imagens/${a}/tela.webp`))
    await armazem.remover(`${b}/tela.webp`)
    await enviarImagensPendentes(escrita, 'telas')
    const p = await imagensComProblema()
    expect(p.find((x) => x.id === a)?.mensagem).toMatch(/grande demais/)
    expect(p.find((x) => x.id === b)?.mensagem).toMatch(/não está mais neste aparelho/)
  })
})

describe('imagensAindaNesteAparelho (Tarefa 15, a cópia de segurança): as que ainda não estão inteiras no Dropbox', () => {
  it('na fila (nada, ou só a tela, subiu) e parada por erro contam; inteira no Dropbox, não; sem OPFS, nenhuma', async () => {
    const a = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    const b = await adicionarImagem({ objeto: 'CA00002' }, processadaFalsa(), dados)
    const c = await adicionarImagem({ objeto: 'CA00003' }, processadaFalsa(), dados)
    expect([...(await imagensAindaNesteAparelho())].sort()).toEqual([a, b, c].sort())
    const escrita = escritaFalsa()
    escrita.falhas.set(`usuario/imagens/${b}/original.jpg`, new ErroDeConflito(`usuario/imagens/${b}/original.jpg`))
    escrita.falhas.set(`usuario/imagens/${c}/original.jpg`, new ErroDeRede())
    await enviarImagensPendentes(escrita, 'telas')
    await enviarImagensPendentes(escrita, 'originais').catch(() => undefined)
    // a subiu inteira; b parou por erro (fora da conta "por enviar", mas ainda só aqui); c tem só a tela no Dropbox.
    expect(await contarImagensPorEnviar()).toBe(1)
    expect([...(await imagensAindaNesteAparelho(estadoAtual()))].sort()).toEqual([b, c].sort())
    usarArmazemDasImagens(null)
    expect(await imagensAindaNesteAparelho()).toEqual(new Set())
  })
})

const lerEnvio = async (id: string) => JSON.parse(new TextDecoder().decode((await armazem.ler(`${id}/envio.json`))!))

describe('revisão 2: as duas fases na mesma imagem', () => {
  it('os originais não sobem antes da tela e da miniatura; as fases intercaladas não perdem confirmação nenhuma', async () => {
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    const escrita = escritaFalsa()
    // A fase das telas fica parada no envio da tela (rede lenta)…
    let soltar!: () => void
    const enviar = escrita.enviar.bind(escrita)
    escrita.enviar = async (c, b) => {
      if (c.endsWith('/tela.webp')) await new Promise<void>((ok) => (soltar = ok))
      return enviar(c, b)
    }
    const telas = enviarImagensPendentes(escrita, 'telas')
    await vi.waitFor(() => expect(soltar).toBeTypeOf('function'))
    // …e a dos originais roda no meio: não pega esta imagem (a tela ainda não foi confirmada).
    await enviarImagensPendentes(escrita, 'originais')
    expect(escrita.chamadas.filter((c) => c.endsWith('original.jpg'))).toEqual([])
    soltar()
    await telas
    expect((await lerEnvio(id)).enviados).toEqual(['tela.webp', 'miniatura.webp'])
    await enviarImagensPendentes(escrita, 'originais')
    expect(escrita.chamadas.filter((c) => c.endsWith('original.jpg'))).toHaveLength(1)
    expect(await armazem.listar(id)).toEqual([]) // tudo confirmado: a pasta saiu
  })

  it('uma gravação feita a partir de uma leitura velha não apaga o que o disco já tem (une os enviados; a sessão só muda por quem a avança)', async () => {
    const id = await adicionarImagem({ objeto: 'CA00002' }, processadaFalsa(), dados)
    await gravarEstadoDoEnvio(id, { ...ESTADO_INICIAL, enviados: ['tela.webp', 'miniatura.webp'], sessao: { nome: 'original.jpg', id: 's7', offset: 8 } }, { avancaSessao: true })
    // A fase das telas leu antes e grava agora a sua visão velha (sem a miniatura, sem a sessão).
    await gravarEstadoDoEnvio(id, { ...ESTADO_INICIAL, enviados: ['tela.webp'] })
    expect(await lerEnvio(id)).toMatchObject({ enviados: ['tela.webp', 'miniatura.webp'], sessao: { nome: 'original.jpg', id: 's7', offset: 8 } })
    // Quem avança a sessão a troca (ou a encerra).
    await gravarEstadoDoEnvio(id, { ...ESTADO_INICIAL, enviados: ['original.jpg'], sessao: null }, { avancaSessao: true })
    expect(await lerEnvio(id)).toMatchObject({ enviados: ['tela.webp', 'miniatura.webp', 'original.jpg'], sessao: null })
  })
})

describe('revisão 2: falta de memória não é "grande demais"; rede espera pouco', () => {
  it('RangeError de memória (Array buffer allocation failed): passageiro, espera curta; só o limite de 150 MB é permanente', async () => {
    const a = await adicionarImagem({ objeto: 'CA00003' }, processadaFalsa(), dados)
    const b = await adicionarImagem({ objeto: 'CA00004' }, processadaFalsa(), dados)
    const escrita = escritaFalsa()
    escrita.falhas.set(`usuario/imagens/${a}/tela.webp`, new RangeError('Array buffer allocation failed'))
    escrita.falhas.set(`usuario/imagens/${b}/tela.webp`, new ErroDeLimiteDoEnvio(`usuario/imagens/${b}/tela.webp`))
    const agora = 1_000_000
    await enviarImagensPendentes(escrita, 'telas', { agora: () => agora })
    const p = await imagensComProblema()
    expect(p.map((x) => x.id)).toEqual([b])
    const envioA = await lerEnvio(a)
    expect(envioA.permanente).toBe(false)
    expect(envioA.proxima - agora).toBeLessThanOrEqual(30_000)
  })

  it('sem rede ou prazo nos originais: não conta tentativa e a espera nunca passa de 2 min; online/rodada boa a zeram', async () => {
    const id = await adicionarImagem({ objeto: 'CA00005' }, processadaFalsa(), dados)
    const escrita = escritaFalsa()
    await enviarImagensPendentes(escrita, 'telas')
    escrita.falhas.set(`usuario/imagens/${id}/original.jpg`, tempoEsgotado())
    let agora = 2_000_000
    const esperas: number[] = []
    for (let i = 0; i < 6; i++) {
      await enviarImagensPendentes(escrita, 'originais', { agora: () => agora })
      const e = await lerEnvio(id)
      esperas.push(e.proxima - agora)
      expect(e.tentativas).toBe(0)
      agora = e.proxima
    }
    expect(Math.max(...esperas)).toBeLessThanOrEqual(120_000)
    expect(esperas[0]).toBe(30_000)
    // A rede voltou (evento online, ou uma rodada que passou): a espera de rede some na hora.
    await liberarEsperasDeRede()
    expect((await lerEnvio(id)).proxima).toBeNull()
    escrita.falhas.clear()
    await enviarImagensPendentes(escrita, 'originais', { agora: () => agora })
    expect(escrita.enviados.has(`usuario/imagens/${id}/original.jpg`)).toBe(true)
  })
})

describe('revisão 2: cópia local sumida', () => {
  it('a explicação certa e "Remover da fila" (não "Tentar de novo"): a pasta local sai, o evento da imagem fica', async () => {
    const id = await adicionarImagem({ objeto: 'CA00006' }, processadaFalsa(), dados)
    await armazem.remover(`${id}/tela.webp`)
    await enviarImagensPendentes(escritaFalsa(), 'telas')
    const [p] = await imagensComProblema()
    expect(p).toMatchObject({ id, causa: 'copia-ausente' })
    await removerDaFila(id)
    expect(await imagensComProblema()).toEqual([])
    expect(await armazem.listar(id)).toEqual([])
    expect(estadoAtual().registro('imagem', id)?.excluido).toBe(false)
  })
})
