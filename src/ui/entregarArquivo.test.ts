/**
 * Entregar um arquivo gerado no aparelho (Tarefa 15), sem rede: Blob e um link com `download`, ou, no app instalado num
 * aparelho de toque (iPhone, iPad: onde o link com blob não é confiável), a folha de compartilhar com o arquivo; se o
 * navegador a recusa por falta de um toque recente, o arquivo fica pronto para um toque novo (nunca cai no link).
 */
import { comToque, criarArquivo, emModoApp, entregarArquivo, mensagemDoErro, type AmbienteDaEntrega } from './entregarArquivo'

interface Falso extends AmbienteDaEntrega {
  criadas: Blob[]
  revogadas: string[]
  agendadas: (() => void)[]
  cliques: { nome: string; href: string; noDocumento: boolean }[]
}

function ambiente(extra: Partial<AmbienteDaEntrega> = {}): Falso {
  const a: Falso = {
    criadas: [],
    revogadas: [],
    agendadas: [],
    cliques: [],
    emModoApp: () => false,
    comToque: () => false,
    navegador: {},
    criarUrl: (b) => {
      a.criadas.push(b)
      return `blob:teste/${a.criadas.length}`
    },
    revogarUrl: (u) => void a.revogadas.push(u),
    agendar: (f) => void a.agendadas.push(f),
    ...extra,
  }
  return a
}

/** Os cliques nos links: quem é o arquivo, o endereço, e se o link estava no documento na hora. */
function ouvirCliques(a: Falso) {
  const clicar = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    a.cliques.push({ nome: this.download, href: this.href, noDocumento: document.body.contains(this) })
  })
  return clicar
}

afterEach(() => vi.restoreAllMocks())

const arquivo = (nome = 'x.json', conteudo = '{}', tipo = 'application/json') => criarArquivo(nome, conteudo, tipo)

/** O app instalado num aparelho de toque (iPhone, iPad) que compartilha arquivos. */
const iPhoneInstalado = (share: (d?: ShareData) => Promise<void>, extra: Partial<AmbienteDaEntrega> = {}) =>
  ambiente({ emModoApp: () => true, comToque: () => true, navegador: { canShare: (d?: ShareData) => !!d?.files?.length, share }, ...extra })

