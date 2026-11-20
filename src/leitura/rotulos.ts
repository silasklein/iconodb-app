/**
 * As etiquetas do tipo do passo da leitura de uma obra de catálogo (plano «O IPIAO lido no formato do §»): junto do título e
 * no pé da página de leitura (Tarefa 4) e na linha da página de introdução achada pela busca (Tarefa 5, desenho 3).
 */
import type { TipoDeTexto } from './ordem'

export const ROTULO_DO_TIPO: Record<TipoDeTexto | 'entrada', string> = {
  'introducao-geral': 'Introdução geral',
  panorama: 'Panorama do período',
  grupo: 'Introdução do grupo',
  subcolecao: 'Introdução da subcoleção',
  entrada: 'Entrada do catálogo',
}
