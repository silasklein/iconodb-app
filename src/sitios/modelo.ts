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
 * - `variantes`: lista de textos (as "outras grafias"), cada um normalizado, sem vazios e sem repetidos pela dobra
 *   (`chaveDoNome`); a lista inteira é um valor (a última escrita vence; as anteriores ficam no histórico). Num sítio do livro
 *   são grafias a MAIS: as do livro continuam valendo. `null` = nenhuma.
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
import type { Campos } from '../usuario/eventos'
import type { Registro } from '../usuario/fusao'

export const RE_SITIO_SKC = /^SI-[a-z0-9]{8}-[1-9][0-9]*$/
export const eSitioSkc = (id: unknown): boolean => typeof id === 'string' && RE_SITIO_SKC.test(id)

/** A dobra de um nome de sítio para comparar (a mesma de verbetes e campos de escolha). */
export const chaveDoNome = chaveDaForma
export { normalizarForma as normalizarNome }

export const MAX_DE_LATITUDE = 90
export const MAX_DE_LONGITUDE = 180

const textoNaoVazio = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? normalizarForma(v) : null)
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A lista de grafias: textos normalizados, sem vazios e sem repetidos pela dobra (a primeira vence). */
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
  variantes: string[]
  regiao: string | null
  pais: string | null
  coordenada: Coordenada | null
  nota: string | null
}

export function lerDadosDoSitio(r: Registro): DadosDoSitio {
  const c = r.campos
  return {
    nome: textoNaoVazio(c.nome),
    variantes: Array.isArray(c.variantes) ? normalizarVariantes(c.variantes) : [],
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

export function lerSitioSkc(r: Registro): SitioSkc {
  const d = lerDadosDoSitio(r)
  return { ...d, id: r.id, nomeDeAgora: d.nome ?? r.id, criadoEm: r.criadoEm, excluido: r.excluido }
}

/** Os dados de um sítio novo (a tela NovoSitio). Nome, no mínimo. */
export interface EntradaDeSitio {
  nome: string
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
  const variantes = normalizarVariantes(e.variantes ?? [])
  if (variantes.length > 0) campos.variantes = variantes
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
