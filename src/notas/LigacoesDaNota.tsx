import { Link } from 'react-router'
import { descreverAlvo, rotaDoAlvo } from './alvos'
import type { NotaVista } from './indiceDeNotas'
import { chaveDoAlvo, citacoesDe, type TipoDeRef } from './links'
import { useAlvosDe } from './useAlvos'
import './Notas.css'

type Alvo = { tipo: TipoDeRef; ref: string; rotulo?: string | null }

/**
 * "Ligada a" (o que a nota cita) e "Aparece em" (onde ela aparece como link reverso: o alvo dela e tudo o que ela cita),
 * no pé da nota (Nota.dc.html, PC-Notas.dc.html).
 */
export function LigacoesDaNota({ nota }: { nota: Pick<NotaVista, 'texto' | 'alvoTipo' | 'alvo'> }) {
  const citados: Alvo[] = citacoesDe(nota.texto)
  const dono: Alvo | null = nota.alvoTipo && nota.alvo ? { tipo: nota.alvoTipo, ref: nota.alvo } : null
  const aparece: Alvo[] = [...new Map([...citados, ...(dono ? [dono] : [])].map((a) => [chaveDoAlvo(a.tipo, a.ref), a])).values()]
  const resolvidos = useAlvosDe(aparece)
  if (aparece.length === 0) return null
  const item = (a: Alvo) => {
    const r = resolvidos.get(chaveDoAlvo(a.tipo, a.ref))
    const nome = a.rotulo ?? descreverAlvo(a.tipo, a.ref, r)
    const rota = r ? r.rota : rotaDoAlvo(a.tipo, a.ref)
    return rota && r?.existe !== false ? (
      <Link className="nota-link" to={rota}>
        {nome}
      </Link>
    ) : (
      <span>{nome}</span>
    )
  }
  const lista = (alvos: Alvo[]) =>
    alvos.map((a, i) => (
      <span key={chaveDoAlvo(a.tipo, a.ref)}>
        {i > 0 && ', '}
        {item(a)}
      </span>
    ))
  return (
    <section className="nota-ligacoes" aria-label="Ligações da nota">
      <dl>
        {citados.length > 0 && (
          <div>
            <dt>Ligada a</dt>
            <dd>{lista(citados)}</dd>
          </div>
        )}
        <div>
          <dt>Aparece em</dt>
          <dd>{lista(aparece)}</dd>
        </div>
      </dl>
    </section>
  )
}
