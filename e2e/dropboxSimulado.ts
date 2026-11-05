/**
 * O Dropbox simulado dos testes e2e. Nada sai para a internet:
 * - a página de autorização (dropbox.com/oauth2/authorize) redireciona direto de volta ao app,
 *   com `?code=…&state=…` (o state vem da própria URL de autorização);
 * - o endpoint de token (api.dropboxapi.com/oauth2/token) devolve um token de teste, se o código e o
 *   code_verifier vierem no corpo (form-urlencoded) e a URL não tiver query;
 * - o download (content.dropboxapi.com/2/files/download) serve os arquivos do pacote sintético
 *   (tests/fixtures/pacote), com o cabeçalho `Dropbox-API-Result`;
 * - a listagem de usuario/ (api.dropboxapi.com/2/files/list_folder) responde que a pasta não existe;
 * - o envio (content.dropboxapi.com/2/files/upload) de um arquivo em usuario/, no modo "add" que o app usa: guarda o
 *   conteúdo na memória do teste (`enviados`), devolve um rev e, para o mesmo caminho com outro conteúdo, o conflito
 *   do Dropbox; e, sobre o que foi enviado, o get_metadata (com o content_hash) e o download, que o app usa para
 *   resolver esse conflito. É o mínimo para o app sincronizar o que se escreve pela tela; a e2e de dois aparelhos
 *   (Tarefa 17) vai além.
 *
 * - o envio em partes (content.dropboxapi.com/2/files/upload_session/start, append_v2, finish), que o app usa para
 *   originais grandes de imagens (Tarefa 8): a sessão guarda as partes; append_v2 com o offset errado responde o 409
 *   `incorrect_offset` com o `correct_offset`, sessão desconhecida o 409 `not_found`; o finish confere o offset (dentro
 *   de `lookup_failed`), aceita só o modo "add" sem renomear e, para o mesmo caminho com outro conteúdo, devolve o
 *   conflito do Dropbox (o mesmo do envio simples). Contagem em `sessoes`.
 *
 * - com `usuarioReal = true` (o teste liga; Tarefa 9), a pasta usuario/ se comporta como no Dropbox: `list_folder` lista o
 *   que foi enviado (recursivo ou não, em páginas de `porPagina` entradas com `list_folder/continue`, com o rev e o
 *   content_hash) e o `files/upload` aceita o modo `update` com o rev atual (senão, o conflito). Cada escrita ganha um rev
 *   novo (como no Dropbox: dois conteúdos iguais gravados em momentos diferentes têm revs diferentes); reenviar o mesmo
 *   conteúdo no modo "add" devolve o rev que já estava lá. É o que a consolidação do estado.json (onde os números SKC se
 *   confirmam) precisa.
 * - Sem `usuarioReal`, `list_folder` responde que usuario/ não existe e o modo `update` é recusado (vai para `proibidos`).
 * - DOIS APARELHOS (Tarefa 17): `ligarDropboxSimulado(contexto, { compartilhado, quem })` liga outro contexto do navegador ao
 *   MESMO Dropbox simulado (os mesmos arquivos, revs e listagens); `quem` diz qual aparelho fez cada pedido aos ganchos.
 *   `e2e/dois-aparelhos.spec.ts` liga `usuarioReal` e cobre a listagem do próprio segmento, os segmentos do outro aparelho, a
 *   consolidação do estado.json com `update` + rev, dois aparelhos consolidando ao mesmo tempo (o 409 e a releitura) e a rede
 *   que cai no meio de um envio.
 * - `aoEnviar` (gancho do teste): chamado antes de cada `files/upload`; pode segurar o envio (devolvendo uma promessa) ou
 *   cortá-lo: 'cortar-antes' (o arquivo não chega) ou 'cortar-depois' (o arquivo chega e a resposta se perde).
 * - `escopos`: as permissões do token (padrão: as três). Um pedido que precise de uma que falta recebe o 401
 *   `missing_scope` do Dropbox, com o `required_scope`.
 * - `pacoteTrocado` (revisão 3 da Tarefa 16): um teste pode servir outro arquivo do pacote (com o manifesto ajustado).
 * - A listagem traz as pastas junto com os arquivos (`.tag: folder`, contadas em `pastasListadas`), como o Dropbox.
 * - Diferenças conhecidas do Dropbox de verdade, sem efeito nos cenários de hoje (revisão 1 da Tarefa 17a, m1):
 *   - `update` sobre um arquivo que não existe dá conflito; o Dropbox (não estrito) grava. O app chega ao mesmo fim
 *     pelo caminho do 409;
 *   - o `id` muda a cada rev; no Dropbox ele é estável (o app não usa o `id`);
 *   - o `error_summary` do `missing_scope` traz o escopo no meio; o do Dropbox é `missing_scope/..` (o app lê o `.tag`);
 *   - o `Dropbox-API-Result` do download não tem `rev` nem `content_hash` (o app não os usa).
 * Qualquer outro pedido a um servidor que não seja o local derruba o teste.
 */
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import type { BrowserContext, Route } from '@playwright/test'
import { enderecoPublicado } from '../src/app/endereco.ts'

