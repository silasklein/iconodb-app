import { useState } from 'react'
import type { Faceta } from '../busca/consulta'
import './Facetas.css'

const VISIVEIS = 5

interface Props {
  facetas: Faceta[]
  /** Liga ou desliga um valor de filtro. */
  aoAlternar: (chave: Faceta['chave'], valor: string) => void
}

/** Filtros por faceta: caixas de marcar com a contagem (PC-Busca.dc.html). Dentro de uma faceta, OU. */
export function Facetas({ facetas, aoAlternar }: Props) {
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set())
  return (
    <>
      {facetas.map((f) => {
        const todas = abertas.has(f.chave)
        const visiveis = todas ? f.opcoes : f.opcoes.filter((o, i) => i < VISIVEIS || o.ativa)
        const escondidas = f.opcoes.length - visiveis.length
        return (
          <fieldset className="faceta" key={f.chave}>
            <legend>{f.rotulo}</legend>
            {visiveis.map((o) => (
              <label className={`faceta-opcao${o.n === 0 && !o.ativa ? ' faceta-zero' : ''}`} key={o.valor}>
                <span className="faceta-nome">
                  <input type="checkbox" checked={o.ativa} onChange={() => aoAlternar(f.chave, o.valor)} />
                  <span>{o.rotulo}</span>
                </span>
                <span className="faceta-n codigo">{o.n.toLocaleString('pt-BR')}</span>
              </label>
            ))}
            {(escondidas > 0 || (todas && f.opcoes.length > VISIVEIS)) && (
              <button
                type="button"
                className="faceta-mais"
                aria-expanded={todas}
                onClick={() => setAbertas((a) => (todas ? new Set([...a].filter((c) => c !== f.chave)) : new Set([...a, f.chave])))}
              >
                {todas ? 'Mostrar menos' : `Mais ${escondidas}`}
              </button>
            )}
          </fieldset>
        )
      })}
    </>
  )
}
