import { pendencias } from '../banco/consultas'
import { AvisoDeErro } from '../ui/AvisoDeErro'
import { TopoDoCelular } from '../ui/TopoDoCelular'
import { useCarregar } from '../ui/useCarregar'
import { numeroPtBr } from '../ui/usePendencias'
import './Estado.css'
import './Revisao.css'

/**
 * Revisão, só leitura (2A): quantos casos a fila tem e de que tipo. Resolver e Deixar como está
 * (Revisao.dc.html, PC-Revisao.dc.html) chegam na próxima versão.
 */
export function Revisao() {
  const carga = useCarregar(() => pendencias())
  return (
    <div className="pagina-consulta">
      <TopoDoCelular voltar={{ href: '#/' }} />
      <main className="pagina-consulta-corpo">
        <h1>Revisão</h1>
        {carga.fase === 'erro' && <AvisoDeErro erro={carga.erro} />}
        {carga.fase === 'ok' && (
          <>
            <p className="pagina-consulta-apoio">
              {numeroPtBr(carga.dados.total)} {carga.dados.total === 1 ? 'caso' : 'casos'} · o que o processamento não decidiu sozinho
            </p>
            {carga.dados.porTipo.length === 0 ? (
              <p className="pagina-consulta-vazio">Nada a revisar.</p>
            ) : (
              <ul className="revisao-tipos" aria-label="Casos por tipo">
                {carga.dados.porTipo.map((t) => (
                  <li key={t.tipo}>
                    <span>{t.rotulo}</span>
                    <span className="codigo">{numeroPtBr(t.quantidade)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="pagina-consulta-apoio revisao-nota">Resolver e Deixar como está: na próxima versão.</p>
          </>
        )}
      </main>
    </div>
  )
}
