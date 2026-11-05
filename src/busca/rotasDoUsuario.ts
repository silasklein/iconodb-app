import type { Tipo } from '../usuario/eventos'

/**
 * Para onde leva cada tipo de acerto da camada do usuário na busca (o `ref` é o id do registro). Ainda não há
 * tela de registro: um tipo sem rota aparece como texto, sem link. Quem criar a tela acrescenta a rota aqui
 * (7 coleções, 9 objetos, 10 hipóteses). A nota (Tarefa 6) abre na tela da nota e a coleção (Tarefa 7), no grupo.
 */
export const rotasDoUsuario: Partial<Record<Tipo, (ref: string) => string>> = {
  nota: (ref) => `/nota/${encodeURIComponent(ref)}`,
  // Uma coleção SKC abre como grupo (Tarefa 7): a tela do Grupo reconhece o id `CO-…`.
  colecao: (ref) => `/grupo/${encodeURIComponent(ref)}`,
  // Um objeto SKC (Tarefa 9) abre pelo id: o Item resolve o id (o número provisório pode mudar; o id não).
  objeto: (ref) => `/item/${encodeURIComponent(ref)}`,
  // Um verbete do usuário (decisão 41) abre na página de verbete, como os do pacote.
  verbete: (ref) => `/verbete/${encodeURIComponent(ref)}`,
  // Um sítio (Tarefa 12), novo (`SI-…`) ou do livro com correção (`TESTE-2`), abre a página do sítio.
  sitio: (ref) => `/sitio/${encodeURIComponent(ref)}`,
}

export function rotaDoAcertoDoUsuario(tipo: Tipo, ref: string): string | null {
  return rotasDoUsuario[tipo]?.(ref) ?? null
}

export const ROTULO_DO_TIPO_DO_USUARIO: Partial<Record<Tipo, string>> = {
  nota: 'Nota',
  colecao: 'Coleção',
  sitio: 'Sítio',
  hipotese: 'Hipótese',
  objeto: 'Objeto',
  verbete: 'Verbete',
}
