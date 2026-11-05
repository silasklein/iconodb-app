import { formaNoTexto } from '../item/trechos'
import type { FormaDoPacote } from './formasDoPacote'

/** O que mostrar: o texto, a dica (`data-tip`) e o nome acessível do termo (null: sem forma em uso, nada a dizer). */
export interface TermoExibido {
  texto: string
  dica: string | null
  nome: string | null
  /** A mesma informação como frase própria («na tradução: X» / «forma em uso: X»), para o leitor de tela dentro de uma âncora (sem cortar o `nome`). */
  apoio: string | null
}

/**
 * O que um termo mostra no texto corrido quando o usuário deu uma forma em uso (revisão 1 da Tarefa 11, I1). Na tradução o
 * trecho do termo é a forma FLEXIONADA da frase ("leões-de-teste"), não a do pacote; trocá-lo pela forma em uso
 * estragaria a concordância ao redor. A regra é a do `refresh_terms` do pipeline (`forma_corrente`: `pt_text` quando existe,
 * senão `pt`; sem diferenciar caixa, mas diferenciando diacríticos):
 * - o trecho é igual (sem caixa) ao `pt` do pacote E o verbete não tem `pt_text` próprio (distinto do `pt`): o trecho
 *   mostra a forma em uso (com a maiúscula do começo, se o trecho a tinha);
 * - senão o trecho fica como foi escrito e a dica e o nome acessível trazem a forma em uso ("Forma em uso: X"). Também quando
 *   o verbete do pacote não está à mão (o texto nunca é trocado no escuro).
 * Quando o trecho É trocado, a dica e o nome acessível dizem o que o tradutor escreveu ("Na tradução: X"): a regra não vê
 * gênero nem número, e o leitor não deve achar que a frase é toda do tradutor.
 * Só o que se vê: as posições e o texto guardado não mudam.
 */
export function exibirTermo(guardado: string, formaEmUso: string | undefined, pacote: FormaDoPacote | undefined): TermoExibido {
  if (formaEmUso === undefined) return { texto: guardado, dica: null, nome: null, apoio: null }
  const proprio = !!pacote?.ptTexto && pacote.ptTexto !== pacote.pt
  const igual = !!pacote?.pt && guardado.toLocaleLowerCase('pt') === pacote.pt.toLocaleLowerCase('pt')
  if (!proprio && igual) {
    const texto = formaNoTexto(guardado, formaEmUso)
    // Trocar o trecho pode mudar o gênero ou o número ("o leão-de-teste" → "o cria de leão"): o que o tradutor escreveu fica à vista.
    return { texto, dica: `Na tradução: ${guardado}`, nome: `${texto} (na tradução: ${guardado})`, apoio: `na tradução: ${guardado}` }
  }
  return { texto: guardado, dica: `Forma em uso: ${formaEmUso}`, nome: `${guardado} (forma em uso: ${formaEmUso})`, apoio: `forma em uso: ${formaEmUso}` }
}
