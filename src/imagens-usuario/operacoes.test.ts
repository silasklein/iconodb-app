/**
 * Adicionar, alterar, excluir e restaurar uma imagem do usuário (decisão 33). A ordem que não perde nada:
 * os arquivos no OPFS primeiro, depois o evento `imagem` (IndexedDB, pelo `registrar`), e só então a fila de envio.
 */
import { armazemMemoria, type Armazem } from '../pacote/armazem'
import { todosEventos } from '../usuario/armazem'
import { estadoAtual, registrar } from '../usuario/estado'
import { usarArmazemDasImagens, ErroDeEspaco, MSG_SEM_ESPACO } from './local'
import { adicionarImagem, alterarImagem, excluirImagem, restaurarImagem } from './operacoes'
import { arquivosDaImagem, excluidasDoObjeto, imagensDoObjeto, lerImagem, principalDoObjeto } from './registro'
import { assinarFila } from './fila'
import { processadaFalsa } from '../../tests/suporte/imagensDeTeste'

/** Cada chamada a `registrar`, na ordem, junto com as gravações no armazém: a ordem das operações. */
const ordem = vi.hoisted(() => ({ passos: [] as string[], falharRegistro: false, falharDepoisDeGravar: false }))
vi.mock('../usuario/estado', async (original) => {
  const m = await original<typeof import('../usuario/estado')>()
  return {
    ...m,
    registrar: (async (...a: Parameters<typeof m.registrar>) => {
      ordem.passos.push(`registrar ${a[0]} ${a[2]}`)
      if (ordem.falharRegistro) throw new Error('IndexedDB cortado')
      const r = await m.registrar(...a)
      // O evento foi gravado, mas algo depois dele falhou (o aviso às outras abas, por exemplo).
      if (ordem.falharDepoisDeGravar) throw new Error('depois de gravar')
      return r
    }) as typeof m.registrar,
  }
})

function armazemQueAnota(base: Armazem = armazemMemoria(), falha?: unknown): Armazem {
  return {
    ...base,
    async gravar(caminho, bytes) {
      ordem.passos.push(`gravar ${caminho}`)
      if (falha) throw falha
      return base.gravar(caminho, bytes)
    },
  }
}

let armazem: Armazem
beforeEach(() => {
  ordem.passos = []
  ordem.falharRegistro = false
  ordem.falharDepoisDeGravar = false
  armazem = armazemQueAnota()
  usarArmazemDasImagens(armazem)
})
afterEach(() => usarArmazemDasImagens(undefined))

const dados = { tipo: 'tons' as const, legenda: ' vista frontal ', credito: ' Museu de Teste ', principal: false }

