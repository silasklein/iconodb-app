/**
 * A escrita no Dropbox: SÓ sob /usuario/ da pasta do app. O pacote (/nucleo/, /imagens/) é só leitura
 * (fonte.ts) e a Escrita não tem como apagar, mover nem copiar nada.
 *
 * Duas defesas contra perder dados do usuário:
 *  - o caminho é conferido antes de qualquer chamada à rede (normalizarCaminho);
 *  - nunca se sobrescreve às cegas: um envio é "add" sem renomear (um segmento imutável reenviado dá
 *    conflito, que é conferido pelo content_hash do Dropbox: igual = já está lá, ok; diferente = ErroDeConflito),
 *    e a única sobrescrita (estado.json) é condicionada ao rev que o chamador leu.
 *
 * Arquivos grandes (os originais das imagens do usuário) vão por `enviarEmPartes` (upload_session do Dropbox): partes de
 * 4 MB, cada uma com o próprio prazo, a sessão guardada por quem chama (para retomar) e o mesmo "add" sem renomear no fim.
 *
 * Prazos e repetições são os da Fonte (tentativas.ts, prazo.ts). Os envios vão a content.dropboxapi.com
 * (o SDK escolhe o host), já permitido pela CSP.
 */
import { PRAZO_ARQUIVO_MS, PRAZO_CURTO_MS } from './prazo'
import { clienteOuLogin, comTentativas, dormir, resumoDoErro } from './tentativas'
import { cliente } from './auth'

export interface ArquivoDoUsuario {
  /** Relativo à raiz da pasta do app, sem barra inicial: "usuario/estado.json". */
  caminho: string
  rev: string
  tamanho: number
}

export interface OpcoesDeEnvio {
  /**
   * Permite que o envio troque um arquivo que já existe, mas só se ele ainda estiver no `rev` que o
   * chamador leu. `rev: null` quer dizer "não pode existir ainda". Sem esta opção, o envio nunca substitui nada.
   */
  sobrescrever?: { rev: string | null }
}

export interface Escrita {
  /** Envia o arquivo. Reenviar o mesmo conteúdo no mesmo caminho é ok (devolve o rev que já está lá). */
  enviar(caminho: string, bytes: ArrayBuffer | Uint8Array, opcoes?: OpcoesDeEnvio): Promise<{ rev: string }>
  /**
   * Os arquivos sob o prefixo, recursivo por padrão (`recursivo: false` = só os que estão direto nele, sem
   * descer às subpastas); pasta ainda inexistente dá lista vazia.
   */
  listar(prefixo: string, opcoes?: { recursivo?: boolean }): Promise<ArquivoDoUsuario[]>
  baixar(caminho: string): Promise<ArrayBuffer>
  /**
   * Envio em partes (upload_session), para arquivos grandes numa rede lenta: cada parte tem o próprio prazo, e o
   * envio retoma de `sessao` (o que `aoAvancar` entregou da última vez). No fim, o mesmo "add" sem renomear do
   * `enviar`: o mesmo conteúdo já lá = ok (o rev que está lá); outro conteúdo = ErroDeConflito. `aoAvancar(null)`:
   * a sessão acabou (ou venceu e foi recomeçada). Opcional: as Escritas de teste podem não ter.
   */
  enviarEmPartes?(caminho: string, arquivo: Blob, opcoes?: OpcoesDoEnvioEmPartes): Promise<{ rev: string }>
  // Não existe apagar: o app nunca apaga no Dropbox.
}

/** Uma sessão de envio em partes: o id do Dropbox e quantos bytes ele já confirmou. */
export interface SessaoDeEnvio {
  id: string
  offset: number
}

export interface OpcoesDoEnvioEmPartes {
  sessao?: SessaoDeEnvio | null
  /** Depois de cada parte confirmada (para guardar e retomar); null quando a sessão acaba ou é descartada. */
  aoAvancar?: (sessao: SessaoDeEnvio | null) => void | Promise<void>
  /** O tamanho de cada parte (padrão 4 MB). */
  parte?: number
}

