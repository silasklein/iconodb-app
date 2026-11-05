import { createHash } from 'node:crypto'
import { ErroDeLogin, ErroDeRede } from '../pacote/manifesto'
import { cliente, eErroDeAutenticacao, marcarExpirado } from './auth'
import { ErroDeArquivoAusente, ErroDeCaminho, ErroDeConflito, escritaDropbox, hashDeConteudo, normalizarCaminho } from './escrita'
import { ErroDePermissao } from './fonte'

vi.mock('./auth', () => ({
  cliente: vi.fn(),
  eErroDeAutenticacao: vi.fn(() => false),
  marcarExpirado: vi.fn(async () => undefined),
}))

const sem_espera = async () => undefined
const bytes = (texto: string) => new TextEncoder().encode(texto)
const conflito = { status: 409, error: { error_summary: 'path/conflict/file/..', error: { '.tag': 'path' } } }
const naoExiste = { status: 409, error: { error_summary: 'path/not_found/..' } }

function sha256(dados: Uint8Array) {
  return createHash('sha256').update(dados).digest()
}
/** Implementação de referência, independente da do app (node:crypto). */
function hashReferencia(dados: Uint8Array): string {
  const blocos: Buffer[] = []
  for (let i = 0; i < dados.length; i += 4 * 1024 * 1024) blocos.push(sha256(dados.subarray(i, i + 4 * 1024 * 1024)))
  return sha256(Buffer.concat(blocos)).toString('hex')
}

function falso(sobrescrever: Record<string, unknown> = {}) {
  return {
    filesUpload: vi.fn(async () => ({ result: { rev: 'rev-novo' } })),
    filesGetMetadata: vi.fn(),
    filesDownload: vi.fn(async ({ path }: { path: string }) => ({ result: { fileBlob: new Blob([`conteudo de ${path}`]) } })),
    filesListFolder: vi.fn(),
    filesListFolderContinue: vi.fn(),
    ...sobrescrever,
  }
}
type Falso = ReturnType<typeof falso>
const usarCliente = (c: Falso | null) => vi.mocked(cliente).mockResolvedValue(c as never)
const abrir = async (c: Falso) => {
  usarCliente(c)
  return (await escritaDropbox({ esperar: sem_espera }))!
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
  vi.mocked(eErroDeAutenticacao).mockReturnValue(false)
})

