/**
 * Os sítios do usuário (Tarefa 12): o registro `sitio`, o `item-sitio` e como se leem. PURO: sem React, sem IndexedDB.
 *
 * FORMATO DOS CAMPOS (congelado: o porte para Python da Tarefa 16 exporta estes registros). Ids ASCII.
 *
 * `sitio`, reg = o id do sítio, de dois tipos:
 * - Sítio NOVO do usuário: `SI-<aparelho>-<n>` (`^SI-[a-z0-9]{8}-[1-9][0-9]*$`), do gerador de ids de sempre
 *   (`proximoId('SI')`: o contador do aparelho, nunca reusado). O aparelho nunca é `pipeline` (reservado à Tarefa 16).
 *   - `criar` (uma vez, no aparelho que o criou): `nome` (obrigatório, normalizado: NFC, espaços colapsados, nunca vazio) e,
 *     se a pessoa preencheu, os campos de baixo.
 * - CORREÇÃO de um sítio do livro: o reg é o id do pacote (`<SIGLA>-<n>`, o de `sitios()`: "TESTE-2"), SEM `criar` (a fusão cria
 *   o registro com o primeiro evento, como nos verbetes do pacote). Só os campos corrigidos existem; o resto vale o do livro.
 *   Um sítio do livro NUNCA se exclui (`excluir`/`restaurar` só para `SI-…`).
 * Campos (os mesmos nos dois tipos; `alterar` com UM campo por evento, salvo os pares):
 * - `nome`: texto normalizado ou `null`. Num sítio do livro, `null` ou ausente = o nome do livro ("Voltar ao valor do livro").
 *   Num sítio novo nunca é vazio (o app não grava vazio).
 * - `grafias` (Parte 2C, bloco 2): lista de `{texto, tradicao?, livro?}` (as "outras grafias", com a origem). `texto`
 *   normalizado e nunca vazio; `tradicao` uma das `TRADICOES` (ausente = «sem origem»); `livro` a sigla de um livro do
 *   pacote. Sem repetir `(chaveDaGrafia(texto), livro)`. A lista inteira é um valor (a última escrita vence; as anteriores
 *   ficam no histórico). Num sítio do livro são grafias a MAIS: as do livro continuam valendo (e a tradição que a pessoa dá a
 *   uma grafia do livro fica aqui, com o mesmo `texto` e `livro`). `null` = nenhuma.
 * - `variantes` (o formato de antes; o app não a escreve mais, mas a lê): lista de textos, as grafias sem origem. Leitura
 *   (`lerGrafias`, a mesma da resolução e do processamento): sem `grafias` escrito, valem as `variantes`; com os dois, se a
 *   escrita de `variantes` tem hlc MAIOR (um aparelho com o app antigo escreveu depois), juntam-se às `grafias` as
 *   `variantes` cuja `chaveDaGrafia` ainda não está lá. A primeira edição grava `grafias` com as antigas incluídas.
 * - `mescladoEm` (Parte 2C, bloco 2): o id do sítio em que este foi mesclado (`<SIGLA>-<n>` ou `SI-…`) ou `null` (desfeito;
 *   vence também a mescla que o pacote traz). Nunca escrito: vale a do pacote, se há.
 * - `parteDe`: o id do sítio de que este é parte, ou `null` (solto; vence a parte do pacote). Nunca escrito: a do pacote.
 * - `diferentesDe`: lista de ids, os pares que a pessoa decidiu «São lugares diferentes», guardados no registro do id MENOR
 *   do par (por ponto de código). A resolução (src/sitios/resolucao.ts) une as listas de todos os registros.
 * - `regiao`: texto ("Região ou país") ou `null` (num sítio do livro, `null` = a região do livro, o verbete-pai do nome).
 * - `pais`: texto ou `null`. O app não o escreve (a tela tem um campo só, "Região ou país"); a leitura e o índice o aceitam.
 * - `lat`, `lon`: números (graus decimais, norte e leste positivos; latitude −90 a 90, longitude −180 a 180) ou `null`,
 *   SEMPRE escritos juntos num evento só (um par, como `termos` + `termosRotulos`). Quem lê só vê uma coordenada se os dois
 *   forem números dentro da faixa; senão vale o livro (ou "sem coordenada"). `null` nos dois = voltar ao valor do livro.
 *   Guardados como o app os leu (sem arredondar); a tela mostra até 5 casas.
 * - `nota`: texto livre da pessoa (de onde vem a coordenada, dúvidas, bibliografia…) ou `null`. É a nota SKC; o "No livro" do
 *   livro (`site.note`) é outra coisa e não se muda.
 * A data de criação é o `hlc` do `criar` (`criadoEm`). Por campo, vence a escrita de maior hlc (a fusão de sempre).
 * `excluir` / `restaurar`: a marca reversível de sempre, só para `SI-…`. Os objetos ligados a um sítio excluído continuam com
 * ele (nada é reescrito): a tela mostra o nome com a marca "excluído" e a Revisão conta o objeto como "sítio não resolvido".
 *
 * `item-sitio`, reg = o NÚMERO do objeto do pacote cujo sítio foi trocado ("CA00023"; sem número, o id do item), SEM `criar`.
 * Só para objetos dos livros: o sítio de um objeto SKC é o campo `sitio` da ficha dele (src/objetos-skc/modelo.ts).
 * - `sitio`: o id do sítio escolhido (do livro, `<SIGLA>-<n>`, ou `SI-…`), ou `null`/ausente = o do livro ("Voltar ao do livro").
 * - `sitioNome`: o nome do sítio escolhido quando a pessoa o escolheu (só o que se mostra se o sítio sumir).
 * O dado do livro continua guardado e visível ("no livro: …"). Um objeto com `item-sitio.sitio` vivo (um sítio do livro, ou um
 * `SI-…` não excluído) deixa de contar como "sítio não resolvido" na Revisão; um `SI-…` excluído ou inexistente, não.
 *
 * NOME DE AGORA (as telas): o `nome` corrigido → o nome do livro (o de `sitios()`) → o rótulo guardado. Um sítio do livro nunca
 * "some". BUSCA: acha pelo nome do livro, pelas grafias do livro, pelo nome corrigido e pelas outras grafias.
 *
 * DUPLICADOS: o app não junta nada. Um nome (ou outra grafia) que, pela dobra (`dobrar`, a de sempre), é o de outro sítio, do
 * livro ou do usuário, ganha o aviso "pode ser o mesmo sítio", com o link; a pessoa decide. A exportação deve deduplicar por
 * `chaveDoNome` antes de criar sítios novos no pipeline.
 *
 * PARA O PORTE EM PYTHON: `re.fullmatch` com `[a-z0-9]` e `[0-9]` explícitos (nada de `\d` nem de `$`); `chaveDoNome` =
 * `chaveDaForma` do glossário (src/glossario/modelo.ts).
 */
