import { Link } from 'react-router'
import type { SitioParecido } from './doUsuario'
import './Sitios.css'

/**
 * "Possível duplicado" (Tarefa 12): um nome ou grafia que, pela dobra de sempre, já é de outro sítio, do livro ou do usuário.
 * Não bloqueia nada: diz com quem se parece, com o link, e a pessoa decide. Mesmo tom do aviso dos verbetes (Tarefa 11, m4):
 * um sítio seu se exclui ou se renomeia; um dos livros só se corrige.
 *
 * `quando`: 'novo' (o sítio ainda não existe: "use o que já existe") ou 'existente' (renomear: "renomeie um dos dois").
 */
export function AvisoDeSitioParecido({ parecidos, quando }: { parecidos: readonly SitioParecido[]; quando: 'novo' | 'existente' }) {
  if (parecidos.length === 0) return null
  const algumSeu = parecidos.some((p) => p.doUsuario)
  const lista = parecidos.map((p, i) => (
    <span key={p.id}>
      {i > 0 && ', '}
      <Link to={`/sitio/${encodeURIComponent(p.id)}`}>{p.nome}</Link>
      {p.doUsuario ? ' (seu)' : ' (dos livros)'}
    </span>
  ))
  return (
    <aside role="note" aria-label="Possível duplicado" className="sitio-duplicado">
      <p>
        {quando === 'novo' ? (
          <>
            Já existe um sítio com este nome ou grafia: {lista}. Se é o mesmo lugar, use esse em vez de criar outro; se é outro lugar, siga: este aviso não bloqueia.
          </>
        ) : algumSeu ? (
          <>
            Pode ser o mesmo sítio que {lista}. Confira: renomeie um dos dois, ou exclua o seu; um sítio dos livros só se corrige.
          </>
        ) : (
          <>
            Tem o mesmo nome que {lista}. Renomeie este sítio, ou use o dos livros: um sítio dos livros não se exclui, só se corrige.
          </>
        )}
      </p>
    </aside>
  )
}
