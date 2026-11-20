import { numeroPtBr } from '../ui/numero'
import { CHAVE_FORA, FILTROS_DE_REGIAO, NOME_FORA } from './regioes'
import './FiltroDeRegioes.css'

interface Props {
  /** Quantos sítios há em cada região (o total, sem o filtro de texto); null enquanto os sítios carregam. */
  contagens: ReadonlyMap<string, number> | null
  /** null enquanto os sítios carregam. */
  total: number | null
  ativas: ReadonlySet<string>
  aoAlternar: (id: string) => void
  aoLimpar: () => void
}

/**
 * Os filtros de região (decisão 36; chips de SitiosMapa.dc.html e PC-SitiosMapa.dc.html): «Todas» e uma etiqueta por região,
 * mais «Sem coordenada». As etiquetas se combinam (união) e filtram a lista e o mapa. Uma região sem nenhum sítio ainda é
 * tracejada. «Fora das regiões» só aparece se há um sítio (do usuário) em coordenada fora de todos os polígonos.
 * Enquanto os sítios carregam (Tarefa 6c), os chips ficam sem número e sem tracejado («Todas 0» dizia que não havia nenhum),
 * e o grupo fica `aria-busy`.
 */
export function FiltroDeRegioes({ contagens, total, ativas, aoAlternar, aoLimpar }: Props) {
  const carregando = contagens === null || total === null
  const filtros = [...FILTROS_DE_REGIAO, ...((contagens?.get(CHAVE_FORA) ?? 0) > 0 ? [{ id: CHAVE_FORA, nome: NOME_FORA }] : [])]
  const sitios = (n: number) => `${numeroPtBr(n)} ${n === 1 ? 'sítio' : 'sítios'}`
  return (
    <div className="regioes-filtro" role="group" aria-label="Filtrar por região" aria-busy={carregando || undefined}>
      <button
        type="button"
        className="regiao-chip hit"
        aria-pressed={ativas.size === 0}
        aria-label={carregando ? 'Todas, carregando' : `Todas, ${sitios(total)}`}
        onClick={aoLimpar}
      >
        Todas
        {!carregando && <span className="regiao-chip-n">{numeroPtBr(total)}</span>}
      </button>
      {filtros.map((f) => {
        const n = contagens?.get(f.id) ?? 0
        const vazia = !carregando && n === 0
        return (
          <button
            key={f.id}
            type="button"
            className={`regiao-chip hit${vazia ? ' regiao-chip-vazia' : ''}`}
            aria-pressed={ativas.has(f.id)}
            aria-label={carregando ? f.nome : vazia ? `${f.nome}, 0 sítios (nenhum ainda)` : `${f.nome}, ${sitios(n)}`}
            data-regiao={f.id}
            onClick={() => aoAlternar(f.id)}
          >
            {f.nome}
            {!carregando && <span className="regiao-chip-n">{numeroPtBr(n)}</span>}
          </button>
        )
      })}
    </div>
  )
}