const RAIZ_DO_PACOTE = join(import.meta.dirname, '..', 'tests', 'fixtures', 'pacote')
const CODIGO = 'codigo-de-teste'
/** O redirect que o build pede ao Dropbox: o endereço publicado (VITE_ENDERECO ou o padrão). */
const REDIRECT = enderecoPublicado(process.env.VITE_ENDERECO)

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-expose-headers': 'Dropbox-API-Result',
}

export interface DropboxSimulado {
  /** Caminhos baixados (um por pedido de download). */
  baixados: string[]
  /** Pedidos a servidores de fora que não são o Dropbox simulado (têm de ficar vazios). */
  proibidos: string[]
  /** Quantas vezes a página de autorização foi aberta. */
  autorizacoes: number
  /** O que o app enviou a usuario/: caminho (sem a barra do início) → conteúdo. */
  enviados: Map<string, Buffer>
  /** Envios em partes: sessões começadas, partes acrescentadas, sessões concluídas. */
  sessoes: { iniciadas: number; partes: number; concluidas: number; abertas: Map<string, Buffer> }
  /** usuario/ como no Dropbox de verdade: listagem do que foi enviado e o modo `update` (Tarefa 9). */
  usuarioReal: boolean
  /** Arquivos do pacote trocados pelo teste (caminho → conteúdo), servidos no lugar dos de tests/fixtures/pacote. */
  pacoteTrocado: Map<string, Buffer>
  /** O rev atual de cada arquivo de usuario/ (um novo a cada escrita). */
  revs: Map<string, string>
  /** Quantas entradas cabem numa página de `list_folder` (o resto vem por `list_folder/continue`). */
  porPagina: number
  /** As permissões que o token tem (o Dropbox responde 401 missing_scope ao que pede outra). */
  escopos: string[]
  /** Gancho do teste antes de cada `files/upload` (veja o comentário do arquivo). */
  aoEnviar: ((pedido: { quem: string; caminho: string; modo: string }) => Promise<AcaoDoEnvio> | AcaoDoEnvio) | null
  /** Pedidos de escrita em usuario/ (`files/upload` e o fim do envio em partes), por aparelho e caminho, na ordem. */
  escritas: { quem: string; caminho: string; modo: string; resultado: 'ok' | 'conflito' | 'cortado' }[]
  /** Downloads de usuario/, por aparelho e caminho, na ordem. */
  leituras: { quem: string; caminho: string }[]
  /** Quantas páginas seguintes de listagem foram pedidas (`list_folder/continue`). */
  continuacoes: number
  /** Quantas entradas de pasta (`.tag: folder`) as listagens devolveram (o app tem de ignorá-las). */
  pastasListadas: number
  /** Todos os pedidos que chegaram ao simulado, por aparelho (`quem`): sem internet, não pode chegar nenhum. */
  pedidos: Map<string, number>
  /** Interno: o contador dos revs e as páginas que faltam de cada listagem. */
  _revs: number
  _cursores: Map<string, unknown[]>
}