describe('guarda de caminho', () => {
  const recusados = [
    'nucleo/manifest.json',
    'nucleo/comum.sqlite',
    'imagens/IM-1/tela.webp',
    '../nucleo/x',
    '../usuario/x',
    'usuario/../nucleo/x',
    'usuario/a/../../nucleo/x',
    'usuario/..',
    'usuario/../',
    '/usuario/../nucleo',
    '/usuario/estado.json',
    '/nucleo/x',
    'usuario',
    'usuario/',
    'usuarioX/a',
    'usuario-x/a',
    'Usuario/estado.json',
    'USUARIO/estado.json',
    ' usuario/x',
    'usuario /x',
    'usuario//x',
    'usuario/./x',
    'usuario/x/',
    'usuario/x/.',
    'usuario\\..\\nucleo\\x',
    'usuario\\x',
    'usuario/%2e%2e/nucleo',
    'usuario/%2E%2E/nucleo',
    'usuario/.%2e/nucleo',
    'usuario/..%2fnucleo',
    'usuario/x%2fy',
    'usuario/x%5cy',
    'usuario/%2e/x',
    'usuario/x\0',
    'usuario/\u0000',
    'usuario/x\n',
    'usuario/．．/x',
    'usuario/é',
    'usuario/a b',
    'usuario/a:b',
    'usuario/x.',
    'usuario/...',
    '',
    '/',
    '.',
    '..',
  ]

  it.each(recusados)('recusa %j', (caminho) => {
    expect(() => normalizarCaminho(caminho)).toThrow(ErroDeCaminho)
  })

  it('recusa o que não é texto', () => {
    for (const x of [undefined, null, 3, {}, ['usuario/x']]) expect(() => normalizarCaminho(x as never)).toThrow(ErroDeCaminho)
  })

  it.each(['usuario/estado.json', 'usuario/aparelhos.json', 'usuario/diario/ab12cd34/000001.jsonl', 'usuario/imagens/IM-ab12cd34-1/original.jpg'])(
    'aceita %s',
    (caminho) => {
      expect(normalizarCaminho(caminho)).toBe(caminho)
    },
  )

  it('enviar, baixar e listar recusam antes de qualquer chamada à rede', async () => {
    const c = falso()
    const escrita = await abrir(c)
    vi.mocked(cliente).mockClear()
    for (const caminho of recusados) {
      await expect(escrita.enviar(caminho, bytes('x'))).rejects.toBeInstanceOf(ErroDeCaminho)
      await expect(escrita.enviar(caminho, bytes('x'), { sobrescrever: { rev: 'r' } })).rejects.toBeInstanceOf(ErroDeCaminho)
      await expect(escrita.baixar(caminho)).rejects.toBeInstanceOf(ErroDeCaminho)
      if (caminho !== 'usuario' && caminho !== 'usuario/') await expect(escrita.listar(caminho)).rejects.toBeInstanceOf(ErroDeCaminho)
    }
    expect(cliente).not.toHaveBeenCalled()
    expect(c.filesUpload).not.toHaveBeenCalled()
    expect(c.filesDownload).not.toHaveBeenCalled()
    expect(c.filesListFolder).not.toHaveBeenCalled()
    expect(c.filesGetMetadata).not.toHaveBeenCalled()
  })

  it('a Escrita não tem como apagar, mover ou copiar', async () => {
    const escrita = await abrir(falso())
    expect(Object.keys(escrita).sort()).toEqual(['baixar', 'enviar', 'enviarEmPartes', 'listar'])
  })

  it('listar aceita a raiz usuario e subpastas, e nada fora delas', async () => {
    const c = falso({ filesListFolder: vi.fn(async () => ({ result: { entries: [], has_more: false, cursor: 'c' } })) })
    const escrita = await abrir(c)
    await escrita.listar('usuario')
    await escrita.listar('usuario/')
    await escrita.listar('usuario/diario')
    expect(c.filesListFolder.mock.calls.map((a) => (a as unknown[])[0])).toEqual([
      { path: '/usuario', recursive: true },
      { path: '/usuario', recursive: true },
      { path: '/usuario/diario', recursive: true },
    ])
    await expect(escrita.listar('')).rejects.toBeInstanceOf(ErroDeCaminho)
    await expect(escrita.listar('nucleo')).rejects.toBeInstanceOf(ErroDeCaminho)
  })
})

describe('hashDeConteudo (content_hash do Dropbox)', () => {
  it('vazio, pequeno, exatamente 4 MB, 4 MB + 1 e vários blocos batem com a referência', async () => {
    const MB = 1024 * 1024
    const gerar = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) % 251)
    for (const n of [0, 1, 1000, 4 * MB - 1, 4 * MB, 4 * MB + 1, 9 * MB + 5]) {
      const dados = gerar(n)
      expect(await hashDeConteudo(dados)).toBe(hashReferencia(dados))
    }
  })
  it('aceita ArrayBuffer e Uint8Array com o mesmo resultado', async () => {
    const dados = bytes('olá')
    expect(await hashDeConteudo(dados.buffer.slice(0) as ArrayBuffer)).toBe(await hashDeConteudo(dados))
  })
})