import { chaveDaForma, normalizarForma } from '../glossario/modelo'
import type { Campos, Json } from '../usuario/eventos'
import type { Estado, Registro } from '../usuario/fusao'

export const RE_SITIO_SKC = /^SI-[a-z0-9]{8}-[1-9][0-9]*$/
export const eSitioSkc = (id: unknown): boolean => typeof id === 'string' && RE_SITIO_SKC.test(id)

/** A dobra de um nome de sítio para comparar (a mesma de verbetes e campos de escolha). */
export const chaveDoNome = chaveDaForma
export { normalizarForma as normalizarNome }

export const MAX_DE_LATITUDE = 90
export const MAX_DE_LONGITUDE = 180

const textoNaoVazio = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? normalizarForma(v) : null)
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Uma lista de textos (as `variantes` de antes): normalizados, sem vazios e sem repetidos pela dobra (a primeira vence). */
export function normalizarVariantes(lista: readonly unknown[]): string[] {
  const vistos = new Set<string>()
  const saida: string[] = []
  for (const v of lista) {
    const t = typeof v === 'string' ? normalizarForma(v) : ''
    const k = chaveDoNome(t)
    if (t === '' || vistos.has(k)) continue
    vistos.add(k)
    saida.push(t)
  }
  return saida
}

// ---------------------------------------------------------------- grafias (Parte 2C, bloco 2)

/** As tradições de uma grafia (a mesma lista do processamento, `iconodb/sitios_relacoes.py`). */
export const TRADICOES = ['arabe', 'hebraica-moderna', 'biblica', 'grega-latina', 'alema', 'inglesa', 'francesa', 'portuguesa', 'outra'] as const
export type Tradicao = (typeof TRADICOES)[number]
const CONJUNTO_DE_TRADICOES: ReadonlySet<string> = new Set(TRADICOES)
export const tradicaoValida = (t: unknown): t is Tradicao => typeof t === 'string' && CONJUNTO_DE_TRADICOES.has(t)

/** O rótulo de uma tradição (o campo de escolha). */
export const ROTULO_DA_TRADICAO: Record<Tradicao, string> = {
  arabe: 'Árabe',
  'hebraica-moderna': 'Hebraica moderna',
  biblica: 'Bíblica',
  'grega-latina': 'Grega/latina',
  alema: 'Alemã',
  inglesa: 'Inglesa',
  francesa: 'Francesa',
  portuguesa: 'Portuguesa',
  outra: 'Outra',
}

/** O nome do grupo de uma tradição, na lista das grafias («árabe», «hebraica moderna»…). */
export const GRUPO_DA_TRADICAO: Record<Tradicao, string> = {
  arabe: 'árabe',
  'hebraica-moderna': 'hebraica moderna',
  biblica: 'bíblica',
  'grega-latina': 'grega/latina',
  alema: 'alemã',
  inglesa: 'inglesa',
  francesa: 'francesa',
  portuguesa: 'portuguesa',
  outra: 'outra',
}