/** O que o gancho `aoEnviar` pede: seguir (undefined), cortar antes de gravar ou cortar a resposta depois de gravar. */
export type AcaoDoEnvio = 'cortar-antes' | 'cortar-depois' | undefined

export const TODOS_OS_ESCOPOS = ['files.content.read', 'files.content.write', 'files.metadata.read']

const BLOCO = 4 * 1024 * 1024
/** O content_hash do Dropbox (https://www.dropbox.com/developers/reference/content-hash). */
function hashDoDropbox(bytes: Buffer): string {
  const resumos: Buffer[] = []
  for (let i = 0; i < bytes.length; i += BLOCO) resumos.push(createHash('sha256').update(bytes.subarray(i, i + BLOCO)).digest())
  return createHash('sha256').update(Buffer.concat(resumos)).digest('hex')
}
const revDe = (bytes: Buffer) => `0${hashDoDropbox(bytes).slice(0, 12)}`

const ehLocal = (url: URL) => url.hostname === 'localhost' || url.hostname === '127.0.0.1'

function lerDoPacote(caminho: string): Buffer | null {
  const absoluto = normalize(join(RAIZ_DO_PACOTE, caminho))
  if (!absoluto.startsWith(RAIZ_DO_PACOTE + sep)) return null
  try {
    if (!statSync(absoluto).isFile()) return null
    return readFileSync(absoluto)
  } catch {
    return null
  }
}

/** Grava um arquivo de usuario/ e lhe dá um rev novo (o mesmo conteúdo já lá: o mesmo rev). */
function gravar(estado: DropboxSimulado, caminho: string, bytes: Buffer): void {
  const ja = estado.enviados.get(caminho)
  estado.enviados.set(caminho, bytes)
  if (ja?.equals(bytes) && estado.revs.has(caminho)) return
  estado.revs.set(caminho, `0${(++estado._revs).toString(16).padStart(9, '0')}`)
}
const revAtual = (estado: DropboxSimulado, caminho: string, bytes: Buffer) => estado.revs.get(caminho) ?? revDe(bytes)

/** O 401 do Dropbox quando o token não tem a permissão; null se tem. */
function semEscopo(route: Route, estado: DropboxSimulado, escopo: string): Promise<void> | null {
  if (estado.escopos.includes(escopo)) return null
  return route.fulfill({
    status: 401,
    headers: { ...CORS, 'content-type': 'application/json' },
    body: JSON.stringify({ error_summary: `missing_scope/${escopo}/..`, error: { '.tag': 'missing_scope', required_scope: escopo } }),
  })
}

function metadadosDePasta(caminho: string): Record<string, unknown> {
  return { '.tag': 'folder', name: caminho.split('/').pop(), path_display: `/${caminho}`, path_lower: `/${caminho.toLowerCase()}`, id: `id:pasta-${caminho}` }
}

function metadadosDe(caminho: string, bytes: Buffer, rev: string = revDe(bytes)) {
  return {
    '.tag': 'file',
    name: caminho.split('/').pop(),
    path_display: `/${caminho}`,
    path_lower: `/${caminho.toLowerCase()}`,
    id: `id:${rev}`,
    rev,
    size: bytes.length,
    is_downloadable: true,
    content_hash: hashDoDropbox(bytes),
  }
}

