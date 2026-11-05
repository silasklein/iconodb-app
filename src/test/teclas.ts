import { fireEvent, waitFor } from '@testing-library/react'
import { atalhoRegistrado, type Contexto } from '../app/atalhos'

/**
 * Aperta uma tecla do catálogo SÓ DEPOIS de o mapa dela estar registrado.
 *
 * As telas registram os atalhos num efeito passivo, que sob carga pode rodar depois de `findBy…` voltar: a tecla apertada
 * nesse intervalo é perdida em silêncio (o teste espera então o prazo inteiro e falha). Aqui a espera é pelo registro
 * (sem apertar a tecla dentro do `waitFor`, para não apertá-la duas vezes); o resultado da tecla o teste espera depois,
 * com `findBy…`/`waitFor`.
 *
 * `tecla` é a do catálogo ("a", "Escape", "Shift+H", "Control+S", "+"); `contexto` é o do mapa que a registra. Devolve o
 * mesmo que `fireEvent.keyDown`: false se alguma ação tomou a tecla (`preventDefault`).
 */
export async function apertarQuandoPronto(tecla: string, contexto: Contexto, alvo: Element | Document = document.body): Promise<boolean> {
  await waitFor(() => expect(atalhoRegistrado(tecla, contexto), `o atalho "${tecla}" (${contexto}) não foi registrado`).toBe(true))
  const { letra, modificadores } = lerTecla(tecla)
  return fireEvent.keyDown(alvo, {
    key: modificadores.includes('Shift') ? letra.toUpperCase() : letra,
    shiftKey: modificadores.includes('Shift'),
    ctrlKey: modificadores.includes('Control'),
    metaKey: modificadores.includes('Meta'),
  })
}

/**
 * A tecla do catálogo em letra e modificadores. O último «+» só separa um modificador quando há texto antes dele: «+»
 * é a própria tecla «+», e «Shift++» é Shift com «+».
 */
export function lerTecla(tecla: string): { letra: string; modificadores: string[] } {
  const i = tecla.length > 1 ? tecla.lastIndexOf('+', tecla.length - 2) : -1
  return i < 0 ? { letra: tecla, modificadores: [] } : { letra: tecla.slice(i + 1), modificadores: tecla.slice(0, i).split('+') }
}
