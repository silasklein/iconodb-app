import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fonteDeTeste, RAIZ_DO_PACOTE_SINTETICO } from '../../tests/suporte/fonteDeTeste'
import { armazemMemoria, type Armazem } from './armazem'
import {
  ErroDeIntegridade,
  ErroDeSchema,
  ErroDeSincronizacaoEmAndamento,
  lerManifesto,
  MSG_SCHEMA,
  type Fonte,
  type Manifesto,
} from './manifesto'
import {
  lerArquivoDoPacote,
  lerEstado,
  lerPersistencia,
  sha256,
  sincronizarPacote,
  TRAVA_DE_SINCRONIZACAO,
  type Etapa,
} from './baixar'
import { cacheMemoria, type CacheImagens } from './imagens'

const MANIFESTO = 'nucleo/manifest.json'
const NUCLEO = ['nucleo/busca.sqlite', 'nucleo/comum.sqlite', 'nucleo/fold.json', 'nucleo/pub-TESTE.sqlite']

function doDisco(caminho: string): Uint8Array {
  return new Uint8Array(readFileSync(join(RAIZ_DO_PACOTE_SINTETICO, caminho)))
}

// Uint8Array do realm do teste (o TextEncoder do jsdom devolve outro, e toEqual estranha).
const codificar = (texto: string) => Uint8Array.from(new TextEncoder().encode(texto))

/** O manifesto, depois de passar por `alterar`, como a Fonte o entregaria. */
async function manifestoAlterado(base: Fonte, alterar: (m: Manifesto) => void | Promise<void>): Promise<ArrayBuffer> {
  const m = JSON.parse(new TextDecoder().decode(await base.baixar(MANIFESTO))) as Manifesto
  await alterar(m)
  return codificar(JSON.stringify(m)).buffer as ArrayBuffer
}

/** Registra cada download (menos o do manifesto) e deixa falhar no N-ésimo. */
function observar(base: Fonte, opcoes: { falharNoDownload?: number } = {}) {
  const baixados: string[] = []
  const fonte: Fonte = {
    listar: (p) => base.listar(p),
    async baixar(caminho) {
      if (caminho !== MANIFESTO) {
        baixados.push(caminho)
        if (opcoes.falharNoDownload !== undefined && baixados.length === opcoes.falharNoDownload) {
          throw new Error('conexão interrompida')
        }
      }
      return base.baixar(caminho)
    },
  }
  return { fonte, baixados }
}

/** Uma Fonte cujo manifesto anuncia `trocas`; os bytes entregues podem ser outros (`servidos`). */
function comArquivosTrocados(
  base: Fonte,
  trocas: Record<string, Uint8Array>,
  servidos: Record<string, Uint8Array> = trocas,
): Fonte {
  return {
    listar: (p) => base.listar(p),
    async baixar(caminho) {
      if (caminho === MANIFESTO) {
        return manifestoAlterado(base, async (m) => {
          for (const [c, bytes] of Object.entries(trocas)) {
            m.arquivos[c] = { sha256: await sha256(bytes), bytes: bytes.byteLength }
          }
        })
      }
      const servido = servidos[caminho]
      return servido ? (servido.slice().buffer as ArrayBuffer) : base.baixar(caminho)
    },
  }
}

function comSchema(base: Fonte, schema: number): Fonte {
  return {
    listar: (p) => base.listar(p),
    baixar: (c) => (c === MANIFESTO ? manifestoAlterado(base, (m) => void (m.schema = schema as 5)) : base.baixar(c)),
  }
}

function ambiente() {
  const armazem: Armazem = armazemMemoria()
  const cache: CacheImagens = cacheMemoria()
  return { armazem, cache, opcoes: { armazem, cache, concorrencia: 1 } }
}

/** Compara bytes sem o toEqual, que é lento em arquivos grandes. */
async function igual(lido: Promise<Uint8Array | null>, esperado: Uint8Array): Promise<boolean> {
  const bytes = await lido
  return bytes !== null && Buffer.compare(bytes, esperado) === 0
}