async function responder(route: Route, estado: DropboxSimulado, quem: string): Promise<void> {
  const pedido = route.request()
  const url = new URL(pedido.url())
  estado.pedidos.set(quem, (estado.pedidos.get(quem) ?? 0) + 1)

  if (pedido.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })

  if ((url.hostname === 'www.dropbox.com' || url.hostname === 'dropbox.com') && url.pathname === '/oauth2/authorize') {
    estado.autorizacoes++
    // O app tem de pedir PKCE com o redirect registrado no Dropbox.
    const p = url.searchParams
    const ok = p.get('client_id') === 'erkchv20ri1l2at' && p.get('code_challenge_method') === 'S256' && p.get('redirect_uri') === REDIRECT
    if (!ok) {
      estado.proibidos.push(`autorização com parâmetros errados: ${url.search}`)
      return route.fulfill({ status: 400, body: 'parâmetros errados' })
    }
    // Em vez de voltar ao endereço publicado, volta ao app servido localmente (a origem do teste).
    const volta = new URL(pedido.frame().url())
    volta.search = ''
    volta.hash = ''
    volta.searchParams.set('code', CODIGO)
    volta.searchParams.set('state', p.get('state') ?? '')
    return route.fulfill({ status: 302, headers: { location: volta.toString() }, body: '' })
  }

  if (url.hostname === 'api.dropboxapi.com' && url.pathname === '/oauth2/token') {
    // Os segredos (code, code_verifier, refresh_token) vão no corpo form-urlencoded, nunca na URL.
    const corpo = new URLSearchParams(pedido.postData() ?? '')
    const tipo = pedido.headers()['content-type'] ?? ''
    if (url.search !== '' || !tipo.startsWith('application/x-www-form-urlencoded') || corpo.get('code') !== CODIGO || !corpo.get('code_verifier')) {
      estado.proibidos.push(`token pedido fora do formato (query ${JSON.stringify(url.search)}, tipo ${tipo})`)
      return route.fulfill({ status: 400, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ error: 'invalid_request' }) })
    }
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: 'acesso-de-teste', refresh_token: 'renovacao-de-teste', token_type: 'bearer', expires_in: 14400, scope: estado.escopos.join(' ') }),
    })
  }

  if (url.hostname === 'content.dropboxapi.com' && url.pathname === '/2/files/download') {
    const recusa = semEscopo(route, estado, 'files.content.read')
    if (recusa) return recusa
    const arg = JSON.parse(pedido.headers()['dropbox-api-arg'] ?? '{}') as { path?: string }
    const caminho = (arg.path ?? '').replace(/^\//, '')
    const bytes = caminho.startsWith('usuario/') ? (estado.enviados.get(caminho) ?? null) : (estado.pacoteTrocado.get(caminho) ?? lerDoPacote(caminho))
    if (!bytes) return route.fulfill({ status: 409, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ error_summary: 'path/not_found/..' }) })
    estado.baixados.push(caminho)
    if (caminho.startsWith('usuario/')) estado.leituras.push({ quem, caminho })
    return route.fulfill({
      status: 200,
      headers: {
        ...CORS,
        'content-type': 'application/octet-stream',
        'dropbox-api-result': JSON.stringify({ name: caminho.split('/').pop(), path_display: `/${caminho}`, size: bytes.length }),
      },
      body: bytes,
    })
  }

  // O envio de um arquivo em usuario/: "add" (nunca sobrescreve; o mesmo conteúdo no mesmo caminho é ok) ou, com
  // `usuarioReal`, "update" com o rev atual (o estado.json, o nome do aparelho).
  if (url.hostname === 'content.dropboxapi.com' && url.pathname === '/2/files/upload') {
    const recusa = semEscopo(route, estado, 'files.content.write')
    if (recusa) return recusa
    const argumento = JSON.parse(pedido.headers()['dropbox-api-arg'] ?? '{}') as { path?: string; mode?: unknown }
    const caminho = (argumento.path ?? '').replace(/^\//, '')
    const corpo = pedido.postDataBuffer() ?? Buffer.alloc(0)
    const json = { ...CORS, 'content-type': 'application/json' }
    const modo = argumento.mode as { '.tag'?: string; update?: string } | string | undefined
    const tag = typeof modo === 'string' ? modo : (modo?.['.tag'] ?? 'add')
    const conflito = () => {
      estado.escritas.push({ quem, caminho, modo: tag, resultado: 'conflito' })
      return route.fulfill({ status: 409, headers: json, body: JSON.stringify({ error_summary: 'path/conflict/file/..', error: { '.tag': 'path', reason: { '.tag': 'conflict', conflict: { '.tag': 'file' } } } }) })
    }
    const atualizar = estado.usuarioReal && caminho.startsWith('usuario/') && tag === 'update'
    if (!atualizar && (!caminho.startsWith('usuario/') || tag !== 'add')) {
      estado.proibidos.push(`envio fora do combinado: ${caminho} (${JSON.stringify(argumento.mode)})`)
      return route.fulfill({ status: 400, headers: json, body: JSON.stringify({ error_summary: 'envio fora do combinado' }) })
    }
    const acao = estado.aoEnviar ? await estado.aoEnviar({ quem, caminho, modo: tag }) : undefined
    if (acao === 'cortar-antes') {
      estado.escritas.push({ quem, caminho, modo: tag, resultado: 'cortado' })
      return route.abort('connectionreset')
    }
    const atual = estado.enviados.get(caminho)
    if (atualizar) {
      if (!atual || revAtual(estado, caminho, atual) !== (modo as { update?: string }).update) return conflito()
    } else if (atual && !atual.equals(corpo)) return conflito()
    gravar(estado, caminho, corpo)
    if (acao === 'cortar-depois') {
      estado.escritas.push({ quem, caminho, modo: tag, resultado: 'cortado' })
      return route.abort('connectionreset')
    }
    estado.escritas.push({ quem, caminho, modo: tag, resultado: 'ok' })
    return route.fulfill({ status: 200, headers: json, body: JSON.stringify(metadadosDe(caminho, corpo, revAtual(estado, caminho, corpo))) })
  }

  // O envio em partes (upload_session): start, append_v2, finish.
  if (url.hostname === 'content.dropboxapi.com' && url.pathname.startsWith('/2/files/upload_session/')) {
    const recusa = semEscopo(route, estado, 'files.content.write')
    if (recusa) return recusa
    const argumento = JSON.parse(pedido.headers()['dropbox-api-arg'] ?? '{}') as {
      cursor?: { session_id?: string; offset?: number }
      close?: boolean
      commit?: { path?: string; mode?: unknown; autorename?: boolean }
    }
    const corpo = pedido.postDataBuffer() ?? Buffer.alloc(0)
    const json = { ...CORS, 'content-type': 'application/json' }
    const s = estado.sessoes
    const erro409 = (resumo: string, erro: unknown) => route.fulfill({ status: 409, headers: json, body: JSON.stringify({ error_summary: resumo, error: erro }) })
    if (url.pathname === '/2/files/upload_session/start') {
      const id = `sessao-${++s.iniciadas}`
      s.abertas.set(id, Buffer.from(corpo))
      return route.fulfill({ status: 200, headers: json, body: JSON.stringify({ session_id: id }) })
    }
    const id = argumento.cursor?.session_id ?? ''
    const atual = s.abertas.get(id)
    if (url.pathname === '/2/files/upload_session/append_v2') {
      if (!atual) return erro409('not_found/..', { '.tag': 'not_found' })
      if (argumento.cursor?.offset !== atual.length) return erro409('incorrect_offset/..', { '.tag': 'incorrect_offset', correct_offset: atual.length })
      s.abertas.set(id, Buffer.concat([atual, corpo]))
      s.partes++
      return route.fulfill({ status: 200, headers: json, body: 'null' })
    }
    if (url.pathname === '/2/files/upload_session/finish') {
      if (!atual) return erro409('lookup_failed/not_found/..', { '.tag': 'lookup_failed', lookup_failed: { '.tag': 'not_found' } })
      const dados = Buffer.concat([atual, corpo])
      if (argumento.cursor?.offset !== dados.length - corpo.length) {
        return erro409('lookup_failed/incorrect_offset/..', { '.tag': 'lookup_failed', lookup_failed: { '.tag': 'incorrect_offset', correct_offset: atual.length } })
      }
      const caminho = (argumento.commit?.path ?? '').replace(/^\//, '')
      const modo = argumento.commit?.mode
      const tag = typeof modo === 'string' ? modo : (modo as { '.tag'?: string } | undefined)?.['.tag']
      if (!caminho.startsWith('usuario/') || tag !== 'add' || argumento.commit?.autorename !== false) {
        estado.proibidos.push(`envio em partes fora do combinado: ${caminho} (${JSON.stringify(modo)})`)
        return route.fulfill({ status: 400, headers: json, body: JSON.stringify({ error_summary: 'envio fora do combinado' }) })
      }
      const ja = estado.enviados.get(caminho)
      if (ja && !ja.equals(dados)) return erro409('path/conflict/file/..', { '.tag': 'path', path: { '.tag': 'conflict', conflict: { '.tag': 'file' } } })
      s.abertas.delete(id)
      gravar(estado, caminho, dados)
      s.concluidas++
      estado.escritas.push({ quem, caminho, modo: 'add', resultado: 'ok' })
      return route.fulfill({ status: 200, headers: json, body: JSON.stringify(metadadosDe(caminho, dados, revAtual(estado, caminho, dados))) })
    }
  }

  // Os metadados de um arquivo enviado (o app compara o content_hash para saber se um conflito é o mesmo conteúdo).
  if (url.hostname === 'api.dropboxapi.com' && url.pathname === '/2/files/get_metadata') {
    const recusa = semEscopo(route, estado, 'files.metadata.read')
    if (recusa) return recusa
    const corpo = JSON.parse(pedido.postData() ?? '{}') as { path?: string }
    const caminho = (corpo.path ?? '').replace(/^\//, '')
    const bytes = estado.enviados.get(caminho)
    const json = { ...CORS, 'content-type': 'application/json' }
    if (!bytes) return route.fulfill({ status: 409, headers: json, body: JSON.stringify({ error_summary: 'path/not_found/..', error: { '.tag': 'path', path: { '.tag': 'not_found' } } }) })
    return route.fulfill({ status: 200, headers: json, body: JSON.stringify(metadadosDe(caminho, bytes, revAtual(estado, caminho, bytes))) })
  }

  // A listagem de usuario/. Sem `usuarioReal`, a pasta ainda não existe (a sincronização só a lista e não acha nada).
  // Com ele, o que foi enviado, em páginas de `porPagina` (o resto por list_folder/continue, com o cursor da página).
  if (url.hostname === 'api.dropboxapi.com' && (url.pathname === '/2/files/list_folder' || url.pathname === '/2/files/list_folder/continue')) {
    const recusa = semEscopo(route, estado, 'files.metadata.read')
    if (recusa) return recusa
    const json = { ...CORS, 'content-type': 'application/json' }
    const pagina = (entradas: unknown[]) => {
      const agora = entradas.slice(0, Math.max(1, estado.porPagina))
      const resto = entradas.slice(agora.length)
      const cursor = resto.length ? `cursor-${estado._cursores.size + 1}-${Math.random().toString(36).slice(2, 8)}` : 'fim'
      if (resto.length) estado._cursores.set(cursor, resto)
      return route.fulfill({ status: 200, headers: json, body: JSON.stringify({ entries: agora, cursor, has_more: resto.length > 0 }) })
    }
    if (url.pathname === '/2/files/list_folder/continue') {
      const corpo = JSON.parse(pedido.postData() ?? '{}') as { cursor?: string }
      const resto = estado._cursores.get(corpo.cursor ?? '')
      if (!resto) return route.fulfill({ status: 409, headers: json, body: JSON.stringify({ error_summary: 'reset/..', error: { '.tag': 'reset' } }) })
      estado._cursores.delete(corpo.cursor!)
      estado.continuacoes++
      return pagina(resto)
    }
    const corpo = JSON.parse(pedido.postData() ?? '{}') as { path?: string; recursive?: boolean }
    if (estado.usuarioReal && (corpo.path === '/usuario' || corpo.path?.startsWith('/usuario/'))) {
      const prefixo = `${corpo.path.slice(1)}/`
      // Como no Dropbox, a listagem traz também as pastas (as de dentro do caminho: no recursivo, todas; senão, as do
      // primeiro nível), misturadas aos arquivos. O app só usa os arquivos (o filtro `.tag === 'file'`).
      const pastas = new Set<string>()
      for (const c of estado.enviados.keys()) {
        if (!c.startsWith(prefixo)) continue
        const partes = c.slice(prefixo.length).split('/').slice(0, -1)
        for (let i = 1; i <= (corpo.recursive === true ? partes.length : Math.min(1, partes.length)); i++) pastas.add(prefixo + partes.slice(0, i).join('/'))
      }
      const entradas = [
        ...[...estado.enviados.entries()]
          .filter(([c]) => c.startsWith(prefixo) && (corpo.recursive === true || !c.slice(prefixo.length).includes('/')))
          .map(([c, b]) => ({ c, m: metadadosDe(c, b, revAtual(estado, c, b)) as Record<string, unknown> })),
        ...[...pastas].map((c) => ({ c, m: metadadosDePasta(c) })),
      ]
        .sort((a, b) => (a.c < b.c ? -1 : 1))
        .map(({ m }) => m)
      estado.pastasListadas += pastas.size
      if (entradas.length === 0 && ![...estado.enviados.keys()].some((c) => c.startsWith(prefixo))) {
        return route.fulfill({ status: 409, headers: json, body: JSON.stringify({ error_summary: 'path/not_found/..', error: { '.tag': 'path', path: { '.tag': 'not_found' } } }) })
      }
      return pagina(entradas)
    }
    if (corpo.path === '/usuario' || corpo.path?.startsWith('/usuario/')) {
      return route.fulfill({ status: 409, headers: json, body: JSON.stringify({ error_summary: 'path/not_found/..', error: { '.tag': 'path', path: { '.tag': 'not_found' } } }) })
    }
  }

  estado.proibidos.push(`${pedido.method()} ${pedido.url()}`)
  return route.abort('blockedbyclient')
}

/** Um Dropbox simulado vazio (só o pacote sintético), para ligar a um ou mais contextos. */
export function novoDropboxSimulado(): DropboxSimulado {
  return {
    baixados: [],
    proibidos: [],
    autorizacoes: 0,
    enviados: new Map(),
    sessoes: { iniciadas: 0, partes: 0, concluidas: 0, abertas: new Map() },
    usuarioReal: false,
    pacoteTrocado: new Map(),
    revs: new Map(),
    porPagina: 1000,
    escopos: [...TODOS_OS_ESCOPOS],
    aoEnviar: null,
    escritas: [],
    leituras: [],
    continuacoes: 0,
    pastasListadas: 0,
    pedidos: new Map(),
    _revs: 0,
    _cursores: new Map(),
  }
}

/**
 * Liga o Dropbox simulado ao contexto e bloqueia (e registra) todo o resto que sair do computador. Com `compartilhado`,
 * o contexto usa esse Dropbox (dois aparelhos, a mesma conta); `quem` identifica o aparelho nos ganchos e em `escritas`.
 */
export async function ligarDropboxSimulado(context: BrowserContext, opcoes: { compartilhado?: DropboxSimulado; quem?: string } = {}): Promise<DropboxSimulado> {
  const estado = opcoes.compartilhado ?? novoDropboxSimulado()
  const quem = opcoes.quem ?? 'aparelho'
  await context.route((url) => !ehLocal(url) && (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:'), (route) =>
    // Um pedido segurado por um gancho que o app abortou nesse meio tempo (o prazo de 20 s de src/dropbox/prazo.ts) faz a
    // resposta lançar: vira uma falha legível do teste (em `proibidos`), e não um erro solto no handler (m3).
    responder(route, estado, quem).catch((erro: unknown) => {
      estado.proibidos.push(`o simulado não conseguiu responder a ${route.request().method()} ${route.request().url()}: ${erro instanceof Error ? erro.message : String(erro)}`)
    }),
  )
  return estado
}
