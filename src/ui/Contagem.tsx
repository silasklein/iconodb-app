import { numeroPtBr } from './usePendencias'

/**
 * Um número solto numa lista ("3" objetos): o texto escondido dá a unidade ao leitor de tela
 * ("3 objetos"), sem mudar o desenho.
 */
export function Contagem({ n, um, varios, className = 'lista-n' }: { n: number; um: string; varios: string; className?: string }) {
  return (
    <span className={className}>
      {numeroPtBr(n)}
      <span className="so-leitor"> {n === 1 ? um : varios}</span>
    </span>
  )
}