/** Uma grafia que a pessoa deu a um sítio (o campo `grafias`). */
export interface GrafiaDoUsuario {
  texto: string
  tradicao?: Tradicao
  livro?: string
}

/** A chave que diz se duas grafias são a mesma: a dobra de sempre (`chaveDoNome`), com U+2010 e U+2011 como hífen. */
export const chaveDaGrafia = (t: string): string => chaveDoNome(t.replace(/[\u2010\u2011]/g, '-'))

/** Uma grafia como a camada a guarda, ou null se não vale (texto ausente ou vazio). A tradição desconhecida e o livro vazio saem. */
export function lerGrafia(x: unknown): GrafiaDoUsuario | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
  const o = x as { [chave: string]: unknown }
  if (typeof o.texto !== 'string') return null
  const texto = normalizarForma(o.texto)
  if (texto === '') return null
  const g: GrafiaDoUsuario = { texto }
  if (tradicaoValida(o.tradicao)) g.tradicao = o.tradicao
  if (typeof o.livro === 'string' && o.livro !== '') g.livro = o.livro
  return g
}

/** As grafias das listas, em ordem, sem repetir `(chaveDaGrafia(texto), livro)` (a primeira fica). */
export function juntarGrafias(listas: Iterable<readonly GrafiaDoUsuario[]>): GrafiaDoUsuario[] {
  const vistas = new Set<string>()
  const saida: GrafiaDoUsuario[] = []
  for (const lista of listas) {
    for (const g of lista) {
      const k = JSON.stringify([chaveDaGrafia(g.texto), g.livro ?? null])
      if (vistas.has(k)) continue
      vistas.add(k)
      saida.push(g)
    }
  }
  return saida
}

const naoNulo = <T>(x: T | null): x is T => x !== null

/** A lista de grafias para gravar: as que valem (`lerGrafia`), sem repetir texto (pela `chaveDaGrafia`) e livro. */
export function normalizarGrafias(lista: readonly unknown[]): GrafiaDoUsuario[] {
  return juntarGrafias([lista.map(lerGrafia).filter(naoNulo)])
}

/** A grafia como valor JSON da camada (só as chaves que têm valor). */
export const grafiaComoJson = (g: GrafiaDoUsuario): { [chave: string]: Json } => ({
  texto: g.texto,
  ...(g.tradicao ? { tradicao: g.tradicao } : {}),
  ...(g.livro ? { livro: g.livro } : {}),
})

/** A escrita que vale num campo: o valor e o hlc dela (`''` quando não se sabe o hlc). */
export interface EscritaDoCampo {
  valor: Json
  hlc: string
}

const deVariantes = (v: Json): GrafiaDoUsuario[] => (Array.isArray(v) ? v.map((t) => (typeof t === 'string' ? lerGrafia({ texto: t }) : null)).filter(naoNulo) : [])

/**
 * As grafias de um sítio a partir das escritas de `grafias` e de `variantes` (null = o campo nunca foi escrito): sem `grafias`,
 * as `variantes` como grafias sem origem; com os dois, se o hlc das `variantes` é maior, juntam-se as que faltam (pela
 * `chaveDaGrafia`). O passo 2 da resolução (src/sitios/resolucao.ts; `_ler_grafias` no processamento).
 */
export function lerGrafias(grafias: EscritaDoCampo | null, variantes: EscritaDoCampo | null): GrafiaDoUsuario[] {
  if (grafias === null) return variantes === null ? [] : juntarGrafias([deVariantes(variantes.valor)])
  let lista = juntarGrafias([(Array.isArray(grafias.valor) ? grafias.valor : []).map(lerGrafia).filter(naoNulo)])
  if (variantes !== null && variantes.hlc > grafias.hlc) {
    const ja = new Set(lista.map((g) => chaveDaGrafia(g.texto)))
    lista = juntarGrafias([lista, deVariantes(variantes.valor).filter((g) => !ja.has(chaveDaGrafia(g.texto)))])
  }
  return lista
}

/** O hlc da escrita que vale em cada campo de um registro `sitio` (para `lerDadosDoSitio` e `grafiasDoRegistro`). */
export type HlcDoCampo = (campo: string) => string | null
export const hlcDoSitio = (estado: Estado, id: string): HlcDoCampo => (campo) => estado.hlcDoCampo('sitio', id, campo)

/**
 * As grafias de UM registro (`lerGrafias`). Sem `hlc` (o hlc de cada campo), um registro com `grafias` ignora as `variantes`
 * (não dá para saber se vieram depois); quem tem o `Estado` passa `hlcDoSitio(estado, id)`.
 */