describe('adicionarImagem: OPFS, depois o evento, depois a fila', () => {
  it('grava original, tela e miniatura no OPFS ANTES do evento; o evento leva o que o app precisa; a fila é avisada por último', async () => {
    const avisos: string[] = []
    const parar = assinarFila(() => avisos.push(`fila depois de ${ordem.passos.length} passos`))
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)
    parar()
    expect(id).toMatch(/^IM-[a-z0-9]{8}-\d+$/)
    const gravacoes = ordem.passos.filter((p) => p.startsWith('gravar'))
    expect(gravacoes).toEqual([`gravar ${id}/original.jpg`, `gravar ${id}/tela.webp`, `gravar ${id}/miniatura.webp`, `gravar ${id}/local.json`])
    expect(ordem.passos.indexOf('registrar imagem criar')).toBeGreaterThan(ordem.passos.indexOf(`gravar ${id}/local.json`))
    expect(avisos).toEqual([`fila depois de ${ordem.passos.length} passos`])

    // O original, byte a byte.
    expect([...(await armazem.ler(`${id}/original.jpg`))!]).toEqual([9, 9, 9, 9, 9, 9, 9, 9])
    const [evento] = (await todosEventos()).filter((e) => e.reg === id)
    expect(evento).toMatchObject({
      tipo: 'imagem',
      op: 'criar',
      campos: {
        alvoTipo: 'objeto',
        alvo: 'CA00001',
        tipo: 'tons',
        tipoDetectado: 'tons',
        metricas: { extremes: 0.22, grey_core: 0.7585 },
        legenda: 'vista frontal',
        credito: 'Museu de Teste',
        principal: false,
        formato: 'webp',
        extensao: 'jpg',
        nome: 'IMG_2041.JPG',
        bytes: 8,
        largura: 1600,
        altura: 1200,
        originalLargura: 8000,
        originalAltura: 6000,
      },
    })
  })

  it('o Tipo escolhido pode corrigir o detectado (os dois ficam no evento)', async () => {
    const id = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa({ modoSugerido: 'tons' }), { ...dados, tipo: 'traco' })
    expect(estadoAtual().registro('imagem', id)!.campos).toMatchObject({ tipo: 'traco', tipoDetectado: 'tons' })
    expect(lerImagem(estadoAtual().registro('imagem', id)!)!.tipo).toBe('traco')
  })

  it('JPEG (navegador sem WebP): a tela e a miniatura vão como .jpg e o formato fica no evento', async () => {
    const id = await adicionarImagem(
      { objeto: 'CA00001' },
      processadaFalsa({ formato: 'jpeg', tela: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), miniatura: new Blob([new Uint8Array([2])], { type: 'image/jpeg' }) }),
      dados,
    )
    expect(await armazem.existe(`${id}/tela.jpg`)).toBe(true)
    expect(await armazem.existe(`${id}/miniatura.jpg`)).toBe(true)
    const img = lerImagem(estadoAtual().registro('imagem', id)!)!
    expect(arquivosDaImagem(img).map((a) => a.nome)).toEqual(['tela.jpg', 'miniatura.jpg', 'original.jpg'])
  })

  it('sem espaço no aparelho: ErroDeEspaco com a mensagem clara, nenhum evento, nada sobra no OPFS', async () => {
    const cheio = armazemMemoria()
    usarArmazemDasImagens(armazemQueAnota(cheio, new DOMException('quota', 'QuotaExceededError')))
    const antes = (await todosEventos()).length
    const erro = await adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroDeEspaco)
    expect((erro as Error).message).toBe(MSG_SEM_ESPACO)
    expect((await todosEventos()).length).toBe(antes)
    expect(await cheio.listar('')).toEqual([])
  })

  it('o evento falha: os arquivos do OPFS são tirados e o erro sobe (a imagem não fica pela metade)', async () => {
    ordem.falharRegistro = true
    await expect(adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)).rejects.toThrow(/IndexedDB/)
    expect(await armazem.listar('')).toEqual([])
  })

  it('revisão 1 (M4): o evento foi gravado e o erro veio depois: os arquivos FICAM (o registro existe e vai precisar deles)', async () => {
    ordem.falharDepoisDeGravar = true
    await expect(adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)).rejects.toThrow(/depois de gravar/)
    const imagem = (await todosEventos()).filter((e) => e.tipo === 'imagem').sort((x, y) => (x.hlc < y.hlc ? -1 : 1)).at(-1)!
    expect(await armazem.existe(`${imagem.reg}/original.jpg`)).toBe(true)
    expect(await armazem.existe(`${imagem.reg}/tela.webp`)).toBe(true)
  })

  it('sem OPFS (navegador sem armazenamento): erro claro, nada gravado', async () => {
    usarArmazemDasImagens(null)
    await expect(adicionarImagem({ objeto: 'CA00001' }, processadaFalsa(), dados)).rejects.toThrow(/guardar imagens/)
  })
})

