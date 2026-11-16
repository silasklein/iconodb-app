import type { ReactNode } from 'react'
import { htmlComItalico, textoDeHtmlComItalico } from '../item/Secoes'
import { chicagoDaObra } from './formulario'

/**
 * A referência Chicago de um CSL na tela (a prévia da Nova obra, a obra do usuário, as parecidas). O texto é exatamente o
 * de `chicago()`; o itálico vem de `chicagoHtml()`, desenhado SÓ pelo sanitizador (`htmlComItalico`, que só deixa `<i>`,
 * sem innerHTML). Se o sanitizador mudaria o texto (uma marcação digitada no título, como «<b>»), sai o texto de `chicago()`
 * sem itálico: a prévia nunca mostra outra coisa. Um CSL que não se formata mostra `semChicago`.
 */
export function ReferenciaChicago({ csl, semChicago = null }: { csl: unknown; semChicago?: ReactNode }) {
  const c = chicagoDaObra(csl)
  if (!c) return <>{semChicago}</>
  return <>{textoDeHtmlComItalico(c.html) === c.texto ? htmlComItalico(c.html) : c.texto}</>
}