describe('enviar', () => {
  it('sem login, escritaDropbox devolve null', async () => {
    usarCliente(null)
    expect(await escritaDropbox()).toBeNull()
  })

  it('envia no modo add, sem renomear, e devolve o rev', async () => {
    const c = falso()
    const escrita = await abrir(c)
    const dados = bytes('{"v":1}\n')
    expect(await escrita.enviar('usuario/diario/ab12cd34/000001.jsonl', dados)).toEqual({ rev: 'rev-novo' })
    expect(c.filesUpload).toHaveBeenCalledTimes(1)
    expect(c.filesUpload).toHaveBeenCalledWith({
      path: '/usuario/diario/ab12cd34/000001.jsonl',
      contents: dados,
      mode: { '.tag': 'add' },
      autorename: false,
      mute: true,
    })
  })

  it('segmento que já existe com o mesmo conteúdo: ok, devolve o rev que já está lá (reenvio idempotente)', async () => {
    const dados = bytes('linha 1\nlinha 2\n')
    const c = falso({
      filesUpload: vi.fn().mockRejectedValue(conflito),
      filesGetMetadata: vi.fn(async () => ({ result: { '.tag': 'file', rev: 'rev-existente', content_hash: await hashDeConteudo(dados) } })),
    })
    const escrita = await abrir(c)
    expect(await escrita.enviar('usuario/diario/ab12cd34/000002.jsonl', dados)).toEqual({ rev: 'rev-existente' })
    expect(c.filesUpload).toHaveBeenCalledTimes(1)
    expect(c.filesGetMetadata).toHaveBeenCalledWith({ path: '/usuario/diario/ab12cd34/000002.jsonl' })
  })

  it('segmento que já existe com conteúdo diferente: ErroDeConflito, sem sobrescrever', async () => {
    const c = falso({
      filesUpload: vi.fn().mockRejectedValue(conflito),
      filesGetMetadata: vi.fn(async () => ({ result: { '.tag': 'file', rev: 'r', content_hash: await hashDeConteudo(bytes('outro')) } })),
    })
    const escrita = await abrir(c)
    const erro = await escrita.enviar('usuario/diario/ab12cd34/000002.jsonl', bytes('este')).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroDeConflito)
    expect((erro as ErroDeConflito).caminho).toBe('usuario/diario/ab12cd34/000002.jsonl')
    expect(c.filesUpload).toHaveBeenCalledTimes(1)
  })

  it('o envio que chegou ao Dropbox mas perdeu a resposta: a repetição vê o conflito e confirma pelo hash', async () => {
    const dados = bytes('segmento')
    const c = falso({
      filesUpload: vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockRejectedValueOnce(conflito),
      filesGetMetadata: vi.fn(async () => ({ result: { '.tag': 'file', rev: 'rev-que-subiu', content_hash: await hashDeConteudo(dados) } })),
    })
    const escrita = await abrir(c)
    expect(await escrita.enviar('usuario/diario/ab12cd34/000003.jsonl', dados)).toEqual({ rev: 'rev-que-subiu' })
    expect(c.filesUpload).toHaveBeenCalledTimes(2)
  })

  it('sobrescrever com rev usa o modo update, sem renomear', async () => {
    const c = falso()
    const escrita = await abrir(c)
    const dados = bytes('{}')
    expect(await escrita.enviar('usuario/estado.json', dados, { sobrescrever: { rev: 'rev-lido' } })).toEqual({ rev: 'rev-novo' })
    expect(c.filesUpload).toHaveBeenCalledWith({
      path: '/usuario/estado.json',
      contents: dados,
      mode: { '.tag': 'update', update: 'rev-lido' },
      autorename: false,
      mute: true,
    })
  })

  it('sobrescrever com rev que não é mais o atual (outro aparelho gravou): ErroDeConflito', async () => {
    const c = falso({
      filesUpload: vi.fn().mockRejectedValue(conflito),
      filesGetMetadata: vi.fn(async () => ({ result: { '.tag': 'file', rev: 'rev-de-outro', content_hash: await hashDeConteudo(bytes('de outro')) } })),
    })
    const escrita = await abrir(c)
    await expect(escrita.enviar('usuario/estado.json', bytes('meu'), { sobrescrever: { rev: 'rev-velho' } })).rejects.toBeInstanceOf(ErroDeConflito)
  })

  it('sobrescrever com rev null ("não pode existir ainda") usa o modo add', async () => {
    const c = falso()
    const escrita = await abrir(c)
    await escrita.enviar('usuario/estado.json', bytes('{}'), { sobrescrever: { rev: null } })
    expect(c.filesUpload).toHaveBeenCalledWith(expect.objectContaining({ mode: { '.tag': 'add' }, autorename: false }))
  })

  it('sobrescrever com rev null e arquivo já existente diferente: ErroDeConflito', async () => {
    const c = falso({
      filesUpload: vi.fn().mockRejectedValue(conflito),
      filesGetMetadata: vi.fn(async () => ({ result: { '.tag': 'file', rev: 'r', content_hash: await hashDeConteudo(bytes('x')) } })),
    })
    const escrita = await abrir(c)
    await expect(escrita.enviar('usuario/estado.json', bytes('y'), { sobrescrever: { rev: null } })).rejects.toBeInstanceOf(ErroDeConflito)
  })

  it('conflito que é uma pasta no lugar do arquivo: ErroDeConflito', async () => {
    const c = falso({
      filesUpload: vi.fn().mockRejectedValue(conflito),
      filesGetMetadata: vi.fn(async () => ({ result: { '.tag': 'folder' } })),
    })
    const escrita = await abrir(c)
    await expect(escrita.enviar('usuario/estado.json', bytes('y'))).rejects.toBeInstanceOf(ErroDeConflito)
  })

  it('o arquivo conflitante some entre o envio e a conferência: envia de novo', async () => {
    const c = falso({
      filesUpload: vi.fn().mockRejectedValueOnce(conflito).mockResolvedValue({ result: { rev: 'rev-ok' } }),
      filesGetMetadata: vi.fn().mockRejectedValue(naoExiste),
    })
    const escrita = await abrir(c)
    expect(await escrita.enviar('usuario/estado.json', bytes('y'))).toEqual({ rev: 'rev-ok' })
    expect(c.filesUpload).toHaveBeenCalledTimes(2)
  })

  it('repete em 429 e em falha de rede (como a Fonte) e entrega quando volta', async () => {
    const c = falso({
      filesUpload: vi
        .fn()
        .mockRejectedValueOnce({ status: 429, error: { error: { retry_after: 3 } } })
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue({ result: { rev: 'r3' } }),
    })
    usarCliente(c)
    const esperas: number[] = []
    const escrita = (await escritaDropbox({ esperar: async (ms) => void esperas.push(ms) }))!
    expect(await escrita.enviar('usuario/diario/a/000001.jsonl', bytes('x'))).toEqual({ rev: 'r3' })
    expect(c.filesUpload).toHaveBeenCalledTimes(3)
    expect(esperas).toEqual([3000, 2000])
  })

  it('desiste da rede depois de 4 tentativas com ErroDeRede', async () => {
    const c = falso({ filesUpload: vi.fn().mockRejectedValue(new DOMException('tempo', 'TimeoutError')) })
    const escrita = await abrir(c)
    await expect(escrita.enviar('usuario/diario/a/000001.jsonl', bytes('x'))).rejects.toBeInstanceOf(ErroDeRede)
    expect(c.filesUpload).toHaveBeenCalledTimes(4)
  })

  it('com o navegador sem rede, vai direto a ErroDeRede, sem enviar', async () => {
    const c = falso()
    const escrita = await abrir(c)
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    await expect(escrita.enviar('usuario/estado.json', bytes('x'))).rejects.toBeInstanceOf(ErroDeRede)
    expect(c.filesUpload).not.toHaveBeenCalled()
  })

  it('prazos: 20 s para JSON/JSONL e listagem; 60 s para imagens', async () => {
    const c = falso({ filesListFolder: vi.fn(async () => ({ result: { entries: [], has_more: false, cursor: 'c' } })) })
    const escrita = await abrir(c)
    vi.mocked(cliente).mockClear()
    await escrita.enviar('usuario/estado.json', bytes('x'))
    await escrita.enviar('usuario/diario/a/000001.jsonl', bytes('x'))
    await escrita.enviar('usuario/imagens/IM-a-1/tela.webp', bytes('x'))
    await escrita.baixar('usuario/estado.json')
    await escrita.baixar('usuario/imagens/IM-a-1/tela.webp')
    await escrita.listar('usuario')
    expect(vi.mocked(cliente).mock.calls.map((a) => (a[0] as { prazoMs: number }).prazoMs)).toEqual([
      20_000, 20_000, 60_000, 20_000, 60_000, 20_000,
    ])
  })

  it('recusa o que passa do limite de um envio simples do Dropbox (150 MB), sem chamar a rede', async () => {
    const c = falso()
    const escrita = await abrir(c)
    const grande = new ArrayBuffer(150 * 1024 * 1024 + 1)
    await expect(escrita.enviar('usuario/imagens/IM-a-1/original.jpg', grande)).rejects.toBeInstanceOf(RangeError)
    expect(c.filesUpload).not.toHaveBeenCalled()
  })

  it('A-4: só ArrayBuffer ou Uint8Array (bytes); Uint16Array, DataView e objetos com byteLength são recusados antes da rede', async () => {
    const c = falso()
    const escrita = await abrir(c)
    const u16 = new Uint16Array([0x4142, 0x4344])
    for (const x of [u16, new DataView(u16.buffer), new Float32Array(2), { byteLength: 4 }, 'texto', null]) {
      await expect(escrita.enviar('usuario/diario/ab12cd34/000001.jsonl', x as unknown as Uint8Array)).rejects.toBeInstanceOf(TypeError)
    }
    expect(c.filesUpload).not.toHaveBeenCalled()
    await expect(hashDeConteudo(u16 as unknown as Uint8Array)).rejects.toBeInstanceOf(TypeError)
  })

  it('A-4: um Uint8Array de outro realm (jsdom × Node) e uma vista no meio de um buffer têm o hash dos bytes que mostram', async () => {
    const { runInNewContext } = await import('node:vm')
    const deFora = runInNewContext('new Uint8Array([111, 108, 195, 161])') as Uint8Array
    expect(deFora instanceof Uint8Array).toBe(false)
    expect(await hashDeConteudo(deFora)).toBe(await hashDeConteudo(bytes('olá')))
    const buffer = new Uint8Array([0, 0, 111, 108, 195, 161, 9])
    expect(await hashDeConteudo(buffer.subarray(2, 6))).toBe(await hashDeConteudo(bytes('olá')))
    const bufferDeFora = runInNewContext('new Uint8Array([111, 108, 195, 161]).buffer') as ArrayBuffer
    expect(await hashDeConteudo(bufferDeFora)).toBe(await hashDeConteudo(bytes('olá')))
    const c = falso()
    const escrita = await abrir(c)
    expect(await escrita.enviar('usuario/diario/ab12cd34/000001.jsonl', deFora)).toEqual({ rev: 'rev-novo' })
  })
})

