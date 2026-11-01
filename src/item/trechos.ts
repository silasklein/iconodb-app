import type { Ancora, Modalidade, Nivel, Termo } from '../banco/tipos'
import { mapaDeCodepoints } from './offsets'

/** Um link achado no texto na hora de desenhar (citação → obra, número → item). Posições em UTF-16. */
export interface LinkNoTexto {
  inicio: number
  fim: number
  destino: string
  /** Nome acessível do link (o texto visível é só "58" ou "Autor 1999"). */
  rotulo: string
}

export type ParteDaAncora = { tipo: 'texto'; texto: string } | { tipo: 'termo'; texto: string; glId: string }

export type Peca =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'termo'; texto: string; glId: string }
  | { tipo: 'link'; texto: string; destino: string; rotulo: string }
  | { tipo: 'ancora'; hipoteses: string[]; nivel: Nivel; modalidade: Modalidade; partes: ParteDaAncora[] }

interface Entrada {
  /** Em code points, como no banco. */
  termos?: readonly Termo[]
  /** Em code points, como no banco. */
  ancoras?: readonly Ancora[]
  /** Já em UTF-16 (achados no próprio texto). */
  links?: readonly LinkNoTexto[]
}

interface Span<T> {
  a: number
  b: number
  i: number
  dado: T
}

/**
 * Corta o texto em peças para desenhar. A ordem de desenho, quando os trechos se cruzam:
 *
 * 1. **Âncora por fora** (sublinhado pontilhado; abre a hipótese). Trechos de âncora que se
 *    cruzam viram peças vizinhas, cada uma com as hipóteses que a cobrem, da que começa antes
 *    para a que começa depois (duas hipóteses no mesmo trecho = uma peça com as duas).
 * 2. **Termo por dentro**: dentro da âncora o termo é só marcado (`partes`), não é um link à
 *    parte, porque não se aninha um elemento interativo em outro; o verbete se abre pelo painel
 *    da hipótese. A parte de um termo que sai da âncora é um link de termo normal.
 * 3. **Links do texto** (citação, número) nunca se cruzam com termos e âncoras (quem os acha
 *    já os evita); se algum cair numa âncora, fica como texto.
 *
 * As posições de termos e âncoras chegam em code points e são convertidas uma vez só, por um
 * mapa do texto inteiro. Trechos vazios ou invertidos somem; os que passam do fim são cortados.
 * As peças, juntas, sempre recompõem o texto, e nenhuma é vazia.
 */
export function montarTrechos(texto: string, { termos = [], ancoras = [], links = [] }: Entrada): Peca[] {
  const mapa = mapaDeCodepoints(texto)
  const ultimo = mapa.length - 1
  const u16 = (cp: number) => (cp <= 0 ? 0 : cp >= ultimo ? texto.length : mapa[cp]!)
  const doBanco = <T extends { inicio: number; fim: number }>(lista: readonly T[]): Span<T>[] =>
    lista.map((d, i) => ({ a: u16(d.inicio), b: u16(d.fim), i, dado: d })).filter((s) => s.a < s.b)
  const sAncoras = doBanco(ancoras).sort((x, y) => x.a - y.a || x.i - y.i)
  const sTermos = doBanco(termos).sort((x, y) => x.a - y.a || x.i - y.i)
  const sLinks = links
    .map((d, i) => ({ a: Math.max(0, d.inicio), b: Math.min(texto.length, d.fim), i, dado: d }))
    .filter((s) => s.a < s.b)
    .sort((x, y) => x.a - y.a || x.i - y.i)

  const cortes = new Set<number>([0, texto.length])
  for (const s of [...sAncoras, ...sTermos, ...sLinks]) {
    cortes.add(s.a)
    cortes.add(s.b)
  }
  const pontos = [...cortes].sort((x, y) => x - y)

  const pecas: Peca[] = []
  let chaveAnterior = ''
  let parteAnterior = ''
  for (let k = 0; k + 1 < pontos.length; k++) {
    const x = pontos[k]!
    const y = pontos[k + 1]!
    const pedaco = texto.slice(x, y)
    const cobre = <T>(s: Span<T>) => s.a <= x && s.b >= y
    const naAncora = sAncoras.filter(cobre)
    const termo = sTermos.find(cobre)

    if (naAncora.length > 0) {
      const chave = `a:${naAncora.map((s) => s.i).join(',')}`
      let peca = pecas[pecas.length - 1]
      if (chave !== chaveAnterior || peca?.tipo !== 'ancora') {
        const primeira = naAncora[0]!.dado
        peca = { tipo: 'ancora', hipoteses: naAncora.map((s) => s.dado.hipoteseId), nivel: primeira.nivel, modalidade: primeira.modalidade, partes: [] }
        pecas.push(peca)
        parteAnterior = ''
      }
      const chaveDaParte = termo ? `t:${termo.i}` : 'x'
      const ultima = peca.partes[peca.partes.length - 1]
      if (ultima && chaveDaParte === parteAnterior) ultima.texto += pedaco
      else peca.partes.push(termo ? { tipo: 'termo', texto: pedaco, glId: termo.dado.glId } : { tipo: 'texto', texto: pedaco })
      parteAnterior = chaveDaParte
      chaveAnterior = chave
      continue
    }

    const link = termo ? undefined : sLinks.find(cobre)
    const chave = termo ? `t:${termo.i}` : link ? `l:${link.i}` : 'x'
    const ultima = pecas[pecas.length - 1]
    if (ultima && ultima.tipo !== 'ancora' && chave === chaveAnterior) ultima.texto += pedaco
    else if (termo) pecas.push({ tipo: 'termo', texto: pedaco, glId: termo.dado.glId })
    else if (link) pecas.push({ tipo: 'link', texto: pedaco, destino: link.dado.destino, rotulo: link.dado.rotulo })
    else pecas.push({ tipo: 'texto', texto: pedaco })
    chaveAnterior = chave
  }
  return pecas
}