describe('as imagens de um objeto, a principal e a exclusão reversível', () => {
  it('imagensDoObjeto: só as vivas daquele objeto, na ordem em que foram adicionadas', async () => {
    const a = await adicionarImagem({ objeto: 'CA00002' }, processadaFalsa(), dados)
    const b = await adicionarImagem({ objeto: 'CA00002' }, processadaFalsa(), dados)
    await adicionarImagem({ objeto: 'CA00003' }, processadaFalsa(), dados)
    expect(imagensDoObjeto(estadoAtual(), 'CA00002').map((i) => i.id)).toEqual([a, b])
  })

  it('excluir é uma marca: some da lista, aparece em excluídas, os arquivos ficam; restaurar a desfaz', async () => {
    const a = await adicionarImagem({ objeto: 'CA00004' }, processadaFalsa(), dados)
    await excluirImagem(a)
    expect(imagensDoObjeto(estadoAtual(), 'CA00004')).toEqual([])
    expect(excluidasDoObjeto(estadoAtual(), 'CA00004').map((i) => i.id)).toEqual([a])
    expect(await armazem.existe(`${a}/original.jpg`)).toBe(true)
    await restaurarImagem(a)
    expect(imagensDoObjeto(estadoAtual(), 'CA00004').map((i) => i.id)).toEqual([a])
    // todosEventos vem pela ordem do id (texto): ordena pelo relógio.
    const ops = (await todosEventos()).filter((e) => e.reg === a).sort((x, y) => (x.hlc < y.hlc ? -1 : 1)).map((e) => e.op)
    expect(ops).toEqual(['criar', 'excluir', 'restaurar'])
  })

  it('"Usar como principal": vale a marcação mais recente; desmarcar volta ao desenho do livro', async () => {
    const a = await adicionarImagem({ objeto: 'CA00005' }, processadaFalsa(), { ...dados, principal: true })
    const b = await adicionarImagem({ objeto: 'CA00005' }, processadaFalsa(), dados)
    expect(principalDoObjeto(estadoAtual(), 'CA00005')?.id).toBe(a)
    await alterarImagem(b, { principal: true })
    expect(principalDoObjeto(estadoAtual(), 'CA00005')?.id).toBe(b)
    await alterarImagem(b, { principal: false })
    expect(principalDoObjeto(estadoAtual(), 'CA00005')?.id).toBe(a)
    await excluirImagem(a)
    expect(principalDoObjeto(estadoAtual(), 'CA00005')).toBeNull()
  })

  it('alterarImagem grava só os campos dados (tipo, principal)', async () => {
    const a = await adicionarImagem({ objeto: 'CA00006' }, processadaFalsa(), dados)
    await alterarImagem(a, { tipo: 'traco' })
    const ultimo = (await todosEventos()).filter((e) => e.reg === a).sort((x, y) => (x.hlc < y.hlc ? -1 : 1)).at(-1)!
    expect(ultimo).toMatchObject({ op: 'alterar', campos: { tipo: 'traco' } })
    expect(Object.keys(ultimo.campos)).toEqual(['tipo'])
  })

  it('lerImagem recusa um registro sem o que monta os caminhos (formato ou alvo estranho); extensão estranha vira "bin"', async () => {
    await registrar('imagem', 'IM-zzzzzzzz-1', 'criar', { alvoTipo: 'objeto', alvo: 'CA00001', formato: 'gif' })
    expect(lerImagem(estadoAtual().registro('imagem', 'IM-zzzzzzzz-1')!)).toBeNull()
    await registrar('imagem', 'IM-zzzzzzzz-2', 'criar', { alvoTipo: 'objeto', alvo: 'CA00001', formato: 'webp', extensao: '../x', tipo: 'outro' })
    const img = lerImagem(estadoAtual().registro('imagem', 'IM-zzzzzzzz-2')!)!
    expect(img.extensao).toBe('bin')
    expect(img.tipo).toBe('tons')
    await registrar('imagem', 'IM-zzzzzzzz-3', 'criar', { alvoTipo: 'objeto', alvo: '', formato: 'webp' })
    expect(lerImagem(estadoAtual().registro('imagem', 'IM-zzzzzzzz-3')!)).toBeNull()
  })
})
