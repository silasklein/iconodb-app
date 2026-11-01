import type { Autor, Hipotese, Modalidade, Nivel } from '../banco/tipos'

export const ROTULO_DO_NIVEL: Record<Nivel, string> = {
  pre_iconographic: 'Pré-iconográfico',
  iconographic: 'Iconográfico',
  iconological: 'Iconológico',
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

/** "TESTE I, 2" com publicação "TESTE" → { sigla: "TESTE", resto: "I, 2" }. */
export function partesDaFonte(fonte: string, publicacao: string): { sigla: string; resto: string } {
  if (fonte.startsWith(`${publicacao} `)) return { sigla: publicacao, resto: fonte.slice(publicacao.length + 1) }
  return { sigla: fonte, resto: '' }
}

/** O nome curto de uma hipótese: o termo em português, senão o recorte citado. */
export const nomeDaHipotese = (h: Pick<Hipotese, 'termos' | 'citacao' | 'id'>): string =>
  h.termos[0]?.pt ?? h.termos[0]?.de ?? h.citacao ?? h.id

/** Do que a hipótese fala: o elemento, ou o objeto inteiro. */
export const sobreDaHipotese = (h: Pick<Hipotese, 'alvo'>): string => h.alvo.rotulo ?? 'objeto inteiro'

/** A hipótese tem trecho marcado no texto português (âncora por termo)? */
export const temAncora = (h: Pick<Hipotese, 'ancora'>): boolean =>
  h.ancora !== null && h.ancora.metodo === 'termo' && h.ancora.inicio !== null && h.ancora.fim !== null
