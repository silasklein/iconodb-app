/** Os nomes dos motivos da fila de revisão do pacote (`review_queue.reason`). Puro: sem banco. */
/** Os motivos da fila de revisão com nome próprio; os outros aparecem pelo motivo, legível. */
const ROTULOS = {
  citacao_nao_resolvida: 'Citações não resolvidas',
  traducao_termo_alterado: 'Traduções com termo alterado',
  traducao_desatualizada: 'Traduções desatualizadas',
  medidas_nao_normalizadas: 'Medidas não organizadas',
  datacao_nao_normalizada: 'Datações não organizadas',
  sitio_nao_normalizado: 'Sítios não resolvidos',
  sitio_nao_resolvido: 'Sítios não resolvidos',
  tabela_na_introducao: 'Tabelas na introdução',
  traducao_fora_de_escopo: 'Traduções fora do escopo',
  traducao_excecao_preservacao: 'Traduções com exceção de preservação',
  obra_do_capitulo_nao_encontrada: 'Obras de capítulo não encontradas',
  entrada_bibliografica_ilegivel: 'Entradas bibliográficas ilegíveis',
  remissao_ilegivel: 'Remissões ilegíveis',
  anotacao_invalida: 'Anotações inválidas',
  decisao_sem_verbete: 'Decisões sem verbete',
  correspondencia_invalida: 'Correspondências inválidas',
  mencao_de_figura_ambigua: 'Menções de figura ambíguas',
  credito_do_desenho_ausente: 'Créditos de desenho ausentes',
  credito_de_figura_ilegivel: 'Créditos de figura ilegíveis',
  aparato_menos_de_5_campos: 'Aparato do catálogo a conferir',
  aparato_divisao_ambigua: 'Aparato do catálogo a conferir',
  aparato_divisao_por_recurso: 'Aparato do catálogo a conferir',
  aparato_campo_suspeito: 'Aparato do catálogo a conferir',
  // As subcoleções do IPIAO (schema 9; iconodb/groups.py, R_SUB_* e R_ITEM_OUTSIDE/R_BAD_OUTSIDE).
  subcolecao_sem_titulo_pt: 'Subcoleções sem título em português',
  subcolecao_sem_objeto: 'Subcoleções sem objeto',
  subcolecao_intro_invalida: 'Introduções de subcoleção inválidas',
  subcolecao_secao_orfa: 'Seções de subcoleção sem objeto',
  subcolecao_grupo_orfao: 'Subcoleções de grupo inexistente',
  item_fora_de_subcolecao: 'Objetos fora das subcoleções',
  fora_de_subcolecao_invalido: 'Exceções de subcoleção inválidas',
} satisfies Record<string, string>
export const ROTULO_DA_PENDENCIA: Record<string, string> = ROTULOS

/** Os motivos da fila que as subcoleções criam (iconodb/groups.py). */
export const MOTIVOS_DAS_SUBCOLECOES = [
  'subcolecao_sem_titulo_pt',
  'subcolecao_sem_objeto',
  'subcolecao_intro_invalida',
  'subcolecao_secao_orfa',
  'subcolecao_grupo_orfao',
  'item_fora_de_subcolecao',
  'fora_de_subcolecao_invalido',
] as const satisfies readonly (keyof typeof ROTULOS)[]

export function rotuloDaPendencia(motivo: string): string {
  const conhecido = ROTULO_DA_PENDENCIA[motivo]
  if (conhecido) return conhecido
  const legivel = motivo.replace(/_/g, ' ').trim()
  return legivel.charAt(0).toUpperCase() + legivel.slice(1)
}

