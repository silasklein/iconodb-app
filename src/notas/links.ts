/**
 * Os links de uma nota: `[[ref|rótulo]]` (ou `[[ref]]`). Puro, sem React e sem HTML: o texto da nota é só texto,
 * e quem o desenha (TextoDaNota) cria links do roteador e nós de texto, nunca marcação. O `ref` é o id de quem se liga:
 * `GL-…` verbete, `BIB-…` obra, número de objeto (`CA00023`), id de sítio (`TESTE-1`, `SI-…`), `CO-…` coleção,
 * `HY-…` hipótese. O rótulo é o que o leitor vê (é copiado na hora de inserir, para a nota continuar legível mesmo
 * que o alvo mude de nome ou saia do pacote).
 */
import { RE_NUMERO_DIGITADO } from '../objetos-skc/numeracao'

/** `colecao-item` só existe como alvo de uma nota (um objeto dentro de uma coleção, ref `CO-…/CA00001`); nenhum `[[…]]` o cria. */
export type TipoDeRef = 'verbete' | 'obra' | 'objeto' | 'objeto-skc' | 'sitio' | 'colecao' | 'hipotese' | 'grupo' | 'colecao-item'

export type PedacoDoTexto =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'link'; ref: string; rotulo: string | null; bruto: string }

/** O que o texto escreve entre `[[` e `]]`: o id (sem `[`, `]`, `|` nem quebra de linha) e, depois da barra, o rótulo. */
const LINK = /\[\[([^[\]|\n\r]+)(?:\|([^[\]\n\r]*))?\]\]/g

/** Separa o texto em pedaços de texto e links. Juntar os `texto` e os `bruto` devolve o original. */
export function analisarTexto(texto: string): PedacoDoTexto[] {
  const pedacos: PedacoDoTexto[] = []
  let fim = 0
  const acrescentarTexto = (t: string) => {
    if (t === '') return
    const ultimo = pedacos.at(-1)
    if (ultimo?.tipo === 'texto') ultimo.texto += t
    else pedacos.push({ tipo: 'texto', texto: t })
  }
  for (const m of texto.matchAll(LINK)) {
    const ref = m[1]!.trim()
    if (ref === '') continue
    acrescentarTexto(texto.slice(fim, m.index))
    const rotulo = m[2]?.trim()
    pedacos.push({ tipo: 'link', ref, rotulo: rotulo ? rotulo : null, bruto: m[0] })
    fim = m.index + m[0].length
  }
  acrescentarTexto(texto.slice(fim))
  return pedacos
}

/** O rótulo sem o que quebraria o link (colchetes, barra vertical, quebras de linha), em uma linha só. */
export function limparRotulo(rotulo: string): string {
  return rotulo.replace(/[[\]|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** `[[ref|rótulo]]`; sem rótulo, `[[ref]]`. */
export function montarLink(ref: string, rotulo?: string | null): string {
  const limpo = rotulo ? limparRotulo(rotulo) : ''
  return limpo === '' ? `[[${ref}]]` : `[[${ref}|${limpo}]]`
}


/** O que o id é, pelo formato. `null`: não se reconhece (a nota o mostra como texto). */
export function tipoDoRef(ref: string): TipoDeRef | null {
  const r = ref.trim()
  if (/^GL-/.test(r)) return 'verbete'
  if (/^BIB-/.test(r)) return 'obra'
  if (/^HY-/.test(r)) return 'hipotese'
  if (/^CO-/.test(r)) return 'colecao'
  if (/^OB-/.test(r)) return 'objeto-skc'
  if (/^GR-/.test(r)) return 'grupo'
  if (/^SI-/.test(r)) return 'sitio'
  if (RE_NUMERO_DIGITADO.test(r)) return 'objeto'
  // "<SIGLA>-<n>": os sítios do pacote (TESTE-1).
  if (/^[A-Za-z0-9]+-\d+$/.test(r)) return 'sitio'
  return null
}

/** O id em forma canônica: o número de objeto em maiúsculas; o resto, como está. */
export const idCanonico = (tipo: TipoDeRef | string, ref: string): string => (tipo === 'objeto' ? ref.trim().toUpperCase() : ref.trim())

/** A chave de um alvo (para o índice de ligações): tipo e id canônico. */
export const chaveDoAlvo = (tipo: string, ref: string): string => `${tipo}\u0000${idCanonico(tipo, ref)}`

/** Os alvos que o texto liga, sem repetir, na ordem em que aparecem. Ids que não se reconhecem ficam de fora. */
export function referenciasDe(texto: string): { tipo: TipoDeRef; ref: string }[] {
  const vistos = new Set<string>()
  const lista: { tipo: TipoDeRef; ref: string }[] = []
  for (const p of analisarTexto(texto)) {
    if (p.tipo !== 'link') continue
    const tipo = tipoDoRef(p.ref)
    if (!tipo) continue
    const ref = idCanonico(tipo, p.ref)
    const chave = chaveDoAlvo(tipo, ref)
    if (vistos.has(chave)) continue
    vistos.add(chave)
    lista.push({ tipo, ref })
  }
  return lista
}

/** O que o texto liga, sem repetir, com o rótulo que a pessoa escreveu (o primeiro que houver para o alvo). */
export function citacoesDe(texto: string): { tipo: TipoDeRef; ref: string; rotulo: string | null }[] {
  const porChave = new Map<string, { tipo: TipoDeRef; ref: string; rotulo: string | null }>()
  for (const p of analisarTexto(texto)) {
    if (p.tipo !== 'link') continue
    const tipo = tipoDoRef(p.ref)
    if (!tipo) continue
    const ref = idCanonico(tipo, p.ref)
    const chave = chaveDoAlvo(tipo, ref)
    const ja = porChave.get(chave)
    if (!ja) porChave.set(chave, { tipo, ref, rotulo: p.rotulo })
    else if (ja.rotulo === null && p.rotulo !== null) ja.rotulo = p.rotulo
  }
  return [...porChave.values()]
}

/** O texto com cada link trocado pelo rótulo (ou pelo id): como a nota se lê, e o que a lista mostra. */
export function textoSemLinks(texto: string): string {
  return analisarTexto(texto)
    .map((p) => (p.tipo === 'texto' ? p.texto : (p.rotulo ?? p.ref)))
    .join('')
}
