import { fonteDeTeste } from '../../tests/suporte/fonteDeTeste'
import { armazemMemoria, type Armazem } from './armazem'
import { sincronizarPacote } from './baixar'
import { cacheMemoria, liberarUrls, urlImagem, type CacheImagens } from './imagens'
import { ErroDeRede, type Fonte } from './manifesto'

const TELA = 'imagens/TESTE/TESTE-0001/screen-1.webp'
const MINIATURA = 'imagens/TESTE/TESTE-0001/thumb-1.webp'

let armazem: Armazem
let cache: CacheImagens
let contador = 0

beforeEach(async () => {
  contador = 0
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => `blob:teste/${++contador}`), revokeObjectURL: vi.fn() }))
  armazem = armazemMemoria()
  cache = cacheMemoria()
  await sincronizarPacote(fonteDeTeste(), () => undefined, { armazem, cache })
})

afterEach(() => {
  liberarUrls()
  vi.unstubAllGlobals()
})

function contando(base: Fonte) {
  const baixados: string[] = []
  const fonte: Fonte = {
    listar: (p) => base.listar(p),
    baixar: (c) => {
      baixados.push(c)
      return base.baixar(c)
    },
  }
  return { fonte, baixados }
}

describe('urlImagem', () => {
  it('a miniatura da primeira sincronização abre sem rede', async () => {
    const fonte = vi.fn(async () => {
      throw new ErroDeRede()
    })
    const url = await urlImagem(MINIATURA, { cache, armazem, fonte })
    expect(url).toMatch(/^blob:/)
    expect(fonte).not.toHaveBeenCalled()
  })

  it('a imagem de tela é buscada ao abrir, conferida, guardada e reaproveitada', async () => {
    const { fonte, baixados } = contando(fonteDeTeste())
    expect(await cache.obter(TELA)).toBeNull()

    const url = await urlImagem(TELA, { cache, armazem, fonte: async () => fonte })
    expect(url).toMatch(/^blob:/)
    expect(baixados).toEqual([TELA])
    expect(await cache.obter(TELA)).not.toBeNull()

    // Depois, sem rede: vem do aparelho.
    liberarUrls()
    const semRede = vi.fn(async () => {
      throw new ErroDeRede()
    })
    expect(await urlImagem(TELA, { cache, armazem, fonte: semRede })).toMatch(/^blob:/)
    expect(semRede).not.toHaveBeenCalled()
  })

  it('o mesmo caminho devolve o mesmo endereço, mesmo em pedidos simultâneos', async () => {
    const { fonte, baixados } = contando(fonteDeTeste())
    const opcoes = { cache, armazem, fonte: async () => fonte }
    const [a, b] = await Promise.all([urlImagem(TELA, opcoes), urlImagem(TELA, opcoes)])
    expect(a).toBe(b)
    expect(baixados).toEqual([TELA])
    expect(await urlImagem(TELA, opcoes)).toBe(a)
  })

  it('sem cópia e sem internet devolve null, sem lançar', async () => {
    const semRede = async () => {
      throw new ErroDeRede()
    }
    expect(await urlImagem(TELA, { cache, armazem, fonte: semRede })).toBeNull()
  })

  it('sem cópia e sem login devolve null', async () => {
    expect(await urlImagem(TELA, { cache, armazem, fonte: async () => null })).toBeNull()
  })

  it('bytes que não conferem com o sha256 do manifesto não são guardados', async () => {
    const ruim: Fonte = { listar: async () => [], baixar: async () => new TextEncoder().encode('outra coisa').buffer as ArrayBuffer }
    expect(await urlImagem(TELA, { cache, armazem, fonte: async () => ruim })).toBeNull()
    expect(await cache.obter(TELA)).toBeNull()
  })

  it('uma imagem que o pacote não declara devolve null sem ir à rede', async () => {
    const fonte = vi.fn(async () => fonteDeTeste())
    expect(await urlImagem('imagens/TESTE/TESTE-9999/screen-1.webp', { cache, armazem, fonte })).toBeNull()
    expect(fonte).not.toHaveBeenCalled()
  })
})
