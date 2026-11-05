/**
 * O estado do roteador com que se chega ao item vindo de uma coleção SKC: a lista dos objetos NA ORDEM DA COLEÇÃO
 * (o "anterior / próximo" do item segue a ordem que o usuário escolheu) e a coleção como origem do "Voltar".
 * É o mesmo formato do resultado de uma busca (`EstadoVindoDaBusca`), com `origem.colecao: true`.
 */
import { estadoDoResultado, type EstadoVindoDaBusca } from '../busca/url'

export const caminhoDaColecao = (id: string): string => `/grupo/${encodeURIComponent(id)}`

export function estadoDaColecao(id: string, nome: string, numeros: readonly string[], aberto?: string): EstadoVindoDaBusca {
  const base = estadoDoResultado(numeros, caminhoDaColecao(id), aberto)
  return { ...base, origem: { rotulo: nome || 'Coleção sem nome', caminho: base.origem.caminho, colecao: true } }
}
