/**
 * O endereço (blob:) de uma imagem do usuário: a cópia local (OPFS) primeiro, depois o Cache Storage, depois o
 * Dropbox (que fica guardado no Cache Storage). Do outro aparelho, o evento pode chegar antes dos arquivos: então
 * "ausente", sem erro, e tenta de novo mais tarde. Cada endereço é revogado quando ninguém mais o usa.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { ErroDeRede } from '../pacote/manifesto'
import { cacheMemoria, type CacheImagens } from '../pacote/imagens'
import { armazemMemoria, type Armazem } from '../pacote/armazem'
import { registrar } from '../usuario/estado'
import { usarArmazemDasImagens, usarCacheDasImagens } from './local'
import { adicionarImagem } from './operacoes'
import { ATRASOS_DO_AUSENTE_MS, soltarUrlDoUsuario, urlImagemDoUsuario, usarEscritaDasImagens, useUrlDoUsuario } from './urls'
import { escritaFalsa, processadaFalsa, type EscritaFalsa } from '../../tests/suporte/imagensDeTeste'

const dados = { tipo: 'tons' as const, legenda: '', credito: 'foto própria', principal: false }
let armazem: Armazem
let cache: CacheImagens
let escrita: EscritaFalsa
const criados: string[] = []
const revogados: string[] = []

beforeEach(() => {
  armazem = armazemMemoria()
  cache = cacheMemoria()
  escrita = escritaFalsa()
  usarArmazemDasImagens(armazem)
  usarCacheDasImagens(cache)
  usarEscritaDasImagens(async () => escrita)
  criados.length = 0
  revogados.length = 0
  let n = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const u = `blob:teste/${++n}`
    criados.push(u)
    return u
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u) => void revogados.push(u))
})
afterEach(() => {
  // Desmonta e deixa correr a revogação ainda com os relógios deste teste (nada passa para o seguinte).
  cleanup()
  if (vi.isFakeTimers()) vi.runOnlyPendingTimers()
  usarArmazemDasImagens(undefined)
  usarCacheDasImagens(undefined)
  usarEscritaDasImagens(undefined)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** Um evento `imagem` como chega de OUTRO aparelho: o registro existe, os arquivos não estão aqui. */
async function imagemDoOutroAparelho(id = 'IM-outroapa-1') {
  await registrar('imagem', id, 'criar', { alvoTipo: 'objeto', alvo: 'CA00001', tipo: 'tons', formato: 'webp', extensao: 'jpg', legenda: '', credito: 'x', principal: false })
  return id
}

describe('urlImagemDoUsuario', () => {
  it('a imagem acabou de ser adicionada: vem da cópia local na hora, sem rede', async () => {
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    const r = await urlImagemDoUsuario(id, 'tela')
    expect(r).toEqual({ estado: 'ok', url: criados[0] })
    expect(escrita.chamadas).toEqual([])
    soltarUrlDoUsuario(id, 'tela')
  })

  it('do outro aparelho, já enviada: baixa do Dropbox uma vez e guarda no Cache Storage', async () => {
    const id = await imagemDoOutroAparelho()
    escrita.enviados.set(`usuario/imagens/${id}/miniatura.webp`, new Uint8Array([4, 4]))
    expect(await urlImagemDoUsuario(id, 'miniatura')).toMatchObject({ estado: 'ok' })
    expect(escrita.chamadas).toEqual([`baixar usuario/imagens/${id}/miniatura.webp`])
    expect(await cache.tem(`usuario/imagens/${id}/miniatura.webp`)).toBe(true)
    soltarUrlDoUsuario(id, 'miniatura')
    await act(async () => undefined)
    // De novo (o endereço anterior foi solto): vem do Cache Storage, sem rede.
    expect(await urlImagemDoUsuario(id, 'miniatura')).toMatchObject({ estado: 'ok' })
    expect(escrita.chamadas).toHaveLength(1)
    soltarUrlDoUsuario(id, 'miniatura')
  })

  it('do outro aparelho, AINDA NÃO enviada: "ausente" (não é erro)', async () => {
    const id = await imagemDoOutroAparelho()
    expect(await urlImagemDoUsuario(id, 'tela')).toEqual({ estado: 'ausente' })
  })

  it('sem internet ou sem login: "indisponivel"', async () => {
    const id = await imagemDoOutroAparelho()
    escrita.falhas.set('baixar *', new ErroDeRede())
    expect(await urlImagemDoUsuario(id, 'tela')).toEqual({ estado: 'indisponivel' })
    usarEscritaDasImagens(async () => null)
    expect(await urlImagemDoUsuario(id, 'tela')).toEqual({ estado: 'indisponivel' })
  })

  it('registro desconhecido: "ausente", sem rede', async () => {
    expect(await urlImagemDoUsuario('IM-naoexist-9', 'tela')).toEqual({ estado: 'ausente' })
    expect(escrita.chamadas).toEqual([])
  })

  it('o mesmo endereço é reaproveitado enquanto alguém usa; revogado quando o último solta', async () => {
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    const a = await urlImagemDoUsuario(id, 'tela')
    const b = await urlImagemDoUsuario(id, 'tela')
    expect(a).toEqual(b)
    expect(criados).toHaveLength(1)
    soltarUrlDoUsuario(id, 'tela')
    await new Promise((r) => setTimeout(r, 5))
    expect(revogados).toEqual([])
    soltarUrlDoUsuario(id, 'tela')
    await new Promise((r) => setTimeout(r, 5))
    expect(revogados).toEqual([criados[0]])
  })
})

function Mostra({ id }: { id: string }) {
  const r = useUrlDoUsuario(id, 'tela')
  return <p data-testid="r">{r.estado === 'ok' ? r.url : r.estado}</p>
}

describe('useUrlDoUsuario', () => {
  it('ausente: tenta de novo mais tarde (atrasos crescentes), sem laço de erro; aparece quando o arquivo chega', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const id = await imagemDoOutroAparelho('IM-outroapa-2')
    render(<Mostra id={id} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByTestId('r')).toHaveTextContent('ausente')
    expect(escrita.chamadas).toHaveLength(1)
    await act(() => vi.advanceTimersByTimeAsync(ATRASOS_DO_AUSENTE_MS[0]! - 1))
    expect(escrita.chamadas).toHaveLength(1)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(escrita.chamadas).toHaveLength(2)
    escrita.enviados.set(`usuario/imagens/${id}/tela.webp`, new Uint8Array([1]))
    await act(() => vi.advanceTimersByTimeAsync(ATRASOS_DO_AUSENTE_MS[1]!))
    expect(screen.getByTestId('r').textContent).toMatch(/^blob:/)
  })

  it('ao desmontar: solta o endereço (revogado) e não deixa timer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    const { unmount } = render(<Mostra id={id} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByTestId('r').textContent).toMatch(/^blob:/)
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(10))
    expect(revogados).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ausente e desmontado: o timer de nova tentativa é cancelado', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const id = await imagemDoOutroAparelho('IM-outroapa-3')
    const { unmount } = render(<Mostra id={id} />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