describe('permissões e login', () => {
  const faltaEscrita = {
    status: 401,
    error: { error_summary: 'missing_scope/..', error: { '.tag': 'missing_scope', required_scope: 'files.content.write' } },
  }

  it('401 missing_scope no envio vira ErroDePermissao("files.content.write"), sem marcar o login como expirado e sem repetir', async () => {
    const c = falso({ filesUpload: vi.fn().mockRejectedValue(faltaEscrita) })
    const escrita = await abrir(c)
    const erro = await escrita.enviar('usuario/estado.json', bytes('x')).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroDePermissao)
    expect((erro as ErroDePermissao).escopo).toBe('files.content.write')
    expect(marcarExpirado).not.toHaveBeenCalled()
    expect(c.filesUpload).toHaveBeenCalledTimes(1)
  })

  it('missing_scope sem o nome do escopo no corpo: o envio assume files.content.write', async () => {
    const c = falso({ filesUpload: vi.fn().mockRejectedValue({ status: 401, error: { error_summary: 'missing_scope/..' } }) })
    const escrita = await abrir(c)
    const erro = await escrita.enviar('usuario/estado.json', bytes('x')).catch((e: unknown) => e)
    expect((erro as ErroDePermissao).escopo).toBe('files.content.write')
  })

  it('missing_scope na conferência do conflito (files.metadata.read) também é ErroDePermissao', async () => {
    const c = falso({
      filesUpload: vi.fn().mockRejectedValue(conflito),
      filesGetMetadata: vi.fn().mockRejectedValue({
        status: 401,
        error: { error_summary: 'missing_scope/..', error: { '.tag': 'missing_scope', required_scope: 'files.metadata.read' } },
      }),
    })
    const escrita = await abrir(c)
    const erro = await escrita.enviar('usuario/estado.json', bytes('x')).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroDePermissao)
    expect((erro as ErroDePermissao).escopo).toBe('files.metadata.read')
  })

  it('credencial recusada marca o login como expirado e lança ErroDeLogin, sem repetir', async () => {
    const c = falso({ filesUpload: vi.fn().mockRejectedValue({ status: 401 }) })
    vi.mocked(eErroDeAutenticacao).mockReturnValue(true)
    const escrita = await abrir(c)
    await expect(escrita.enviar('usuario/estado.json', bytes('x'))).rejects.toBeInstanceOf(ErroDeLogin)
    expect(marcarExpirado).toHaveBeenCalledTimes(1)
    expect(c.filesUpload).toHaveBeenCalledTimes(1)
  })

  it('outro erro do Dropbox (ex.: sem espaço) sobe como está, sem repetir', async () => {
    const c = falso({ filesUpload: vi.fn().mockRejectedValue({ status: 409, error: { error_summary: 'path/insufficient_space/..' } }) })
    const escrita = await abrir(c)
    await expect(escrita.enviar('usuario/estado.json', bytes('x'))).rejects.toMatchObject({ status: 409 })
    expect(c.filesUpload).toHaveBeenCalledTimes(1)
  })
})

