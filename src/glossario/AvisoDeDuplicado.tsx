import { Link } from 'react-router'
import type { ParecidoNoGlossario } from './doUsuario'
import './Glossario.css'

/**
 * "Possível duplicado" na página de um verbete (do usuário ou do livro): com quem pode ser o mesmo termo, com links. O texto
 * fala conforme os verbetes envolvidos: um verbete seu se exclui ou se renomeia; um do livro só se renomeia.
 */
export function AvisoDeDuplicado({ parecidos, doUsuario }: { parecidos: readonly ParecidoNoGlossario[]; doUsuario: boolean }) {
  if (parecidos.length === 0) return null
  const algumSeu = parecidos.some((p) => p.doUsuario)
  const lista = parecidos.map((d, i) => (
    <span key={d.id}>
      {i > 0 && ', '}
      <Link to={`/verbete/${encodeURIComponent(d.id)}`}>{d.nome}</Link>
      {d.doUsuario ? ' (seu)' : ' (dos livros)'}
    </span>
  ))
  return (
    <aside role="note" aria-label="Possível duplicado" className="verbete-duplicado">
      <p>
        {doUsuario ? (
          <>
            Pode ser o mesmo termo que {lista}. Confira, e exclua ou renomeie o seu; as hipóteses seguem com o nome que têm.
          </>
        ) : algumSeu ? (
          <>
            Tem a mesma forma que {lista}. Renomeie um dos dois, ou exclua o seu: um verbete dos livros não se exclui.
          </>
        ) : (
          <>
            Tem a mesma forma que {lista}. Renomeie um dos dois: um verbete dos livros não se exclui.
          </>
        )}
      </p>
    </aside>
  )
}
