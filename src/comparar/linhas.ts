/**
 * As colunas da comparação (uma por objeto) e as LINHAS alinhadas por seção (Comparar.dc.html): cada campo da ficha e cada
 * leitura é uma linha, com uma célula por objeto, na ordem das colunas. O que um objeto não tem é uma célula vazia
 * (`null`) na mesma linha dos outros, nunca um deslocamento. Puro: sem React, sem banco.
 */

import type { Imagem } from '../banco/tipos'

/** O que há de um objeto para mostrar. `situacao` diz se há dados (as colunas sem dados ficam na grade, com a marca). */
export type SituacaoDaColuna = 'ok' | 'excluido' | 'ausente' | 'nao-encontrado' | 'erro'

export interface Celula {
  texto: string
  /** `de`: o original alemão, de uma leitura ainda sem tradução. */
  lang: 'pt' | 'de'
}

export interface Coluna {
  /** A ref da bandeja: número do livro ou id `OB-…`. */
  ref: string
  situacao: SituacaoDaColuna
  skc: boolean
  /** O número do sistema ("CA00019"); null num rascunho ou numa coluna sem dados. */
  numero: string | null
  /** O número do principal do grupo de ligação, quando este objeto está ligado a outro e não é o principal (a marca «ligado a …»); senão null. */
  ligadoA: string | null
  /** "provisório", "rascunho", "excluído", "ainda não sincronizado"… */
  marcas: string[]
  /** "TESTE I: 1" (livro) ou "SKC" com a origem (objeto SKC). */
  origem: string
  titulo: string
  rota: string
  /** Os campos da ficha que o objeto tem, por chave de `CAMPOS_DA_FICHA`. */
  campos: Partial<Record<(typeof CAMPOS_DA_FICHA)[number]['chave'], string>>
  /** As leituras por sigla ("IPIAO", "SKC"). */
  leituras: Record<string, Celula>
  /** As imagens do livro (o pacote); as do usuário vêm do estado, pelo `alvo`. */
  imagens: readonly Imagem[]
  /** O alvo das imagens do usuário: o número do livro ou o id `OB-…`; null numa coluna sem dados. */
  alvo: string | null
}

export const CAMPOS_DA_FICHA = [
  { chave: 'sitio', rotulo: 'Sítio' },
  { chave: 'data', rotulo: 'Data' },
  { chave: 'material', rotulo: 'Material' },
  { chave: 'medidas', rotulo: 'Medidas' },
  { chave: 'acervo', rotulo: 'Acervo' },
  { chave: 'origem', rotulo: 'Origem' },
  { chave: 'hipoteses', rotulo: 'Hipóteses' },
] as const

export interface Linha {
  /** "sitio", "medidas", "leitura:IPIAO". */
  chave: string
  rotulo: string
  grupo: 'ficha' | 'leitura'
  celulas: (Celula | null)[]
  /** Os objetos não dizem o mesmo aqui (só com 2 ou mais objetos). */
  difere: boolean
}

export interface ContagemDeHipoteses {
  pre_iconographic: number
  iconographic: number
  iconological: number
  semNivel: number
}

/** "8 pré-iconográficas · 0 iconográficas · 4 iconológicas" (os três níveis, como no desenho); "Nenhuma hipótese" sem nenhuma. */
export function textoDasHipoteses(c: ContagemDeHipoteses): string {
  if (c.pre_iconographic + c.iconographic + c.iconological + c.semNivel === 0) return 'Nenhuma hipótese'
  const n = (v: number, um: string, varios: string) => `${v} ${v === 1 ? um : varios}`
  const partes = [n(c.pre_iconographic, 'pré-iconográfica', 'pré-iconográficas'), n(c.iconographic, 'iconográfica', 'iconográficas'), n(c.iconological, 'iconológica', 'iconológicas')]
  if (c.semNivel > 0) partes.push(`${c.semNivel} sem nível`)
  return partes.join(' · ')
}

const normal = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()

function linha(chave: string, rotulo: string, grupo: Linha['grupo'], celulas: (Celula | null)[]): Linha {
  const valores = new Set(celulas.map((c) => (c ? normal(c.texto) : '')))
  return { chave, rotulo, grupo, celulas, difere: celulas.length > 1 && valores.size > 1 }
}

/** As linhas para estas colunas: a ficha na ordem de `CAMPOS_DA_FICHA`, depois as leituras (por sigla, na ordem em que aparecem; SKC por último). */
export function montarLinhas(colunas: readonly Coluna[]): Linha[] {
  const linhas: Linha[] = []
  for (const { chave, rotulo } of CAMPOS_DA_FICHA) {
    const celulas = colunas.map((c): Celula | null => {
      const t = c.campos[chave]
      return t && t.trim() !== '' ? { texto: t, lang: 'pt' } : null
    })
    if (celulas.some((c) => c !== null)) linhas.push(linha(chave, rotulo, 'ficha', celulas))
  }
  const siglas: string[] = []
  for (const c of colunas) for (const s of Object.keys(c.leituras)) if (!siglas.includes(s)) siglas.push(s)
  siglas.sort((a, b) => Number(a === 'SKC') - Number(b === 'SKC'))
  for (const s of siglas) linhas.push(linha(`leitura:${s}`, s, 'leitura', colunas.map((c) => c.leituras[s] ?? null)))
  return linhas
}
