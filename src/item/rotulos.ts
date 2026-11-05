import type { Autor, Hipotese, Modalidade, Nivel } from '../banco/tipos'

export const ROTULO_DO_NIVEL: Record<Nivel, string> = {
  pre_iconographic: 'Pré-iconográfico',
  iconographic: 'Iconográfico',
  iconological: 'Iconológico',
}

/** A linha que explica cada nível (decisão 35). */
export const LINHA_DO_NIVEL: Record<Nivel, string> = {
  pre_iconographic: 'O que se vê',
  iconographic: 'O que significa',
  iconological: 'O que revela da cultura',
}

/** A legenda curta do celular (uma linha): «■□□ vê · ■■□ significa · ■■■ cultura». */
export const LEGENDA_CURTA: Record<Nivel, string> = {
  pre_iconographic: 'vê',
  iconographic: 'significa',
  iconological: 'cultura',
}

/** O que a prévia do trecho diz da hipótese: o termo (a forma em uso de agora) e do que ela fala. */
export interface ResumoDaHipotese {
  termo: string | null
  /** «o objeto inteiro» ou o nome da região. */
  sobre: string
}

export const ROTULO_DA_MODALIDADE: Record<Modalidade, string> = {
  asserted: 'afirmada',
  probable: 'provável',
  possible: 'possível',
  questioned: 'questionada',
}

export const ROTULO_DA_VERIFICACAO: Record<Hipotese['verificacao'], string> = {
  recorded: 'registrada, não conferida na fonte',
  source_checked: 'conferida na fonte',
  passage_checked: 'conferida no trecho',
}

export const ROTULO_DA_RELIGIOSIDADE: Record<NonNullable<Hipotese['religiosidade']>, string> = {
  attributed: 'atribuída',
  rejected: 'rejeitada',
  open: 'em aberto',
  not_treated: 'não tratada',
}

export const autores = (lista: readonly Autor[]): string =>
  lista.map((a) => (a.papel === 'reported' ? `${a.nome} (opinião relatada)` : a.papel === 'reporter' ? `${a.nome} (relata)` : a.nome)).join('; ')

/** "TESTE I: 2" com publicação "TESTE" → { sigla: "TESTE", resto: "I: 2" }. */
export function partesDaFonte(fonte: string, publicacao: string): { sigla: string; resto: string } {
  if (fonte.startsWith(`${publicacao} `)) return { sigla: publicacao, resto: fonte.slice(publicacao.length + 1) }
  return { sigla: fonte, resto: '' }
}

/**
 * O nome curto de uma hipótese: o termo em português, senão o recorte citado. Com `formas` (as formas em uso do
 * glossário, Tarefa 11), o termo aparece com a forma em uso de agora.
 */
export const nomeDaHipotese = (h: Pick<Hipotese, 'termos' | 'citacao' | 'id'>, formas?: ReadonlyMap<string, string>): string => {
  const t = h.termos[0]
  return (t && formas?.get(t.glId)) ?? t?.pt ?? t?.de ?? h.citacao ?? h.id
}

/** Do que a hipótese fala: o elemento, ou o objeto inteiro. */
export const sobreDaHipotese = (h: Pick<Hipotese, 'alvo'>): string => h.alvo.rotulo ?? 'objeto inteiro'

/** A hipótese tem trecho marcado no texto português (âncora por termo)? */
export const temAncora = (h: Pick<Hipotese, 'ancora'>): boolean =>
  h.ancora !== null && h.ancora.metodo === 'termo' && h.ancora.inicio !== null && h.ancora.fim !== null
