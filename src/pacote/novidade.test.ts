import { fonteDeTeste } from '../../tests/suporte/fonteDeTeste'
import { armazemMemoria, type Armazem } from './armazem'
import { sha256, sincronizarPacote } from './baixar'
import { cacheMemoria } from './imagens'
import { ErroDeLogin, ErroDeRede, type Fonte, type Manifesto } from './manifesto'
import { ErroDePacoteAusente, ErroDePermissao } from '../dropbox/fonte'
import {
  assinarNovidade,
  atualizandoOsLivros,
  compararComODropbox,
  esquecerNovidade,
  marcarAtualizando,
  marcarEmDia,
  novidadeAtual,
  procurarAgora,
  procurarNaAbertura,
  procurarNovidade,
  rotulosDosLivros,
  usarProcura,
} from './novidade'

const MANIFESTO = 'nucleo/manifest.json'
/** Os rótulos dos livros do pacote sintético (pacote 11: o TESTE, o livro em parágrafos e a tradução dele). */
const ROTULOS = ['TESTE I', 'TESTEG', 'TESTEGEN']
const codificar = (texto: string) => Uint8Array.from(new TextEncoder().encode(texto))

/** A Fonte de teste com o manifesto alterado (e, se dado, um arquivo trocado e anunciado nele). */
function fonteAlterada(alterar: (m: Manifesto) => void | Promise<void>, base: Fonte = fonteDeTeste()): Fonte & { manifestos: number } {
  const f = {
    manifestos: 0,
    listar: (p?: string) => base.listar(p),
    async baixar(caminho: string) {
      if (caminho !== MANIFESTO) return base.baixar(caminho)
      f.manifestos++
      const m = JSON.parse(new TextDecoder().decode(await base.baixar(MANIFESTO))) as Manifesto
      await alterar(m)
      return codificar(JSON.stringify(m)).buffer as ArrayBuffer
    },
  }
  return f
}

/** Um pacote mais novo que o sintético: o fold.json mudou (e o manifesto o anuncia). */
async function pacoteMaisNovo(): Promise<Fonte & { manifestos: number }> {
  const fold = codificar('{"novo": true}')
  const sha = await sha256(fold)
  const base = fonteDeTeste()
  const f = fonteAlterada((m) => {
    m.gerado_em = '2026-11-14T13:55:59Z'
    m.arquivos['nucleo/fold.json'] = { sha256: sha, bytes: fold.byteLength }
  }, base)
  const baixarManifesto = f.baixar
  f.baixar = async (c) => (c === 'nucleo/fold.json' ? (fold.slice().buffer as ArrayBuffer) : baixarManifesto(c))
  return f
}

let armazem: Armazem

/** O aparelho com o pacote sintético já baixado (estado.json gravado). */
async function comPacoteSintetico() {
  await sincronizarPacote(fonteDeTeste(), () => undefined, { armazem, cache: cacheMemoria() })
}

beforeEach(() => {
  armazem = armazemMemoria()
  esquecerNovidade()
})

afterEach(() => usarProcura(null))

describe('compararComODropbox: o pacote do Dropbox é outro que o do aparelho?', () => {
  it('o mesmo pacote: em dia', async () => {
    await comPacoteSintetico()
    expect(await compararComODropbox(fonteDeTeste(), armazem)).toEqual({ tipo: 'em-dia' })
  })

  it('só o gerado_em mudou (os arquivos são os mesmos): em dia, como no download (a mesma assinatura)', async () => {
    await comPacoteSintetico()
    const f = fonteAlterada((m) => void (m.gerado_em = '2030-01-01T00:00:00Z'))
    expect(await compararComODropbox(f, armazem)).toEqual({ tipo: 'em-dia' })
  })

  it('um arquivo mudou de sha256: nova, com os rótulos dos livros', async () => {
    await comPacoteSintetico()
    expect(await compararComODropbox(await pacoteMaisNovo(), armazem)).toEqual({ tipo: 'nova', rotulos: ROTULOS })
  })

  it('um arquivo a mais (ou a menos) também é outro pacote', async () => {
    await comPacoteSintetico()
    const mais = fonteAlterada((m) => {
      m.arquivos['imagens/TESTE/TESTE-0001/thumb-9.webp'] = { sha256: 'a'.repeat(64), bytes: 10 }
    })
    expect((await compararComODropbox(mais, armazem)).tipo).toBe('nova')
    const menos = fonteAlterada((m) => {
      delete m.arquivos['imagens/TESTE/TESTE-0001/thumb-2.webp']
    })
    expect((await compararComODropbox(menos, armazem)).tipo).toBe('nova')
  })

  it('sem pacote no aparelho: nova (o download também trata a falta de estado como mudança)', async () => {
    expect(await compararComODropbox(fonteDeTeste(), armazem)).toEqual({ tipo: 'nova', rotulos: ROTULOS })
  })

  it('schema que o app não abre: incompatível (não é novidade nem erro)', async () => {
    await comPacoteSintetico()
    const f = fonteAlterada((m) => {
      m.schema = 99
      m.arquivos['nucleo/fold.json'] = { sha256: 'b'.repeat(64), bytes: 3 }
    })
    expect(await compararComODropbox(f, armazem)).toEqual({ tipo: 'incompativel' })
  })

  it('pacote com defeito (validarPacote o recusa) ou manifesto ilegível: incompatível', async () => {
    await comPacoteSintetico()
    const semBanco = fonteAlterada((m) => {
      delete m.arquivos['nucleo/busca.sqlite']
    })
    expect(await compararComODropbox(semBanco, armazem)).toEqual({ tipo: 'incompativel' })
    const ilegivel: Fonte = { listar: async () => [], baixar: async () => codificar('{não é json').buffer as ArrayBuffer }
    expect(await compararComODropbox(ilegivel, armazem)).toEqual({ tipo: 'incompativel' })
  })

  it('sem internet: o erro sobe (quem chama decide; procurarNovidade o transforma em «desconhecida»)', async () => {
    await comPacoteSintetico()
    const offline: Fonte = { listar: async () => [], baixar: async () => Promise.reject(new ErroDeRede()) }
    await expect(compararComODropbox(offline, armazem)).rejects.toBeInstanceOf(ErroDeRede)
  })
})