/** A sessão de envio não existe mais no Dropbox (vencida, fechada, desconhecida): recomeçar. */
class ErroDeSessaoPerdida extends Error {
  constructor(caminho: string) {
    super(`A sessão de envio de ${caminho} não existe mais`)
    this.name = 'ErroDeSessaoPerdida'
  }
}

/** O caminho não está estritamente sob usuario/ (ou tem algo que poderia escapar dele). */
export class ErroDeCaminho extends Error {
  constructor(readonly caminho: unknown) {
    super(`Caminho recusado: só se escreve em usuario/ (${String(caminho).slice(0, 80)})`)
    this.name = 'ErroDeCaminho'
  }
}

/** O arquivo já existe com outro conteúdo (ou com outro rev que o esperado): nada foi sobrescrito. */
export class ErroDeConflito extends Error {
  constructor(readonly caminho: string) {
    super(`O arquivo ${caminho} já existe no Dropbox com outro conteúdo`)
    this.name = 'ErroDeConflito'
  }
}

/** O arquivo passa do limite de um envio simples (150 MB). Um RangeError com nome próprio: outros RangeError (falta de memória) não são isto. */
export class ErroDeLimiteDoEnvio extends RangeError {
  constructor(readonly caminho: string) {
    super(`O arquivo ${caminho} passa de 150 MB, o limite de um envio simples`)
    this.name = 'ErroDeLimiteDoEnvio'
  }
}

/** O arquivo pedido não existe em usuario/. */
export class ErroDeArquivoAusente extends Error {
  constructor(readonly caminho: string) {
    super(`O arquivo ${caminho} não está no Dropbox`)
    this.name = 'ErroDeArquivoAusente'
  }
}

const RAIZ = 'usuario'
/** Cada trecho do caminho: só letras ASCII, dígitos, ponto, hífen e sublinhado (ids, "IM-ab12cd34-1", "000001.jsonl"). */
const TRECHO = /^[A-Za-z0-9._-]+$/
const TAMANHO_MAXIMO_DO_CAMINHO = 300
/** O envio simples do Dropbox vai até 150 MB (acima disso exigiria sessão de envio). */
const LIMITE_DO_ENVIO = 150 * 1024 * 1024

/**
 * Confere que o caminho está estritamente sob `usuario/` e devolve-o. Recusa, sem tentar "consertar":
 * barra inicial ou final, `//`, `.` e `..`, contra-barra, escapes `%xx` (como %2e), caracteres de controle,
 * qualquer coisa fora de [A-Za-z0-9._-] (inclusive maiúsculas em `usuario`, que o Dropbox trataria como a
 * mesma pasta), trechos que terminam em ponto, e o próprio `usuario` (falta o arquivo).
 */
export function normalizarCaminho(caminho: string): string {
  if (typeof caminho !== 'string' || caminho.length > TAMANHO_MAXIMO_DO_CAMINHO) throw new ErroDeCaminho(caminho)
  const trechos = caminho.split('/')
  if (trechos.length < 2 || trechos[0] !== RAIZ) throw new ErroDeCaminho(caminho)
  for (const t of trechos) {
    if (!TRECHO.test(t) || /^\.+$/.test(t) || t.endsWith('.')) throw new ErroDeCaminho(caminho)
  }
  return caminho
}

/** Prefixo de listagem: `usuario`, `usuario/` ou uma subpasta válida. */
function normalizarPrefixo(prefixo: string): string {
  if (prefixo === RAIZ || prefixo === `${RAIZ}/`) return RAIZ
  return normalizarCaminho(prefixo)
}

const BLOCO = 4 * 1024 * 1024

const etiqueta = (x: unknown) => Object.prototype.toString.call(x)

/**
 * Os bytes de um ArrayBuffer ou de um Uint8Array, de qualquer realm (o jsdom dos testes tem outro `ArrayBuffer`: nada de
 * `instanceof`). Qualquer outra coisa (Uint16Array, DataView, um objeto com `byteLength`) é TypeError: os elementos dela não
 * são bytes, e o hash sairia de outro conteúdo (A-4 da Tarefa 17).
 */
