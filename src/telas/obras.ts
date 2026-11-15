import { textoDeObjetos } from '../ui/numero'

/** A obra (publicação + volume) como aparece nas abas das Coleções e na trilha do Grupo. */
export const chaveDaObra = (publicacao: string, volume: string) => (volume ? `${publicacao}-${volume}` : publicacao)
export const rotuloDaObra = (publicacao: string, volume: string) => `${publicacao} ${volume}`.trim()

/** O endereço do grupo `pai` com a subcoleção `sub` escolhida (o grupo dividido do computador); sem `sub`, «Todos». */
export const caminhoNoGrupo = (pai: string, sub?: string | null) =>
  `/grupo/${encodeURIComponent(pai)}${sub ? `?sub=${encodeURIComponent(sub)}` : ''}`

// O título de um grupo de cima (decisão 81) mora num módulo neutro, que a camada de dados também usa (a origem dos
// casos da Revisão e os rótulos das notas); as telas continuam a importá-lo daqui.
export { tituloDoGrupo, type GrupoComTitulo, type TituloDoLivro } from '../ui/tituloDoGrupo'

/** O nome acessível de uma subcoleção na lista e no anúncio da troca: «1.2–1.3 Figuras de prova…, 1 objeto». */
export const rotuloDaSubcolecao = (s: { numero: string; titulo: string; objetos: number }) => `${s.numero} ${s.titulo}, ${textoDeObjetos(s.objetos)}`
