import { useNavigate } from 'react-router'
import { useAtualizandoOsLivros, type Novidade } from '../pacote/novidade'
import './FaixaDosLivros.css'

/** «Há uma versão nova dos livros no Dropbox: IPIAO I–IV.» (com os livros, se o manifesto os nomeia). */
export function textoDaNovidade(n: Extract<Novidade, { tipo: 'nova' }>): string {
  return n.rotulos.length > 0 ? `Há uma versão nova dos livros no Dropbox: ${n.rotulos.join(', ')}.` : 'Há uma versão nova dos livros no Dropbox.'
}

/**
 * A faixa do pacote novo (Início e Sincronização): «Atualizar os livros» leva a /preparando, que baixa só o que mudou e
 * volta ao Início. Só aparece com novidade (nunca com «incompativel» nem «desconhecida»); some durante o download
 * (marcarAtualizando) e depois dele (marcarEmDia).
 */
export function FaixaDosLivros({ novidade }: { novidade: Novidade | null }) {
  const navegar = useNavigate()
  const atualizando = useAtualizandoOsLivros()
  if (novidade?.tipo !== 'nova' || atualizando) return null
  return (
    <div className="faixa-livros" role="status">
      <p>{textoDaNovidade(novidade)}</p>
      <button type="button" className="faixa-livros-acao" onClick={() => navegar('/preparando', { state: { atualizar: true } })}>
        Atualizar os livros
      </button>
    </div>
  )
}
