import { TopoDoCelular } from '../ui/TopoDoCelular'
import './Estado.css'

/** Minhas notas até a 2B: só o estado vazio (as notas são escritas na 2B). */
export function MinhasNotas() {
  return (
    <div className="pagina-consulta">
      <TopoDoCelular voltar={{ href: '#/' }} />
      <main className="pagina-consulta-corpo">
        <h1>Minhas notas</h1>
        <p className="pagina-consulta-vazio">As suas notas chegam na próxima versão</p>
      </main>
    </div>
  )
}
