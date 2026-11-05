import type { ItemDetalhe } from '../banco/tipos'

export const semPonto = (s: string) => s.replace(/\.\s*$/, '')
const ano = (a: number) => (a < 0 ? `${-a} aEC` : `${a} dC`)

/** A datação em português: o campo 4 traduzido, senão o período e os anos. (Item e Comparar.) */
export function textoDaData(d: ItemDetalhe): string | null {
  const campo = d.catalogo.find((c) => c.categoria === 4 && c.texto)
  if (campo) return semPonto(campo.texto!)
  const dt = d.datacoes[0]
  if (!dt) return null
  const periodo = [dt.periodoDe, dt.periodoAte].filter(Boolean).join('–')
  let anos = ''
  if (dt.anoDe !== null && dt.anoAte !== null) anos = dt.anoDe < 0 && dt.anoAte < 0 ? `${-dt.anoDe}–${-dt.anoAte} aEC` : `${ano(dt.anoDe)}–${ano(dt.anoAte)}`
  else if (dt.anoDe !== null) anos = ano(dt.anoDe)
  return [periodo, anos].filter(Boolean).join(', ') || null
}