export function grafiasDoRegistro(r: Registro, hlc?: HlcDoCampo): GrafiaDoUsuario[] {
  const escrita = (campo: string): EscritaDoCampo | null => (campo in r.campos ? { valor: r.campos[campo]!, hlc: hlc?.(campo) ?? '' } : null)
  return lerGrafias(escrita('grafias'), escrita('variantes'))
}

/** Os textos das grafias, sem repetir texto (pela `chaveDaGrafia`): a lista «Outras grafias» de antes (`DadosDoSitio.variantes`). */
export function textosDasGrafias(grafias: readonly GrafiaDoUsuario[]): string[] {
  const vistos = new Set<string>()
  const saida: string[] = []
  for (const g of grafias) {
    const k = chaveDaGrafia(g.texto)
    if (vistos.has(k)) continue
    vistos.add(k)
    saida.push(g.texto)
  }
  return saida
}

export interface Coordenada {
  lat: number
  lon: number
}

/** O par só vale com os dois números dentro da faixa. */
export function coordenadaValida(lat: unknown, lon: unknown): Coordenada | null {
  const a = numero(lat)
  const o = numero(lon)
  if (a === null || o === null || Math.abs(a) > MAX_DE_LATITUDE || Math.abs(o) > MAX_DE_LONGITUDE) return null
  return { lat: a, lon: o }
}

/** O que a pessoa escreveu num registro `sitio` (o de um sítio novo, ou a correção de um do livro). */
export interface DadosDoSitio {
  nome: string | null
  /** Os textos das outras grafias (`grafias`, com as `variantes` antigas pela regra de `lerGrafias`), sem repetir. */
  variantes: string[]
  regiao: string | null
  pais: string | null
  coordenada: Coordenada | null
  nota: string | null
}

/** `hlc`: o hlc de cada campo (`hlcDoSitio`), para juntar `variantes` escritas depois das `grafias` (veja `grafiasDoRegistro`). */
export function lerDadosDoSitio(r: Registro, hlc?: HlcDoCampo): DadosDoSitio {
  const c = r.campos
  return {
    nome: textoNaoVazio(c.nome),
    variantes: textosDasGrafias(grafiasDoRegistro(r, hlc)),
    regiao: textoNaoVazio(c.regiao),
    pais: textoNaoVazio(c.pais),
    coordenada: coordenadaValida(c.lat, c.lon),
    nota: typeof c.nota === 'string' && c.nota.trim() !== '' ? c.nota.trim() : null,
  }
}

/** Um sítio novo do usuário, como as telas o leem. */
export interface SitioSkc extends DadosDoSitio {
  id: string
  /** O nome (nunca vazio: sem `nome` válido, o id). */
  nomeDeAgora: string
  criadoEm: string
  excluido: boolean
}

export function lerSitioSkc(r: Registro, hlc?: HlcDoCampo): SitioSkc {
  const d = lerDadosDoSitio(r, hlc)
  return { ...d, id: r.id, nomeDeAgora: d.nome ?? r.id, criadoEm: r.criadoEm, excluido: r.excluido }
}

/** Os dados de um sítio novo (a tela NovoSitio). Nome, no mínimo. */
export interface EntradaDeSitio {
  nome: string
  /** As outras grafias digitadas (sem origem): gravadas em `grafias`. */
  variantes?: readonly string[]
  regiao?: string
  coordenada?: Coordenada | null
  nota?: string
}

/** Os campos do `criar` de um sítio novo. Só entram os preenchidos. */
export function camposDoSitioNovo(e: EntradaDeSitio): Campos {
  const nome = normalizarForma(e.nome)
  if (nome === '') throw new Error('sítio sem nome')
  const campos: Campos = { nome }
  const grafias = normalizarGrafias((e.variantes ?? []).map((texto) => ({ texto })))
  if (grafias.length > 0) campos.grafias = grafias.map(grafiaComoJson)
  const regiao = normalizarForma(e.regiao ?? '')
  if (regiao !== '') campos.regiao = regiao
  if (e.coordenada) {
    if (!coordenadaValida(e.coordenada.lat, e.coordenada.lon)) throw new Error('coordenada fora da faixa')
    campos.lat = e.coordenada.lat
    campos.lon = e.coordenada.lon
  }
  const nota = (e.nota ?? '').trim()
  if (nota !== '') campos.nota = nota
  return campos
}

/** O `item-sitio` de um objeto do pacote: o sítio escolhido (null: o do livro). */
export interface TrocaDeSitio {
  sitio: string | null
  sitioNome: string | null
}

export function lerTrocaDeSitio(r: Registro): TrocaDeSitio {
  const id = textoNaoVazio(r.campos.sitio)
  return { sitio: id, sitioNome: textoNaoVazio(r.campos.sitioNome) }
}