describe('baixar e listar', () => {
  it('baixa pelo caminho na raiz da pasta do app', async () => {
    const c = falso()
    const escrita = await abrir(c)
    expect(new TextDecoder().decode(await escrita.baixar('usuario/estado.json'))).toBe('conteudo de /usuario/estado.json')
    expect(c.filesDownload).toHaveBeenCalledWith({ path: '/usuario/estado.json' })
  })

  it('arquivo que não existe vira ErroDeArquivoAusente (não "pacote ausente")', async () => {
    const c = falso({ filesDownload: vi.fn().mockRejectedValue(naoExiste) })
    const escrita = await abrir(c)
    const erro = await escrita.baixar('usuario/estado.json').catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroDeArquivoAusente)
    expect((erro as ErroDeArquivoAusente).caminho).toBe('usuario/estado.json')
    expect(c.filesDownload).toHaveBeenCalledTimes(1)
  })

  it('lista só os arquivos, com rev e tamanho, seguindo a paginação', async () => {
    const c = falso({
      filesListFolder: vi.fn(async () => ({
        result: {
          entries: [
            { '.tag': 'folder', path_display: '/usuario/diario' },
            { '.tag': 'file', path_display: '/usuario/diario/ab12cd34/000002.jsonl', rev: 'r2', size: 20 },
          ],
          has_more: true,
          cursor: 'c1',
        },
      })),
      filesListFolderContinue: vi.fn(async () => ({
        result: { entries: [{ '.tag': 'file', path_display: '/usuario/diario/ab12cd34/000001.jsonl', rev: 'r1', size: 10 }], has_more: false, cursor: 'c2' },
      })),
    })
    const escrita = await abrir(c)
    expect(await escrita.listar('usuario/diario')).toEqual([
      { caminho: 'usuario/diario/ab12cd34/000001.jsonl', rev: 'r1', tamanho: 10 },
      { caminho: 'usuario/diario/ab12cd34/000002.jsonl', rev: 'r2', tamanho: 20 },
    ])
    expect(c.filesListFolderContinue).toHaveBeenCalledWith({ cursor: 'c1' })
  })

  it('listar com recursivo: false pede só o que está direto na pasta (não desce às subpastas)', async () => {
    const c = falso({
      filesListFolder: vi.fn(async () => ({
        result: { entries: [{ '.tag': 'file', path_display: '/usuario/estado.json', rev: 'r1', size: 5 }, { '.tag': 'folder', path_display: '/usuario/imagens' }], has_more: false, cursor: 'c' },
      })),
    })
    const escrita = await abrir(c)
    expect(await escrita.listar('usuario', { recursivo: false })).toEqual([{ caminho: 'usuario/estado.json', rev: 'r1', tamanho: 5 }])
    expect(c.filesListFolder).toHaveBeenCalledWith({ path: '/usuario', recursive: false })
  })

  it('pasta usuario ainda inexistente (primeiro uso): lista vazia, não erro', async () => {
    const c = falso({ filesListFolder: vi.fn().mockRejectedValue(naoExiste) })
    const escrita = await abrir(c)
    expect(await escrita.listar('usuario')).toEqual([])
  })
})

