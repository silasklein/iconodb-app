/**
 * O registro `imagem` da camada do usuário (decisão 33) e como ele se lê. FORMATO DO EVENTO (Tarefa 16 lê isto):
 *
 *   tipo "imagem", reg "IM-<aparelho>-<n>", op "criar", campos:
 *     alvoTipo   "objeto"
 *     alvo       o número do objeto ("CA00023") ou, na Tarefa 9, o id de um objeto SKC ("OB-…")
 *     tipo       "traco" | "tons"        o modo de exibição (traço = invertido), corrigível
 *     tipoDetectado "traco" | "tons"     o que a regra de display.py disse
 *     metricas   {extremes, grey_core}   as métricas da regra (4 casas)
 *     legenda    texto ("" = sem)        credito  texto       principal  true | false
 *     formato    "webp" | "jpeg"         da tela e da miniatura (o Safari antigo não grava WebP)
 *     extensao   a do original           ("jpg", "heic"…; [a-z0-9]{1,5}, senão "bin")
 *     nome       o nome do arquivo escolhido          bytes  o tamanho do original
 *     largura, altura                    a tela (px)
 *     miniaturaLargura, miniaturaAltura  a miniatura (px)
 *     originalLargura, originalAltura    o original já orientado (px; null se o cabeçalho não disse)
 *   op "alterar": qualquer um de tipo, legenda, credito, principal.
 *   op "excluir" / "restaurar": a marca reversível de sempre (os arquivos ficam no Dropbox).
 *
 * Arquivos no Dropbox: `usuario/imagens/<IM-…>/original.<extensao>`, `tela.<webp|jpg>`, `miniatura.<webp|jpg>`
 * (`.jpg` quando `formato` é "jpeg").
 *
 * "Usar como principal": vale, entre as imagens vivas do objeto marcadas como principal, a marcada por último (o hlc do
 * campo `principal`). Desmarcar a última volta à anterior, ou ao desenho do livro.
 */
import type { Estado, Registro } from '../usuario/estado'
import type { Metricas, Modo } from './modo'

export interface ImagemDoUsuario {
  id: string
  alvo: string
  tipo: Modo
  tipoDetectado: Modo | null
  metricas: Metricas | null
  legenda: string
  credito: string
  principal: boolean
  formato: 'webp' | 'jpeg'
  extensao: string
  nome: string
  bytes: number | null
  largura: number | null
  altura: number | null
  originalLargura: number | null
  originalAltura: number | null
  /** O aparelho que a criou (o id do registro diz). */
  aparelho: string | null
  criadoEm: string
  excluido: boolean
}

export type Versao = 'tela' | 'miniatura'

export interface ArquivoDaImagem {
  nome: string
  caminho: string
  /** 'tela': tela e miniatura (sobem primeiro: é o que o outro aparelho mostra); 'original': o original. */
  fase: 'tela' | 'original'
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '')
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
const modo = (v: unknown): Modo | null => (v === 'traco' || v === 'tons' ? v : null)

export const extensaoDaTela = (formato: ImagemDoUsuario['formato']) => (formato === 'jpeg' ? 'jpg' : 'webp')
export const caminhoNoDropbox = (id: string, nome: string) => `usuario/imagens/${id}/${nome}`
export const nomeDaVersao = (img: Pick<ImagemDoUsuario, 'formato'>, versao: Versao) => `${versao}.${extensaoDaTela(img.formato)}`