describe('entregarArquivo', () => {
  it('criarArquivo: um File com o nome, o tipo e o conteúdo', async () => {
    const f = arquivo('iconodb-copia-x.json', '{"a":1}')
    expect(f.name).toBe('iconodb-copia-x.json')
    expect(f.type).toBe('application/json')
    expect(await f.text()).toBe('{"a":1}')
  })

  it('no navegador: um link com download (o arquivo como Blob) clicado e tirado, a URL revogada depois', async () => {
    const a = ambiente()
    ouvirCliques(a)
    expect(await entregarArquivo(arquivo('iconodb-copia-x.json', '{"a":1}'), a)).toBe('baixado')
    expect(a.criadas).toHaveLength(1)
    expect(a.criadas[0]!.type).toBe('application/json')
    expect(await a.criadas[0]!.text()).toBe('{"a":1}')
    expect(a.cliques).toEqual([{ nome: 'iconodb-copia-x.json', href: 'blob:teste/1', noDocumento: true }])
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
    // A URL só é revogada depois que o navegador pegou o arquivo (na volta do agendamento), nunca antes.
    expect(a.revogadas).toEqual([])
    expect(a.agendadas).toHaveLength(1)
    a.agendadas[0]!()
    expect(a.revogadas).toEqual(['blob:teste/1'])
  })

  it('iPhone com o app instalado: a folha de compartilhar com o arquivo, chamada já (antes de qualquer espera), sem link', async () => {
    const compartilhados: ShareData[] = []
    const a = iPhoneInstalado(async (d?: ShareData) => void compartilhados.push(d!))
    const clicar = ouvirCliques(a)
    const f = arquivo('iconodb-regioes-x.jsonld', '{}', 'application/ld+json')
    const entrega = entregarArquivo(f, a)
    // A folha é pedida no mesmo instante do toque: nada é esperado antes (o navegador exige um toque recente).
    expect(compartilhados).toHaveLength(1)
    expect(await entrega).toBe('compartilhado')
    expect(compartilhados[0]!.files).toEqual([f])
    expect(clicar).not.toHaveBeenCalled()
    expect(a.criadas).toEqual([])
  })

  it('o app instalado no Mac (o do Dock: standalone, sem toque) baixa pelo link; a folha do macOS não tem «Salvar em Arquivos»', async () => {
    const share = vi.fn(async () => undefined)
    const mac = ambiente({ emModoApp: () => true, comToque: () => false, navegador: { canShare: () => true, share } })
    ouvirCliques(mac)
    expect(await entregarArquivo(arquivo('iconodb-copia-x.json'), mac)).toBe('baixado')
    expect(mac.cliques.map((c) => c.nome)).toEqual(['iconodb-copia-x.json'])
    expect(share).not.toHaveBeenCalled()
  })

  it('compartilhar cancelado pela pessoa não é erro e não baixa por outro caminho', async () => {
    const a = iPhoneInstalado(async () => Promise.reject(new DOMException('cancelado', 'AbortError')))
    const clicar = ouvirCliques(a)
    expect(await entregarArquivo(arquivo(), a)).toBe('cancelado')
    expect(clicar).not.toHaveBeenCalled()
  })

  it('compartilhar recusado (o toque já não é recente: NotAllowedError): NÃO cai no link; pede um toque novo, e o mesmo arquivo vai no segundo', async () => {
    const recebidos: File[] = []
    let vezes = 0
    const a = iPhoneInstalado(async (d?: ShareData) => {
      vezes++
      if (vezes === 1) throw new DOMException('sem gesto', 'NotAllowedError')
      recebidos.push(...(d!.files ?? []))
    })
    const clicar = ouvirCliques(a)
    const f = arquivo('iconodb-copia-x.json')
    expect(await entregarArquivo(f, a)).toBe('precisa-tocar')
    expect(clicar).not.toHaveBeenCalled()
    expect(a.criadas).toEqual([])
    // O segundo toque («Salvar o arquivo») entrega o MESMO arquivo, sem montar nada de novo.
    expect(await entregarArquivo(f, a)).toBe('compartilhado')
    expect(recebidos).toEqual([f])
    expect(recebidos[0]).toBe(f)
  })

  it('outro erro ao compartilhar (nem cancelar, nem falta de toque) devolve «folha-falhou»: o arquivo existe, só a folha falhou; não cai no link', async () => {
    for (const erro of [new TypeError('x'), new DOMException('x', 'DataError')]) {
      const a = iPhoneInstalado(async () => Promise.reject(erro))
      const clicar = ouvirCliques(a)
      expect(await entregarArquivo(arquivo(), a)).toBe('folha-falhou')
      expect(clicar).not.toHaveBeenCalled()
      expect(a.criadas).toEqual([])
    }
  })

  it('fora do app instalado, mesmo com compartilhar disponível e toque, é o link; no app sem canShare de arquivos, também', async () => {
    const share = vi.fn(async () => undefined)
    const fora = ambiente({ emModoApp: () => false, comToque: () => true, navegador: { canShare: () => true, share } })
    ouvirCliques(fora)
    expect(await entregarArquivo(arquivo(), fora)).toBe('baixado')
    const semArquivos = ambiente({ emModoApp: () => true, comToque: () => true, navegador: { canShare: () => false, share } })
    ouvirCliques(semArquivos)
    expect(await entregarArquivo(arquivo(), semArquivos)).toBe('baixado')
    const semCanShare = ambiente({ emModoApp: () => true, comToque: () => true, navegador: { share } })
    ouvirCliques(semCanShare)
    expect(await entregarArquivo(arquivo(), semCanShare)).toBe('baixado')
    expect(share).not.toHaveBeenCalled()
  })

  it('emModoApp: display-mode standalone ou navigator.standalone (o iPhone)', () => {
    const mm = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q === '(display-mode: standalone)', media: q, addEventListener() {}, removeEventListener() {} })) as never
    expect(emModoApp()).toBe(true)
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never
    expect(emModoApp()).toBe(false)
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    expect(emModoApp()).toBe(true)
    delete (navigator as { standalone?: boolean }).standalone
    window.matchMedia = mm
  })

  it('comToque: navigator.maxTouchPoints > 0 (o iPad se apresenta como Mac, mas tem toque; o Mac, não)', () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true })
    expect(comToque()).toBe(true)
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true })
    expect(comToque()).toBe(false)
    delete (navigator as { maxTouchPoints?: number }).maxTouchPoints
  })
})

describe('mensagemDoErro', () => {
  it('em português, sem o nome técnico', () => {
    expect(mensagemDoErro(new DOMException('cheio', 'QuotaExceededError'))).toBe('Não há espaço livre no aparelho para gerar o arquivo. Libere espaço e tente de novo.')
    expect(mensagemDoErro(new RangeError('Invalid string length'))).toBe('O arquivo ficou grande demais para este navegador. Tente no computador.')
    expect(mensagemDoErro(new Error('x'))).toBe('Não foi possível gerar o arquivo. Nada foi alterado; tente de novo.')
    expect(mensagemDoErro('qualquer coisa')).toBe('Não foi possível gerar o arquivo. Nada foi alterado; tente de novo.')
  })
})