describe('rotulosDosLivros', () => {
  const pub = (p: object) => ({ sigla: 'IPIAO', ...p })
  it('vários volumes: a sigla e o primeiro–último', () => {
    const volumes = ['I', 'II', 'III', 'IV'].map((v) => ({ volume: v, rotulo: `IPIAO ${v}`, ano: 2000 }))
    expect(rotulosDosLivros({ publicacoes: [pub({ volume: '', rotulo: 'IPIAO', volumes })] })).toEqual(['IPIAO I–IV'])
  })
  it('um volume: o rótulo dele', () => {
    expect(rotulosDosLivros({ publicacoes: [pub({ volume: 'I', rotulo: 'IPIAO I', volumes: [{ volume: 'I', rotulo: 'IPIAO I', ano: 2006 }] })] })).toEqual(['IPIAO I'])
  })
  it('sem `volumes` (pacote antigo) ou com `volumes` estranho: o rótulo da publicação, ou a sigla', () => {
    expect(rotulosDosLivros({ publicacoes: [pub({ rotulo: 'IPIAO I' }), { sigla: 'GGIG' }, pub({ sigla: 'X', volumes: 'lixo' }), pub({ sigla: 'Y', volumes: [null, 3] })] })).toEqual([
      'IPIAO I',
      'GGIG',
      'X',
      'Y',
    ])
  })
})

describe('procurarNovidade: nunca lança', () => {
  it('sem login (a Fonte é null): desconhecida', async () => {
    await comPacoteSintetico()
    expect(await procurarNovidade({ obterFonte: async () => null, armazem })).toEqual({ tipo: 'desconhecida' })
  })

  it('sem internet ao pedir a Fonte ou ao baixar o manifesto: desconhecida', async () => {
    await comPacoteSintetico()
    expect(await procurarNovidade({ obterFonte: async () => Promise.reject(new ErroDeRede()), armazem })).toEqual({ tipo: 'desconhecida' })
    const offline: Fonte = { listar: async () => [], baixar: async () => Promise.reject(new TypeError('Failed to fetch')) }
    expect(await procurarNovidade({ obterFonte: async () => offline, armazem })).toEqual({ tipo: 'desconhecida' })
  })

  it('login expirado no meio: desconhecida', async () => {
    await comPacoteSintetico()
    const expirado: Fonte = { listar: async () => [], baixar: async () => Promise.reject(new ErroDeLogin()) }
    expect(await procurarNovidade({ obterFonte: async () => expirado, armazem })).toEqual({ tipo: 'desconhecida' })
  })

  it('o manifesto não está na pasta do app, ou falta uma permissão: desconhecida, com o motivo', async () => {
    await comPacoteSintetico()
    const ausente: Fonte = { listar: async () => [], baixar: async (c) => Promise.reject(new ErroDePacoteAusente(c)) }
    expect(await procurarNovidade({ obterFonte: async () => ausente, armazem })).toEqual({ tipo: 'desconhecida', motivo: 'sem-pacote' })
    const semPermissao: Fonte = { listar: async () => [], baixar: async () => Promise.reject(new ErroDePermissao('files.content.read')) }
    expect(await procurarNovidade({ obterFonte: async () => semPermissao, armazem })).toEqual({ tipo: 'desconhecida', motivo: 'sem-permissao' })
  })

  it('o aparelho sem armazém (o navegador não guarda arquivos): desconhecida', async () => {
    // Sem `armazem`, vale o do app (o OPFS), que o jsdom não tem: armazemPadrao() lança.
    expect(await procurarNovidade({ obterFonte: async () => fonteDeTeste() })).toEqual({ tipo: 'desconhecida' })
  })

  it('com a Fonte e o pacote: a resposta da comparação', async () => {
    await comPacoteSintetico()
    expect(await procurarNovidade({ obterFonte: async () => fonteDeTeste(), armazem })).toEqual({ tipo: 'em-dia' })
    expect(await procurarNovidade({ obterFonte: async () => pacoteMaisNovo(), armazem })).toEqual({ tipo: 'nova', rotulos: ROTULOS })
  })
})

