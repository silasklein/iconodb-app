import { aparelhoAtual, gerarId, nomePadraoDoAparelho, renomearAparelho } from './aparelho'

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const UA_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

function apagarBanco() {
  return new Promise<void>((ok, falha) => {
    const r = indexedDB.deleteDatabase('iconodb-usuario')
    r.onsuccess = () => ok()
    r.onerror = () => falha(r.error)
    r.onblocked = () => ok()
  })
}
function simular(userAgent: string, maxTouchPoints = 0) {
  vi.stubGlobal('navigator', { userAgent, maxTouchPoints, onLine: true })
}

beforeEach(apagarBanco)
afterEach(() => vi.unstubAllGlobals())

describe('aparelhoAtual', () => {
  it('cria um id de 8 caracteres [a-z0-9] e o mantém entre chamadas (recargas)', async () => {
    const a = await aparelhoAtual()
    expect(a.id).toMatch(/^[a-z0-9]{8}$/)
    expect(await aparelhoAtual()).toEqual(a)
    expect((await aparelhoAtual()).id).toBe(a.id)
  })

  it('o id fica no IndexedDB (banco iconodb-usuario, loja config), não em localStorage', async () => {
    const a = await aparelhoAtual()
    const bruto = await new Promise<unknown>((ok, falha) => {
      const req = indexedDB.open('iconodb-usuario')
      req.onsuccess = () => {
        const db = req.result
        expect(Array.from(db.objectStoreNames)).toContain('config')
        const g = db.transaction('config').objectStore('config').getAll()
        g.onsuccess = () => {
          db.close()
          ok(g.result)
        }
        g.onerror = () => falha(g.error)
      }
      req.onerror = () => falha(req.error)
    })
    expect(JSON.stringify(bruto)).toContain(a.id)
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain(a.id)
  })

  it('chamadas simultâneas na primeira vez devolvem o mesmo id', async () => {
    const todos = await Promise.all(Array.from({ length: 8 }, () => aparelhoAtual()))
    expect(new Set(todos.map((t) => t.id)).size).toBe(1)
  })

  it('usa crypto.getRandomValues e só gera caracteres do alfabeto, sem viés (descarta bytes >= 252)', async () => {
    const espiao = vi.spyOn(crypto, 'getRandomValues').mockImplementation(((v: Uint8Array) => {
      // Primeiro lote: tudo rejeitável (255); depois, 0,1,..,35 repetido.
      if (espiao.mock.calls.length === 1) v.fill(255)
      else v.forEach((_, i) => (v[i] = i % 36))
      return v
    }) as never)
    const a = await aparelhoAtual()
    expect(espiao).toHaveBeenCalled()
    expect(a.id).toBe('abcdefgh')
    espiao.mockRestore()
  })

  it('ids de aparelhos diferentes (bancos diferentes) são diferentes', async () => {
    const vistos = new Set<string>()
    for (let i = 0; i < 20; i++) {
      await apagarBanco()
      vistos.add((await aparelhoAtual()).id)
    }
    expect(vistos.size).toBe(20)
  })

  it.each([
    [UA_IPHONE, 0, 'iPhone'],
    [UA_IPAD, 5, 'iPad'],
    [UA_MAC, 0, 'Mac'],
    [UA_MAC, 5, 'iPad'], // iPadOS pede o site de desktop e se apresenta como Macintosh
    [UA_WINDOWS, 0, 'Este aparelho'],
    ['', 0, 'Este aparelho'],
  ])('nome padrão pelo user agent %#', async (ua, toques, esperado) => {
    simular(ua, toques)
    expect(nomePadraoDoAparelho()).toBe(esperado)
    expect((await aparelhoAtual()).nome).toBe(esperado)
  })
})

describe('A-19: o iPhone com "site de desktop" (Macintosh com toque)', () => {
  it.each([
    [390, 844, 'iPhone'],
    [430, 932, 'iPhone'],
    [744, 1133, 'iPad'],
    [820, 1180, 'iPad'],
  ])('tela %i×%i', (largura, altura, esperado) => {
    simular(UA_MAC, 5)
    vi.stubGlobal('screen', { width: largura, height: altura })
    expect(nomePadraoDoAparelho()).toBe(esperado)
  })
})

describe('renomearAparelho', () => {
  it('troca o nome, mantém o id e persiste', async () => {
    simular(UA_IPHONE)
    const antes = await aparelhoAtual()
    const depois = await renomearAparelho('  MacBook da casa  ')
    expect(depois).toEqual({ id: antes.id, nome: 'MacBook da casa' })
    expect(await aparelhoAtual()).toEqual(depois)
  })

  it('nome vazio volta ao padrão do user agent', async () => {
    simular(UA_IPHONE)
    await renomearAparelho('Outro')
    expect((await renomearAparelho('   ')).nome).toBe('iPhone')
  })

  it('limita o tamanho do nome a 40 caracteres', async () => {
    expect((await renomearAparelho('x'.repeat(100))).nome).toHaveLength(40)
  })

  it('renomear antes de ter id cria o id uma vez só', async () => {
    const r = await renomearAparelho('Primeiro')
    expect((await aparelhoAtual()).id).toBe(r.id)
  })
})

describe('gerarId (revisão 4)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('nunca devolve "pipeline", o aparelho que o protocolo reserva às reservas da Tarefa 16: sorteia de novo', () => {
    const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789'
    const bytes = (texto: string) => [...texto].map((c) => ALFABETO.indexOf(c)).concat(Array(16 - texto.length).fill(255))
    const sorteios = [bytes('pipeline'), bytes('abcd1234')]
    const chamada = vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(destino: T): T => {
      ;(destino as unknown as Uint8Array).set(sorteios.shift() ?? bytes('zzzzzzzz'))
      return destino
    })
    expect(gerarId()).toBe('abcd1234')
    expect(chamada).toHaveBeenCalledTimes(2)
  })
})