const semProgresso = () => undefined
const eBaixado = (c: string) => c.startsWith('nucleo/') || /\/thumb-[^/]+$/.test(c)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('lerManifesto', () => {
  it('lê o manifesto do pacote sintético', async () => {
    const m = await lerManifesto(fonteDeTeste())
    expect(m.schema).toBe(5)
    expect(m.publicacoes[0]?.sigla).toBe('TESTE')
    expect(Object.keys(m.arquivos)).toEqual(expect.arrayContaining(NUCLEO))
  })

  it('recusa schema diferente de 5 com a mensagem combinada', async () => {
    const fonte = comSchema(fonteDeTeste(), 4)
    await expect(lerManifesto(fonte)).rejects.toBeInstanceOf(ErroDeSchema)
    await expect(lerManifesto(fonte)).rejects.toThrow(
      'Este pacote é de outra versão do banco; gere-o de novo com `app-export`.',
    )
    expect(MSG_SCHEMA).toBe('Este pacote é de outra versão do banco; gere-o de novo com `app-export`.')
  })
})

describe('sincronizarPacote', () => {
  it('um schema diferente de 5 é recusado e nada é baixado nem gravado', async () => {
    const { fonte, baixados } = observar(comSchema(fonteDeTeste(), 6))
    const { armazem, opcoes } = ambiente()
    await expect(sincronizarPacote(fonte, semProgresso, opcoes)).rejects.toBeInstanceOf(ErroDeSchema)
    expect(baixados).toEqual([])
    expect(await armazem.listar('')).toEqual([])
  })

  it('primeira sincronização: baixa o núcleo e as miniaturas, não as imagens de tela', async () => {
    const { fonte, baixados } = observar(fonteDeTeste())
    const { armazem, cache, opcoes } = ambiente()
    const manifesto = await lerManifesto(fonteDeTeste())

    expect(await sincronizarPacote(fonte, semProgresso, opcoes)).toBe('atualizado')

    const esperados = Object.keys(manifesto.arquivos).filter(eBaixado)
    expect([...baixados].sort()).toEqual([...esperados].sort())
    expect(baixados.some((c) => c.includes('screen-'))).toBe(false)
    expect(await lerEstado(armazem)).toEqual(manifesto)
    for (const c of NUCLEO) expect(await igual(lerArquivoDoPacote(c, armazem), doDisco(c))).toBe(true)
    expect(await cache.obter('imagens/TESTE/TESTE-0001/thumb-1.webp')).not.toBeNull()
    expect(await cache.obter('imagens/TESTE/TESTE-0001/screen-1.webp')).toBeNull()
  })

  it('informa o progresso por etapa, terminando completo', async () => {
    const chamadas: Array<[Etapa, number, number]> = []
    const { opcoes } = ambiente()
    await sincronizarPacote(fonteDeTeste(), (e, f, t) => chamadas.push([e, f, t]), opcoes)
    const manifesto = await lerManifesto(fonteDeTeste())
    const soma = (filtro: (c: string) => boolean) =>
      Object.entries(manifesto.arquivos)
        .filter(([c]) => filtro(c))
        .reduce((s, [, a]) => s + a.bytes, 0)
    const banco = soma((c) => c.startsWith('nucleo/'))
    const miniaturas = soma((c) => /\/thumb-[^/]+$/.test(c))
    const doBanco = chamadas.filter(([e]) => e === 'Banco de dados')
    const dasImagens = chamadas.filter(([e]) => e === 'Imagens de tela')
    expect(doBanco[0]).toEqual(['Banco de dados', 0, banco])
    expect(doBanco.at(-1)).toEqual(['Banco de dados', banco, banco])
    expect(dasImagens[0]).toEqual(['Imagens de tela', 0, miniaturas])
    expect(dasImagens.at(-1)).toEqual(['Imagens de tela', miniaturas, miniaturas])
    for (const lista of [doBanco, dasImagens]) {
      for (let i = 1; i < lista.length; i++) expect(lista[i]![1]).toBeGreaterThanOrEqual(lista[i - 1]![1])
    }
  })

  it('um sha256 errado é recusado e o arquivo anterior fica', async () => {
    const { armazem, opcoes } = ambiente()
    await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)
    const estadoAntes = await lerEstado(armazem)
    const original = doDisco('nucleo/comum.sqlite')

    // O manifesto anuncia um conteúdo novo, mas o servidor entrega outros bytes.
    const ruim = comArquivosTrocados(
      fonteDeTeste(),
      { 'nucleo/comum.sqlite': codificar('conteudo novo anunciado') },
      { 'nucleo/comum.sqlite': codificar('bytes corrompidos no caminho') },
    )

    const erro = await sincronizarPacote(ruim, semProgresso, opcoes).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroDeIntegridade)
    expect((erro as ErroDeIntegridade).caminho).toBe('nucleo/comum.sqlite')
    expect(await igual(lerArquivoDoPacote('nucleo/comum.sqlite', armazem), original)).toBe(true)
    expect(await lerEstado(armazem)).toEqual(estadoAntes)
  })

  it('um sha256 errado na primeira sincronização não deixa banco aberto', async () => {
    const { armazem, opcoes } = ambiente()
    const ruim = comArquivosTrocados(
      fonteDeTeste(),
      { 'nucleo/fold.json': codificar('{}') },
      { 'nucleo/fold.json': codificar('[]') },
    )
    await expect(sincronizarPacote(ruim, semProgresso, opcoes)).rejects.toBeInstanceOf(ErroDeIntegridade)
    expect(await lerEstado(armazem)).toBeNull()
    expect(await lerArquivoDoPacote('nucleo/fold.json', armazem)).toBeNull()
  })

  it('retoma depois de interromper em 2 arquivos: baixa só o resto e só então troca o banco', async () => {
    const { armazem, cache, opcoes } = ambiente()
    const primeira = observar(fonteDeTeste(), { falharNoDownload: 3 })

    await expect(sincronizarPacote(primeira.fonte, semProgresso, opcoes)).rejects.toThrow('conexão interrompida')
    expect(primeira.baixados).toEqual(['nucleo/busca.sqlite', 'nucleo/comum.sqlite', 'nucleo/fold.json'])
    // Sem estado, o app não abre banco nenhum, nem os 2 arquivos já conferidos.
    expect(await lerEstado(armazem)).toBeNull()
    expect(await lerArquivoDoPacote('nucleo/busca.sqlite', armazem)).toBeNull()
    const progresso = JSON.parse(new TextDecoder().decode((await armazem.ler('progresso.json'))!)) as Record<string, string>
    expect(Object.keys(progresso).sort()).toEqual(['nucleo/busca.sqlite', 'nucleo/comum.sqlite'])

    const segunda = observar(fonteDeTeste())
    expect(await sincronizarPacote(segunda.fonte, semProgresso, opcoes)).toBe('atualizado')

    const manifesto = await lerManifesto(fonteDeTeste())
    const total = Object.keys(manifesto.arquivos).filter(eBaixado)
    expect(segunda.baixados).not.toContain('nucleo/busca.sqlite')
    expect(segunda.baixados).not.toContain('nucleo/comum.sqlite')
    expect(segunda.baixados.length).toBe(total.length - 2)
    expect(await lerEstado(armazem)).toEqual(manifesto)
    for (const c of NUCLEO) expect(await igual(lerArquivoDoPacote(c, armazem), doDisco(c))).toBe(true)
    expect(await cache.obter('imagens/TESTE/TESTE-0001/thumb-1.webp')).not.toBeNull()
  })

  it('numa atualização interrompida, o banco anterior continua inteiro até todos conferirem', async () => {
    const { armazem, opcoes } = ambiente()
    await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)
    const antes = await lerEstado(armazem)

    const novoBusca = codificar('busca nova')
    const novoPub = codificar('publicacao nova')
    const trocas = { 'nucleo/busca.sqlite': novoBusca, 'nucleo/pub-TESTE.sqlite': novoPub }
    const { fonte } = observar(comArquivosTrocados(fonteDeTeste(), trocas), { falharNoDownload: 2 })

    await expect(sincronizarPacote(fonte, semProgresso, opcoes)).rejects.toThrow('conexão interrompida')
    // busca.sqlite novo já foi conferido, mas o banco ainda é o de antes.
    expect(await lerEstado(armazem)).toEqual(antes)
    expect(await igual(lerArquivoDoPacote('nucleo/busca.sqlite', armazem), doDisco('nucleo/busca.sqlite'))).toBe(true)
    expect(await igual(lerArquivoDoPacote('nucleo/pub-TESTE.sqlite', armazem), doDisco('nucleo/pub-TESTE.sqlite'))).toBe(true)

    // Retomando, só o que falta é baixado, e a troca acontece de uma vez.
    const retomada = observar(comArquivosTrocados(fonteDeTeste(), trocas))
    expect(await sincronizarPacote(retomada.fonte, semProgresso, opcoes)).toBe('atualizado')
    expect(retomada.baixados).toEqual(['nucleo/pub-TESTE.sqlite'])
    expect(await igual(lerArquivoDoPacote('nucleo/busca.sqlite', armazem), novoBusca)).toBe(true)
    expect(await igual(lerArquivoDoPacote('nucleo/pub-TESTE.sqlite', armazem), novoPub)).toBe(true)
    // Os arquivos de antes saem do aparelho depois da troca.
    expect((await armazem.listar('blobs')).length).toBe(NUCLEO.length)
  })

  it('na segunda vez, sem mudanças, devolve "igual" e não baixa nada', async () => {
    const { opcoes } = ambiente()
    await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)
    const segunda = observar(fonteDeTeste())
    const progresso: Array<[Etapa, number, number]> = []
    expect(await sincronizarPacote(segunda.fonte, (e, f, t) => progresso.push([e, f, t]), opcoes)).toBe('igual')
    expect(segunda.baixados).toEqual([])
    expect(progresso.length).toBeGreaterThan(0)
    for (const [, feito, total] of progresso.slice(-2)) expect(feito).toBe(total)
  })

  it('refaz o arquivo do núcleo que sumiu do aparelho', async () => {
    const { armazem, opcoes } = ambiente()
    await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)
    const [bloco] = await armazem.listar('blobs')
    await armazem.remover(bloco!)
    const segunda = observar(fonteDeTeste())
    expect(await sincronizarPacote(segunda.fonte, semProgresso, opcoes)).toBe('atualizado')
    expect(segunda.baixados.length).toBe(1)
    for (const c of NUCLEO) expect(await igual(lerArquivoDoPacote(c, armazem), doDisco(c))).toBe(true)
  })

  it('tira do cache a imagem de tela que mudou ou saiu do pacote', async () => {
    const { cache, opcoes } = ambiente()
    await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)
    const mudou = 'imagens/TESTE/TESTE-0001/screen-1.webp'
    const saiu = 'imagens/TESTE/TESTE-0003/screen-1.webp'
    const ficou = 'imagens/TESTE/TESTE-0002/screen-1.webp'
    for (const c of [mudou, saiu, ficou]) await cache.guardar(c, doDisco(c), 'image/webp')

    const base = fonteDeTeste()
    const fonte: Fonte = {
      listar: (p) => base.listar(p),
      baixar: (c) =>
        c === MANIFESTO
          ? manifestoAlterado(base, (m) => {
              m.arquivos[mudou] = { sha256: 'a'.repeat(64), bytes: 1 }
              delete m.arquivos[saiu]
            })
          : base.baixar(c),
    }
    expect(await sincronizarPacote(fonte, semProgresso, opcoes)).toBe('atualizado')
    expect(await cache.obter(mudou)).toBeNull()
    expect(await cache.obter(saiu)).toBeNull()
    expect(await cache.obter(ficou)).not.toBeNull()
  })

  it('miniatura que o sistema tirou do cache volta na sincronização seguinte, em vez de "igual"', async () => {
    const { cache, opcoes } = ambiente()
    await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)
    const manifesto = await lerManifesto(fonteDeTeste())
    const miniaturas = Object.keys(manifesto.arquivos).filter((c) => /\/thumb-[^/]+$/.test(c))

    // O iOS esvazia o cache de imagens.
    for (const c of miniaturas) await cache.remover(c)
    await cache.guardar('imagens/TESTE/TESTE-0001/screen-1.webp', doDisco('imagens/TESTE/TESTE-0001/screen-1.webp'), 'image/webp')

    const segunda = observar(fonteDeTeste())
    expect(await sincronizarPacote(segunda.fonte, semProgresso, opcoes)).toBe('atualizado')
    expect([...segunda.baixados].sort()).toEqual([...miniaturas].sort())
    for (const c of miniaturas) expect(await cache.tem(c)).toBe(true)

    expect(await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)).toBe('igual')
  })

  it('o registro de progresso fica igual ao conjunto novo depois da troca', async () => {
    const { armazem, opcoes } = ambiente()
    await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)
    const manifesto = await lerManifesto(fonteDeTeste())
    // Registro velho, com sha desatualizado e caminho que já não existe.
    await armazem.gravar('progresso.json', codificar(JSON.stringify({ 'nucleo/comum.sqlite': 'x'.repeat(64), 'nucleo/velho.sqlite': 'y'.repeat(64) })))
    // Nada a baixar: continua "igual", mas o registro é realinhado.
    expect(await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)).toBe('igual')
    const registro = JSON.parse(new TextDecoder().decode((await armazem.ler('progresso.json'))!)) as Record<string, string>
    const esperado = Object.fromEntries(
      Object.entries(manifesto.arquivos).filter(([c]) => eBaixado(c)).map(([c, a]) => [c, a.sha256]),
    )
    expect(registro).toEqual(esperado)
  })

  describe('trava entre janelas', () => {
    /** Web Locks mínimo: `ifAvailable` chama o callback com null se a trava está ocupada. */
    function simularTravas() {
      const ocupadas = new Set<string>()
      const request = vi.fn(async (nome: string, _opcoes: unknown, fazer: (trava: unknown) => Promise<unknown>) => {
        if (ocupadas.has(nome)) return fazer(null)
        ocupadas.add(nome)
        try {
          return await fazer({ name: nome })
        } finally {
          ocupadas.delete(nome)
        }
      })
      vi.stubGlobal('navigator', { ...navigator, locks: { request } })
      return request
    }

    it('com outra janela sincronizando, a segunda recusa sem baixar nem gravar nada', async () => {
      const request = simularTravas()
      const { armazem, opcoes } = ambiente()
      const base = fonteDeTeste()
      let liberar!: () => void
      let chegou!: () => void
      const naPorta = new Promise<void>((ok) => (chegou = ok))
      const portao = new Promise<void>((ok) => (liberar = ok))
      const lenta: Fonte = {
        listar: (p) => base.listar(p),
        async baixar(c) {
          if (c === 'nucleo/comum.sqlite') {
            chegou()
            await portao
          }
          return base.baixar(c)
        },
      }

      const primeira = sincronizarPacote(lenta, semProgresso, opcoes)
      await naPorta
      const gravadoAntes = [...(await armazem.listar(''))].sort()

      const { fonte: segundaFonte, baixados } = observar(fonteDeTeste())
      await expect(sincronizarPacote(segundaFonte, semProgresso, opcoes)).rejects.toBeInstanceOf(ErroDeSincronizacaoEmAndamento)
      expect(baixados).toEqual([])
      expect([...(await armazem.listar(''))].sort()).toEqual(gravadoAntes)
      expect(request).toHaveBeenCalledWith(TRAVA_DE_SINCRONIZACAO, { ifAvailable: true }, expect.any(Function))

      liberar()
      expect(await primeira).toBe('atualizado')
      // A trava foi solta: a próxima sincronização roda.
      expect(await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)).toBe('igual')
    })

    it('solta a trava também quando a sincronização falha', async () => {
      simularTravas()
      const { opcoes } = ambiente()
      await expect(sincronizarPacote(observar(fonteDeTeste(), { falharNoDownload: 1 }).fonte, semProgresso, opcoes)).rejects.toThrow(
        'conexão interrompida',
      )
      expect(await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)).toBe('atualizado')
    })

    it('sem Web Locks no navegador, sincroniza sem trava', async () => {
      vi.stubGlobal('navigator', { ...navigator, locks: undefined })
      const { opcoes } = ambiente()
      expect(await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)).toBe('atualizado')
    })
  })

  describe('leitura do estado', () => {
    it('estado.json cortado: vale o estado.tmp, gravado antes', async () => {
      const { armazem, opcoes } = ambiente()
      await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)
      const manifesto = await lerManifesto(fonteDeTeste())
      const inteiro = (await armazem.ler('estado.json'))!
      await armazem.gravar('estado.json', inteiro.slice(0, 40)) // gravação cortada
      expect(await lerEstado(armazem)).toEqual(manifesto)
      expect(await igual(lerArquivoDoPacote('nucleo/comum.sqlite', armazem), doDisco('nucleo/comum.sqlite'))).toBe(true)
    })

    it('blob com tamanho diferente do manifesto não é entregue', async () => {
      const { armazem, opcoes } = ambiente()
      await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)
      const manifesto = await lerManifesto(fonteDeTeste())
      const sha = manifesto.arquivos['nucleo/comum.sqlite']!.sha256
      await armazem.gravar(`blobs/${sha}`, doDisco('nucleo/comum.sqlite').slice(0, 100))
      expect(await lerArquivoDoPacote('nucleo/comum.sqlite', armazem)).toBeNull()
      // Os outros seguem normais.
      expect(await igual(lerArquivoDoPacote('nucleo/fold.json', armazem), doDisco('nucleo/fold.json'))).toBe(true)
    })

    it('troca de conjunto no meio da leitura: relê o estado uma vez e acha o blob novo', async () => {
      const { armazem, opcoes } = ambiente()
      await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)
      const novo = codificar('busca nova')
      await sincronizarPacote(comArquivosTrocados(fonteDeTeste(), { 'nucleo/busca.sqlite': novo }), semProgresso, opcoes)
      const novoEstado = await lerEstado(armazem)
      const velho = await lerManifesto(fonteDeTeste())

      // Simula a corrida: a 1ª leitura do estado devolve o conjunto antigo, cujo blob já foi limpo.
      let leituras = 0
      const corrida: Armazem = {
        ...armazem,
        async ler(c) {
          if (c === 'estado.json' && leituras++ === 0) return codificar(JSON.stringify(velho))
          return armazem.ler(c)
        },
      }
      expect(await igual(lerArquivoDoPacote('nucleo/busca.sqlite', corrida), novo)).toBe(true)
      expect(novoEstado?.arquivos['nucleo/busca.sqlite']?.sha256).not.toBe(velho.arquivos['nucleo/busca.sqlite']?.sha256)
    })
  })

  describe('armazenamento persistente', () => {
    function simularPersist(resultado: boolean) {
      const persist = vi.fn(async () => resultado)
      vi.stubGlobal('navigator', { ...navigator, storage: { persist } })
      return persist
    }

    it('pede navigator.storage.persist() uma vez, depois da primeira sincronização completa, e guarda o resultado', async () => {
      const persist = simularPersist(true)
      const { armazem, opcoes } = ambiente()

      await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)
      expect(persist).toHaveBeenCalledTimes(1)
      expect(await lerPersistencia(armazem)).toEqual({ concedido: true })

      await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)
      expect(persist).toHaveBeenCalledTimes(1)
    })

    it('não pede enquanto a primeira sincronização não termina', async () => {
      const persist = simularPersist(true)
      const { opcoes } = ambiente()
      await expect(
        sincronizarPacote(observar(fonteDeTeste(), { falharNoDownload: 2 }).fonte, semProgresso, opcoes),
      ).rejects.toThrow()
      expect(persist).not.toHaveBeenCalled()
    })

    it('a recusa não impede o uso e fica guardada', async () => {
      const persist = simularPersist(false)
      const { armazem, opcoes } = ambiente()
      expect(await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)).toBe('atualizado')
      expect(await lerPersistencia(armazem)).toEqual({ concedido: false })
      expect(await lerEstado(armazem)).not.toBeNull()
      await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)
      expect(persist).toHaveBeenCalledTimes(1)
    })

    it('com erro na API, a sincronização termina do mesmo jeito', async () => {
      vi.stubGlobal('navigator', { ...navigator, storage: { persist: vi.fn(() => Promise.reject(new Error('x'))) } })
      const { armazem, opcoes } = ambiente()
      expect(await sincronizarPacote(fonteDeTeste(), semProgresso, opcoes)).toBe('atualizado')
      expect(await lerPersistencia(armazem)).toEqual({ concedido: false })
    })
  })
})