describe('a procura da abertura e a de pedido', () => {
  it('na abertura em que o pacote acabou de ser baixado (marcarEmDia), o Início não baixa o manifesto de novo', async () => {
    await comPacoteSintetico()
    const f = await pacoteMaisNovo()
    usarProcura({ obterFonte: async () => f, armazem })
    marcarEmDia()
    expect(await procurarNaAbertura()).toEqual({ tipo: 'em-dia' })
    expect(f.manifestos).toBe(0)
    expect(novidadeAtual()).toEqual({ tipo: 'em-dia' })
    // A procura a pedido continua procurando.
    expect((await procurarAgora()).tipo).toBe('nova')
    expect(f.manifestos).toBe(1)
  })

  it('uma procura sem resposta não apaga um «nova» anterior (o pacote novo continua no Dropbox), mas devolve a resposta dela', async () => {
    await comPacoteSintetico()
    usarProcura({ obterFonte: async () => pacoteMaisNovo(), armazem })
    await procurarNaAbertura()
    expect(novidadeAtual()?.tipo).toBe('nova')
    usarProcura({ obterFonte: async () => Promise.reject(new ErroDeRede()), armazem })
    expect(await procurarAgora()).toEqual({ tipo: 'desconhecida' })
    expect(novidadeAtual()?.tipo).toBe('nova')
    // Uma resposta de verdade vale por cima: o mesmo pacote, ou um que não abre.
    usarProcura({ obterFonte: async () => fonteAlterada((m) => void (m.schema = 99)), armazem })
    expect(await procurarAgora()).toEqual({ tipo: 'incompativel' })
    expect(novidadeAtual()).toEqual({ tipo: 'incompativel' })
    // Sem «nova» antes, a falta de resposta é publicada (a tela de Sincronização a diz).
    usarProcura({ obterFonte: async () => null, armazem })
    await procurarAgora()
    expect(novidadeAtual()).toEqual({ tipo: 'desconhecida' })
  })

  it('marcarAtualizando conta os downloads em andamento e avisa quem ouve', () => {
    const ouvinte = vi.fn()
    const parar = assinarNovidade(ouvinte)
    expect(atualizandoOsLivros()).toBe(false)
    marcarAtualizando(true)
    marcarAtualizando(true)
    marcarAtualizando(false)
    expect(atualizandoOsLivros()).toBe(true)
    marcarAtualizando(false)
    expect(atualizandoOsLivros()).toBe(false)
    marcarAtualizando(false) // nunca abaixo de zero
    marcarAtualizando(true)
    expect(atualizandoOsLivros()).toBe(true)
    expect(ouvinte).toHaveBeenCalledTimes(6)
    parar()
  })

  it('na abertura: uma só vez, por mais que o Início monte de novo (o manifesto tem ~650 KB)', async () => {
    await comPacoteSintetico()
    const f = await pacoteMaisNovo()
    usarProcura({ obterFonte: async () => f, armazem })
    expect(novidadeAtual()).toBeNull()
    const [a, b] = await Promise.all([procurarNaAbertura(), procurarNaAbertura()])
    await procurarNaAbertura()
    expect(a).toEqual({ tipo: 'nova', rotulos: ROTULOS })
    expect(b).toBe(a)
    expect(f.manifestos).toBe(1)
    expect(novidadeAtual()).toEqual(a)
  })

  it('a de pedido (tela de Sincronização) procura de novo e atualiza o que o Início vê', async () => {
    await comPacoteSintetico()
    const f = await pacoteMaisNovo()
    usarProcura({ obterFonte: async () => fonteDeTeste(), armazem })
    await procurarNaAbertura()
    expect(novidadeAtual()).toEqual({ tipo: 'em-dia' })
    usarProcura({ obterFonte: async () => f, armazem })
    expect(await procurarAgora()).toEqual({ tipo: 'nova', rotulos: ROTULOS })
    expect(novidadeAtual()).toEqual({ tipo: 'nova', rotulos: ROTULOS })
    // A da abertura não roda de novo.
    await procurarNaAbertura()
    expect(f.manifestos).toBe(1)
  })

  it('depois de baixar o pacote novo (marcarEmDia), uma procura que estava no ar não traz a faixa de volta', async () => {
    await comPacoteSintetico()
    let soltar!: () => void
    const segura = new Promise<void>((ok) => (soltar = ok))
    const f = await pacoteMaisNovo()
    usarProcura({
      obterFonte: async () => {
        await segura
        return f
      },
      armazem,
    })
    const ouvinte = vi.fn()
    const parar = assinarNovidade(ouvinte)
    const procura = procurarNaAbertura()
    marcarEmDia()
    expect(ouvinte).toHaveBeenCalledTimes(1)
    soltar()
    expect(await procura).toEqual({ tipo: 'nova', rotulos: ROTULOS })
    expect(novidadeAtual()).toEqual({ tipo: 'em-dia' })
    expect(ouvinte).toHaveBeenCalledTimes(1)
    parar()
  })
})
