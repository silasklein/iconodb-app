import { Link } from 'react-router'
import { ROTULO_DA_MODALIDADE, ROTULO_DO_NIVEL } from '../item/rotulos'
import { useDonosDosTrechos } from '../hipoteses/garantirDonos'
import { objetoDaHipotese, type HipoteseSkc } from '../hipoteses/modelo'
import { useNumeracao } from '../objetos-skc/atual'
import '../telas/Lista.css'
import '../imagens-usuario/MarcaSkc.css'
import './Glossario.css'

/**
 * As hipóteses SKC que usam um termo, uma linha cada (a página do verbete do usuário e a do verbete do livro): o
 * número do objeto onde a hipótese aparece (o dono da leitura SKC em que está ancorada, revisão 3, M13), a citação ou
 * o "sobre", e "nível · certeza · SKC". Cada linha leva ao objeto, com a hipótese aberta.
 */
export function LinhasDeHipoteseSkc({ hipoteses }: { hipoteses: readonly HipoteseSkc[] }) {
  const numeracao = useNumeracao()
  useDonosDosTrechos() // refaz quando o pacote diz de que objeto é o trecho de uma hipótese (T17-B-4)
  return (
    <>
      {hipoteses.map((h) => {
        const objeto = objetoDaHipotese(h)
        const numero = objeto ? (objeto.startsWith('OB-') ? (numeracao.porId.get(objeto)?.numero ?? null) : objeto) : null
        const sobre = h.sobre.tipo === 'elemento' ? h.sobre.rotulo || 'região' : 'objeto inteiro'
        const meta = [h.nivel ? ROTULO_DO_NIVEL[h.nivel].toLowerCase() : 'sem nível', h.modalidade ? ROTULO_DA_MODALIDADE[h.modalidade] : null].filter(Boolean).join(' · ')
        const textos = (
          <>
            <span className="codigo">{numero ?? 'SKC'}</span>
            <span className="hipotese-textos">
              {h.ancora ? <span className="hipotese-citacao" lang={h.ancora.lingua === 'de' ? 'de' : undefined}>{`»${h.ancora.trecho}«`}</span> : <span className="hipotese-citacao">{sobre}</span>}
              <span className="hipotese-meta">
                {`${meta} · `}
                <span className="marca-skc">SKC</span>
              </span>
            </span>
          </>
        )
        return objeto ? (
          <Link key={h.id} className="hipotese-linha" to={`/item/${encodeURIComponent(objeto)}?hipotese=${encodeURIComponent(h.id)}`}>
            {textos}
          </Link>
        ) : (
          <div key={h.id} className="hipotese-linha">
            {textos}
          </div>
        )
      })}
    </>
  )
}
