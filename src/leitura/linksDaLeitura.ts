/**
 * Os links de uma linha da leitura (plano «O IPIAO lido no formato do §», Tarefa 4), achados na hora de desenhar, como na
 * ficha do objeto e na página do §:
 * - a referência a uma figura que o passo cita («Abb. 2») vai ao objeto dela (`linksDasFiguras`, do §);
 * - o número do catálogo que o passo cita (`passage_item 'mentions'`), onde aparece como remissão («(1–3)», «vgl. 5»), vai ao
 *   objeto, pelo mesmo caminho das remissões da ficha (`acharLinks`, src/item/links.ts).
 * Os números sem menção ficam texto. Nenhum link cobre um termo nem outro link. Posições em UTF-16.
 */
import type { ReferenciaDoParagrafo, Remissao, Termo } from '../banco/tipos'
import { acharLinks } from '../item/links'
import { trechosEmUtf16 } from '../item/offsets'
import type { LinkNoTexto } from '../item/trechos'
import { linksDasFiguras } from '../telas/textoDoParagrafo'

/**
 * Os links de `texto`, com os termos dele (em CODE POINTS) e as menções do passo; `sigla` e `volume` são os do passo («TESTE»,
 * «I»). A numeração do catálogo é única na obra: a remissão casa pelo número, e o nome acessível diz o volume do item citado
 * («Abrir CA00045, TESTE II: 45»; sem o volume na referência, o do passo).
 */
export function linksDaLinha(
  texto: string,
  termos: readonly Termo[],
  referencias: readonly ReferenciaDoParagrafo[],
  sigla: string,
  volume: string,
): LinkNoTexto[] {
  if (referencias.length === 0 || texto === '') return []
  const figuras = linksDasFiguras(texto, referencias)
  const ocupados = [...trechosEmUtf16(texto, termos), ...figuras]
  const obra = rotuloDaObra(sigla, volume)
  // `acharLinks` só liga a remissão da mesma obra da fonte: a origem leva o volume do passo, e o nome, depois, o do item
  const origem = (r: ReferenciaDoParagrafo) => `${obra}: ${r.numero}${r.sufixo}`
  const remissoes: Remissao[] = referencias.map((r) => ({ itemId: r.itemId, numero: r.objeto, origem: origem(r) }))
  const nomes = new Map(
    referencias.map((r) => [`Abrir ${r.objeto}, ${origem(r)}`, `Abrir ${r.objeto}, ${rotuloDaObra(sigla, r.volume ?? volume)}: ${r.numero}${r.sufixo}`]),
  )
  const numeros = acharLinks(texto, ocupados, { fonte: `${obra}: 0`, itemId: '', bibliografia: [], remissoes }).map((l) => ({
    ...l,
    rotulo: nomes.get(l.rotulo) ?? l.rotulo,
  }))
  return [...figuras, ...numeros].sort((a, b) => a.inicio - b.inicio)
}

/** «TESTE I»: a obra e o volume, como o título do passo (`rotuloDoVolume`, src/banco/leitura.ts). */
const rotuloDaObra = (sigla: string, volume: string) => `${sigla} ${volume}`.trim()