function comoBytes(x: unknown): Uint8Array {
  if (etiqueta(x) === '[object ArrayBuffer]') return new Uint8Array(x as ArrayBuffer)
  if (ArrayBuffer.isView(x) && etiqueta(x) === '[object Uint8Array]') {
    if (x instanceof Uint8Array) return x
    const v = x as ArrayBufferView
    return new Uint8Array(v.buffer as ArrayBuffer, v.byteOffset, v.byteLength)
  }
  throw new TypeError('O conteúdo a enviar deve ser ArrayBuffer ou Uint8Array')
}

/**
 * O content_hash do Dropbox: SHA-256 de cada bloco de 4 MB, os resumos concatenados e um SHA-256 do todo (hex).
 * https://www.dropbox.com/developers/reference/content-hash
 */
export async function hashDeConteudo(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const dados = comoBytes(bytes)
  const blocos = Math.ceil(dados.byteLength / BLOCO)
  const resumos = new Uint8Array(blocos * 32)
  for (let i = 0; i < blocos; i++) {
    const bloco = dados.subarray(i * BLOCO, Math.min((i + 1) * BLOCO, dados.byteLength))
    resumos.set(new Uint8Array(await crypto.subtle.digest('SHA-256', bloco as Uint8Array<ArrayBuffer>)), i * 32)
  }
  const final = new Uint8Array(await crypto.subtle.digest('SHA-256', resumos))
  return Array.from(final, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * O content_hash de um Blob (um File do OPFS, por exemplo), lendo um bloco de 4 MB por vez: um original de 48 MP
 * não precisa estar inteiro na memória para ser conferido.
 */
export async function hashDeBlob(blob: Blob): Promise<string> {
  const blocos = Math.max(1, Math.ceil(blob.size / BLOCO))
  const resumos = new Uint8Array(blocos * 32)
  for (let i = 0; i < blocos; i++) {
    const bloco = await blob.slice(i * BLOCO, Math.min((i + 1) * BLOCO, blob.size)).arrayBuffer()
    resumos.set(new Uint8Array(await crypto.subtle.digest('SHA-256', bloco)), i * 32)
  }
  const final = new Uint8Array(await crypto.subtle.digest('SHA-256', blob.size === 0 ? new Uint8Array(0) : resumos))
  return Array.from(final, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** O offset que o Dropbox diz ter (incorrect_offset, no append ou dentro de lookup_failed no finish), ou null. */
function offsetCerto(erro: unknown): number | null {
  const e = (erro as { status?: unknown; error?: { error?: Record<string, unknown> } } | null)
  if (e?.status !== 409) return null
  const interno = e.error?.error
  const lookup = (interno?.['.tag'] === 'lookup_failed' ? interno.lookup_failed : interno) as { '.tag'?: unknown; correct_offset?: unknown } | undefined
  return lookup?.['.tag'] === 'incorrect_offset' && typeof lookup.correct_offset === 'number' ? lookup.correct_offset : null
}

/** A sessão fechou, venceu ou sumiu (lookup_failed/closed, not_found…): recomeçar do zero. */
const eSessaoPerdida = (erro: unknown) =>
  erro instanceof ErroDeSessaoPerdida || ((erro as { status?: unknown } | null)?.status === 409 && /(^|\/)(closed|not_found|not_closed|too_large)(\/|$)/.test(resumoDoErro(erro) ?? ''))

const PARTE = 4 * 1024 * 1024
/** Prazo de cada parte do envio em partes: 4 MB a ~300 kbit/s ainda cabem. */
export const PRAZO_PARTE_MS = 120_000

const eConflitoDeCaminho = (erro: unknown) =>
  (erro as { status?: unknown } | null)?.status === 409 && /^path\/conflict/.test(resumoDoErro(erro) ?? '')

const prazoDo = (caminho: string) => (/\.jsonl?$/.test(caminho) ? PRAZO_CURTO_MS : PRAZO_ARQUIVO_MS)

export interface OpcoesDaEscrita {
  /** Espera entre tentativas (para os testes). */
  esperar?: (ms: number) => Promise<void>
}

const ESCOPO_ESCRITA = 'files.content.write'
const ESCOPO_METADADOS = 'files.metadata.read'
const ESCOPO_LEITURA = 'files.content.read'

/** A Escrita do Dropbox; null se não há login (ou ele expirou). */
export async function escritaDropbox(opcoes: OpcoesDaEscrita = {}): Promise<Escrita | null> {
  if (!(await cliente())) return null
  const esperar = opcoes.esperar ?? dormir
  const ausente = (c: string) => new ErroDeArquivoAusente(c)

  /** Os metadados do que está no Dropbox, ou null se não existe. */
  async function metadados(caminho: string) {
    try {
      return await comTentativas(
        async () => {
          const c = await clienteOuLogin(PRAZO_CURTO_MS)
          return (await c.filesGetMetadata({ path: `/${caminho}` })).result as { '.tag': string; rev?: string; content_hash?: string }
        },
        esperar,
        { caminho, aoNaoEncontrar: ausente, escopoPadrao: ESCOPO_METADADOS },
      )
    } catch (erro) {
      if (erro instanceof ErroDeArquivoAusente) return null
      throw erro
    }
  }

  return {
    async enviar(caminhoBruto, bytes, { sobrescrever } = {}) {
      const caminho = normalizarCaminho(caminhoBruto)
      comoBytes(bytes) // só ArrayBuffer ou Uint8Array (TypeError antes de qualquer rede)
      if (bytes.byteLength > LIMITE_DO_ENVIO) throw new ErroDeLimiteDoEnvio(caminho)
      const modo =
        sobrescrever && sobrescrever.rev !== null
          ? { '.tag': 'update' as const, update: sobrescrever.rev }
          : { '.tag': 'add' as const }

      for (let rodada = 0; rodada < 3; rodada++) {
        try {
          const r = await comTentativas(
            async () => {
              const c = await clienteOuLogin(prazoDo(caminho))
              return c.filesUpload({ path: `/${caminho}`, contents: bytes, mode: modo, autorename: false, mute: true })
            },
            esperar,
            { caminho, aoNaoEncontrar: ausente, escopoPadrao: ESCOPO_ESCRITA },
          )
          return { rev: r.result.rev }
        } catch (erro) {
          if (!eConflitoDeCaminho(erro)) throw erro
          // Já há algo nesse caminho. Se é exatamente o que íamos enviar (um envio anterior que chegou mas
          // perdeu a resposta, ou outro aparelho com o mesmo segmento), está feito. Senão, nada é sobrescrito.
          const existente = await metadados(caminho)
          if (existente === null) continue // sumiu entre o envio e a conferência: tenta de novo
          if (existente['.tag'] === 'file' && existente.rev && existente.content_hash === (await hashDeConteudo(bytes))) {
            return { rev: existente.rev }
          }
          throw new ErroDeConflito(caminho)
        }
      }
      throw new ErroDeConflito(caminho)
    },

    async enviarEmPartes(caminhoBruto, arquivo, { sessao = null, aoAvancar, parte = PARTE } = {}) {
      const caminho = normalizarCaminho(caminhoBruto)
      const total = arquivo.size
      const pedaco = async (de: number) => new Uint8Array(await arquivo.slice(de, Math.min(de + parte, total)).arrayBuffer())
      // Cada chamada com o próprio prazo (um cliente por chamada): uma parte lenta não leva as outras junto.
      const chamar = <T>(fazer: (c: Awaited<ReturnType<typeof clienteOuLogin>>) => Promise<T>) =>
        comTentativas(async () => fazer(await clienteOuLogin(PRAZO_PARTE_MS)), esperar, {
          caminho,
          aoNaoEncontrar: () => new ErroDeSessaoPerdida(caminho),
          escopoPadrao: ESCOPO_ESCRITA,
        })
      /** O arquivo já está lá com este conteúdo? (um finish que chegou e perdeu a resposta) */
      const jaEsta = async (): Promise<string | null> => {
        const existente = await metadados(caminho)
        return existente?.['.tag'] === 'file' && existente.rev && existente.content_hash === (await hashDeBlob(arquivo)) ? existente.rev : null
      }
      let atual: SessaoDeEnvio | null = sessao && sessao.offset > 0 && sessao.offset <= total ? { id: sessao.id, offset: sessao.offset } : null
      for (let recomecos = 0; recomecos < 3; recomecos++) {
        try {
          if (!atual) {
            const p = await pedaco(0)
            const r = await chamar((c) => c.filesUploadSessionStart({ close: false, contents: p }))
            atual = { id: r.result.session_id, offset: p.byteLength }
            await aoAvancar?.(atual)
          }
          while (atual.offset < total) {
            const p = await pedaco(atual.offset)
            const cursor = { session_id: atual.id, offset: atual.offset }
            try {
              await chamar((c) => c.filesUploadSessionAppendV2({ cursor, close: false, contents: p }))
              atual = { id: atual.id, offset: atual.offset + p.byteLength }
            } catch (erro) {
              // A parte (ou uma anterior) chegou e a resposta se perdeu: segue de onde o Dropbox diz estar.
              const certo = offsetCerto(erro)
              if (certo === null || certo > total) throw erro
              atual = { id: atual.id, offset: certo }
            }
            await aoAvancar?.(atual)
          }
          try {
            const cursor = { session_id: atual.id, offset: total }
            const r = await chamar((c) =>
              c.filesUploadSessionFinish({ cursor, commit: { path: `/${caminho}`, mode: { '.tag': 'add' }, autorename: false, mute: true }, contents: new Uint8Array(0) }),
            )
            await aoAvancar?.(null)
            return { rev: r.result.rev }
          } catch (erro) {
            if (eConflitoDeCaminho(erro)) {
              const rev = await jaEsta()
              if (rev) {
                await aoAvancar?.(null)
                return { rev }
              }
              throw new ErroDeConflito(caminho)
            }
            const certo = offsetCerto(erro)
            if (certo !== null && certo < total) {
              atual = { id: atual.id, offset: certo }
              recomecos-- // não é recomeço: só faltavam bytes
              continue
            }
            if (eSessaoPerdida(erro)) {
              // O finish chegou e a resposta se perdeu (a sessão já fechou)? Então o arquivo está lá.
              const rev = await jaEsta()
              if (rev) {
                await aoAvancar?.(null)
                return { rev }
              }
            }
            throw erro
          }
        } catch (erro) {
          if (!eSessaoPerdida(erro)) throw erro
          atual = null
          await aoAvancar?.(null)
        }
      }
      throw new ErroDeSessaoPerdida(caminho)
    },

    async listar(prefixoBruto, { recursivo = true } = {}) {
      const prefixo = normalizarPrefixo(prefixoBruto)
      const achados: ArquivoDoUsuario[] = []
      try {
        await comTentativas(
          async () => {
            achados.length = 0
            const c = await clienteOuLogin(PRAZO_CURTO_MS)
            let r = await c.filesListFolder({ path: `/${prefixo}`, recursive: recursivo })
            for (;;) {
              for (const e of r.result.entries) {
                if (e['.tag'] === 'file' && e.path_display) achados.push({ caminho: e.path_display.slice(1), rev: e.rev, tamanho: e.size })
              }
              if (!r.result.has_more) break
              r = await c.filesListFolderContinue({ cursor: r.result.cursor })
            }
          },
          esperar,
          { caminho: prefixo, aoNaoEncontrar: ausente, escopoPadrao: ESCOPO_METADADOS },
        )
      } catch (erro) {
        if (erro instanceof ErroDeArquivoAusente) return [] // primeiro uso: usuario/ ainda não existe
        throw erro
      }
      return achados.sort((a, b) => (a.caminho < b.caminho ? -1 : a.caminho > b.caminho ? 1 : 0))
    },

    async baixar(caminhoBruto) {
      const caminho = normalizarCaminho(caminhoBruto)
      return comTentativas(
        async () => {
          const c = await clienteOuLogin(prazoDo(caminho))
          const r = await c.filesDownload({ path: `/${caminho}` })
          return (r.result as unknown as { fileBlob: Blob }).fileBlob.arrayBuffer()
        },
        esperar,
        { caminho, aoNaoEncontrar: ausente, escopoPadrao: ESCOPO_LEITURA },
      )
    },
  }
}