/** O registro como imagem do usuário; null se faltar o que monta os caminhos (formato) ou o alvo. */
export function lerImagem(r: Registro): ImagemDoUsuario | null {
  const c = r.campos
  const formato = c.formato === 'webp' || c.formato === 'jpeg' ? c.formato : null
  const alvo = texto(c.alvo)
  if (!formato || !alvo || !/^IM-/.test(r.id)) return null
  const ext = texto(c.extensao)
  const m = c.metricas as Record<string, unknown> | null | undefined
  return {
    id: r.id,
    alvo,
    tipo: modo(c.tipo) ?? modo(c.tipoDetectado) ?? 'tons',
    tipoDetectado: modo(c.tipoDetectado),
    metricas: m && typeof m.extremes === 'number' && typeof m.grey_core === 'number' ? { extremes: m.extremes, grey_core: m.grey_core } : null,
    legenda: texto(c.legenda),
    credito: texto(c.credito),
    principal: c.principal === true,
    formato,
    extensao: /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'bin',
    nome: texto(c.nome),
    bytes: numero(c.bytes),
    largura: numero(c.largura),
    altura: numero(c.altura),
    originalLargura: numero(c.originalLargura),
    originalAltura: numero(c.originalAltura),
    aparelho: /^IM-([a-z0-9]{8})-\d+$/.exec(r.id)?.[1] ?? null,
    criadoEm: r.criadoEm,
    excluido: r.excluido,
  }
}

/** Os três arquivos da imagem no Dropbox, na ordem de envio (tela, miniatura, original). */
export function arquivosDaImagem(img: Pick<ImagemDoUsuario, 'id' | 'formato' | 'extensao'>): ArquivoDaImagem[] {
  const e = extensaoDaTela(img.formato)
  return [
    { nome: `tela.${e}`, caminho: caminhoNoDropbox(img.id, `tela.${e}`), fase: 'tela' },
    { nome: `miniatura.${e}`, caminho: caminhoNoDropbox(img.id, `miniatura.${e}`), fase: 'tela' },
    { nome: `original.${img.extensao}`, caminho: caminhoNoDropbox(img.id, `original.${img.extensao}`), fase: 'original' },
  ]
}

/**
 * Todas as imagens do usuário por alvo, lidas uma vez por mapa de registros `imagem` (o mapa só muda de identidade
 * quando uma imagem muda: as telas consultam isto a cada render sem custo).
 */
const porMapa = new WeakMap<object, Map<string, ImagemDoUsuario[]>>()
function porAlvo(estado: Estado): Map<string, ImagemDoUsuario[]> {
  const mapa = estado.registros.get('imagem')
  if (!mapa) return new Map()
  let r = porMapa.get(mapa)
  if (!r) {
    r = new Map()
    for (const reg of mapa.values()) {
      const img = lerImagem(reg)
      if (!img) continue
      const lista = r.get(img.alvo) ?? []
      lista.push(img)
      r.set(img.alvo, lista)
    }
    for (const lista of r.values()) lista.sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : a.id < b.id ? -1 : 1))
    porMapa.set(mapa, r)
  }
  return r
}

const VAZIA: readonly ImagemDoUsuario[] = Object.freeze([])
const vivasCache = new WeakMap<readonly ImagemDoUsuario[], readonly ImagemDoUsuario[]>()
const excluidasCache = new WeakMap<readonly ImagemDoUsuario[], readonly ImagemDoUsuario[]>()

/** As imagens vivas do objeto, na ordem em que foram adicionadas (a mesma lista enquanto nada mudar). */
export function imagensDoObjeto(estado: Estado, alvo: string): readonly ImagemDoUsuario[] {
  const todas = porAlvo(estado).get(alvo)
  if (!todas) return VAZIA
  let v = vivasCache.get(todas)
  if (!v) vivasCache.set(todas, (v = todas.filter((i) => !i.excluido)))
  return v
}

/** As excluídas (para restaurar). */
export function excluidasDoObjeto(estado: Estado, alvo: string): readonly ImagemDoUsuario[] {
  const todas = porAlvo(estado).get(alvo)
  if (!todas) return VAZIA
  let v = excluidasCache.get(todas)
  if (!v) excluidasCache.set(todas, (v = todas.filter((i) => i.excluido)))
  return v
}

/** A imagem principal do objeto (a marcada por último), ou null: vale o desenho do livro. */
export function principalDoObjeto(estado: Estado, alvo: string): ImagemDoUsuario | null {
  let melhor: ImagemDoUsuario | null = null
  let hlc = ''
  for (const img of imagensDoObjeto(estado, alvo)) {
    if (!img.principal) continue
    const h = estado.hlcDoCampo('imagem', img.id, 'principal') ?? img.criadoEm
    if (!melhor || h > hlc) {
      melhor = img
      hlc = h
    }
  }
  return melhor
}
