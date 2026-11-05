/**
 * As regiões que a pessoa marca numa imagem (registros `regiao` da camada do usuário), no formato do item e do
 * visualizador, para acenderem como as do livro. O formato congelado dos campos (para o porte em Python) está em
 * src/hipoteses/modelo.ts (Tarefa 10), que grava e lê as regiões; aqui só se lê o que a tela precisa.
 *
 * Campos lidos:
 *   imagem     o id da imagem (IM-… do usuário, ou o id de uma imagem do livro)
 *   seletor    `<polygon points="x,y …"/>`, coordenadas de 0 a 1 (o formato R4 do banco)
 *   elemento   o nome do elemento ("leão de teste")
 *   elementoId opcional: o id do elemento (do livro ou do usuário), para acender com a hipótese aberta; um valor que
 *              não é id de elemento vale como ausente (a região é o próprio elemento)
 * As coordenadas ficam dentro de 0 a 1 (dados de outro aparelho). Tudo pelo leitor único, `lerRegiao` (revisão 3, M8).
 */
import type { Regiao } from '../banco/tipos'
import { lerRegiao } from '../hipoteses/modelo'
import type { Estado } from '../usuario/estado'

/** As regiões vivas desta imagem, com polígono, no formato das do livro (lidas por `lerRegiao`, o leitor único; M8). */
export function regioesDoUsuario(estado: Estado, imagemId: string): Regiao[] {
  const mapa = estado.registros.get('regiao')
  if (!mapa) return []
  const saida: Regiao[] = []
  for (const r of mapa.values()) {
    if (r.excluido || r.campos.imagem !== imagemId) continue
    const g = lerRegiao(r)
    if (g.pontos.length < 3) continue
    const elemento = g.elemento || 'região'
    saida.push({ id: g.id, elementoId: g.elementoId, elemento, elementoDe: elemento, selector: g.seletor, pontos: g.pontos })
  }
  return saida.sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1))
}
