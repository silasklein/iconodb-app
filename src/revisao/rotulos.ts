/** Os nomes dos motivos da fila de revisão do pacote (`review_queue.reason`). Puro: sem banco. */
/** Os motivos da fila de revisão com nome próprio; os outros aparecem pelo motivo, legível. */
export const ROTULO_DA_PENDENCIA: Record<string, string> = {
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
}

export function rotuloDaPendencia(motivo: string): string {
  const conhecido = ROTULO_DA_PENDENCIA[motivo]
  if (conhecido) return conhecido
  const legivel = motivo.replace(/_/g, ' ').trim()
  return legivel.charAt(0).toUpperCase() + legivel.slice(1)
}