describe('enviarEmPartes (upload_session: start, append_v2, finish) — revisão 1, I1', () => {
  /** Um Dropbox falso com sessões de envio: guarda as partes, confere o offset e, no finish, faz o "add" sem renomear. */
  function comSessoes(opcoes: { existente?: Uint8Array; perderRespostaDoAppend?: number } = {}) {
    const sessoes = new Map<string, Uint8Array[]>()
    let n = 0
    let appends = 0
    const juntar = (id: string) => {
      const partes = sessoes.get(id)!
      const total = partes.reduce((s, p) => s + p.length, 0)
      const r = new Uint8Array(total)
      let o = 0
      for (const p of partes) {
        r.set(p, o)
        o += p.length
      }
      return r
    }
    const offsetErrado = (certo: number) => ({ status: 409, error: { error_summary: 'incorrect_offset/..', error: { '.tag': 'incorrect_offset', correct_offset: certo } } })
    const extras = {
      filesUploadSessionStart: vi.fn(async ({ contents }: { contents: Uint8Array }) => {
        const id = `s${++n}`
        sessoes.set(id, [contents.slice()])
        return { result: { session_id: id } }
      }),
      filesUploadSessionAppendV2: vi.fn(async ({ cursor, contents }: { cursor: { session_id: string; offset: number }; contents: Uint8Array }) => {
        if (!sessoes.has(cursor.session_id)) throw { status: 409, error: { error_summary: 'not_found/..', error: { '.tag': 'not_found' } } }
        const atual = juntar(cursor.session_id).length
        if (cursor.offset !== atual) throw offsetErrado(atual)
        sessoes.get(cursor.session_id)!.push(contents.slice())
        appends++
        if (opcoes.perderRespostaDoAppend === appends) throw new TypeError('Failed to fetch') // chegou, mas a resposta se perdeu
        return { result: null }
      }),
      filesUploadSessionFinish: vi.fn(async ({ cursor, commit }: { cursor: { session_id: string; offset: number }; commit: { path: string; mode: { '.tag': string }; autorename: boolean } }) => {
        const dados = juntar(cursor.session_id)
        if (cursor.offset !== dados.length) throw { status: 409, error: { error_summary: 'lookup_failed/incorrect_offset/..', error: { '.tag': 'lookup_failed', lookup_failed: { '.tag': 'incorrect_offset', correct_offset: dados.length } } } }
        if (commit.mode['.tag'] !== 'add' || commit.autorename !== false) throw new Error('modo errado')
        if (opcoes.existente) throw { status: 409, error: { error_summary: 'path/conflict/file/..', error: { '.tag': 'path', path: { '.tag': 'conflict' } } } }
        return { result: { rev: 'rev-partes', size: dados.length, content_hash: hashReferencia(dados) } }
      }),
    }
    const c = { ...falso({ filesGetMetadata: vi.fn(async () => ({ result: { '.tag': 'file', rev: 'rev-existente', content_hash: hashReferencia(opcoes.existente ?? new Uint8Array()) } })) }), ...extras }
    return { c, sessoes, juntar }
  }
  const grande = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) % 251)
  const PARTE = 1000

  it('envia em partes do tamanho dado e conclui com add sem renomear; cada parte avança a sessão guardada', async () => {
    const { c, juntar } = comSessoes()
    const escrita = await abrir(c as unknown as Falso)
    const dados = grande(3500)
    const passos: (unknown | null)[] = []
    const r = await escrita.enviarEmPartes!('usuario/imagens/IM-ab12cd34-1/original.jpg', new Blob([dados]), { parte: PARTE, aoAvancar: (s) => void passos.push(s) })
    expect(r).toEqual({ rev: 'rev-partes' })
    expect(c.filesUploadSessionStart).toHaveBeenCalledTimes(1)
    expect(c.filesUploadSessionAppendV2).toHaveBeenCalledTimes(3)
    expect(passos).toEqual([{ id: 's1', offset: 1000 }, { id: 's1', offset: 2000 }, { id: 's1', offset: 3000 }, { id: 's1', offset: 3500 }, null])
    expect([...juntar('s1')]).toEqual([...dados])
    expect(c.filesUploadSessionFinish).toHaveBeenCalledWith(expect.objectContaining({ commit: { path: '/usuario/imagens/IM-ab12cd34-1/original.jpg', mode: { '.tag': 'add' }, autorename: false, mute: true } }))
  })

  it('retoma do offset guardado: não começa outra sessão nem reenvia o que já está lá', async () => {
    const { c, sessoes, juntar } = comSessoes()
    const dados = grande(3500)
    sessoes.set('s9', [dados.slice(0, 2000)]) // o que subiu antes de o app fechar
    const escrita = await abrir(c as unknown as Falso)
    await escrita.enviarEmPartes!('usuario/imagens/IM-ab12cd34-1/original.jpg', new Blob([dados]), { parte: PARTE, sessao: { id: 's9', offset: 2000 } })
    expect(c.filesUploadSessionStart).not.toHaveBeenCalled()
    expect(c.filesUploadSessionAppendV2).toHaveBeenCalledTimes(2)
    expect(c.filesUploadSessionAppendV2.mock.calls[0]![0].cursor).toEqual({ session_id: 's9', offset: 2000 })
    expect([...juntar('s9')]).toEqual([...dados])
  })

  it('a resposta de uma parte se perdeu (a parte chegou): o offset certo que o Dropbox devolve é seguido, sem duplicar bytes', async () => {
    const { c, juntar } = comSessoes({ perderRespostaDoAppend: 1 })
    const escrita = await abrir(c as unknown as Falso)
    const dados = grande(3500)
    await escrita.enviarEmPartes!('usuario/imagens/IM-ab12cd34-1/original.jpg', new Blob([dados]), { parte: PARTE })
    expect([...juntar('s1')]).toEqual([...dados])
  })

  it('sessão vencida ou desconhecida (o app ficou fechado mais de 7 dias): começa outra, do zero', async () => {
    const { c, juntar } = comSessoes()
    const escrita = await abrir(c as unknown as Falso)
    const dados = grande(2500)
    const passos: unknown[] = []
    await escrita.enviarEmPartes!('usuario/imagens/IM-ab12cd34-1/original.jpg', new Blob([dados]), { parte: PARTE, sessao: { id: 'vencida', offset: 2000 }, aoAvancar: (s) => void passos.push(s) })
    expect(c.filesUploadSessionStart).toHaveBeenCalledTimes(1)
    expect(passos[0]).toBeNull()
    expect([...juntar('s1')]).toEqual([...dados])
  })

  it('idempotente: o arquivo já está lá com o mesmo conteúdo (finish que chegou e perdeu a resposta): ok, o rev que está lá', async () => {
    const dados = grande(2500)
    const { c } = comSessoes({ existente: dados })
    const escrita = await abrir(c as unknown as Falso)
    expect(await escrita.enviarEmPartes!('usuario/imagens/IM-ab12cd34-1/original.jpg', new Blob([dados]), { parte: PARTE })).toEqual({ rev: 'rev-existente' })
  })

  it('já está lá com OUTRO conteúdo: ErroDeConflito, nada sobrescrito', async () => {
    const { c } = comSessoes({ existente: grande(10) })
    const escrita = await abrir(c as unknown as Falso)
    await expect(escrita.enviarEmPartes!('usuario/imagens/IM-ab12cd34-1/original.jpg', new Blob([grande(2500)]), { parte: PARTE })).rejects.toBeInstanceOf(ErroDeConflito)
  })

  it('guarda de caminho também aqui; e cada parte tem o próprio prazo (clienteOuLogin chamado por parte)', async () => {
    const { c } = comSessoes()
    const escrita = await abrir(c as unknown as Falso)
    await expect(escrita.enviarEmPartes!('nucleo/x', new Blob([grande(10)]))).rejects.toBeInstanceOf(ErroDeCaminho)
    vi.mocked(cliente).mockClear()
    await escrita.enviarEmPartes!('usuario/imagens/IM-ab12cd34-1/original.jpg', new Blob([grande(3500)]), { parte: PARTE })
    // start + 3 append + finish: um prazo novo por chamada.
    expect(vi.mocked(cliente).mock.calls.filter(([o]) => (o as { prazoMs?: number } | undefined)?.prazoMs === 120_000)).toHaveLength(5)
  })
})

describe('hashDeBlob', () => {
  it('o mesmo content_hash do Dropbox, lendo o Blob em blocos de 4 MB (sem carregar tudo)', async () => {
    const { hashDeBlob } = await import('./escrita')
    const dados = Uint8Array.from({ length: 4 * 1024 * 1024 + 5 }, (_, i) => i % 256)
    expect(await hashDeBlob(new Blob([dados]))).toBe(hashReferencia(dados))
  })
})
