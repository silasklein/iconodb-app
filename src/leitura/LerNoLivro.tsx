/**
 * Os caminhos de entrada na leitura de uma obra de catálogo (plano «O IPIAO lido no formato do §», Tarefa 5; desenho 3): o
 * botão que abre um passo da leitura («Ler o livro» nas Coleções, «Ler no livro» no Grupo, na Subcoleção e no Objeto) e o
 * gancho que acha a rota do passo. Fora das obras de leitura (o livro em parágrafos, a tradução) não há rota, e nada aparece.
 */
import { LinkComOrigem } from '../app/OrigemDosLinks'
import { Icon } from '../ui/Icon'
import { useCarregar } from '../ui/useCarregar'
import './LerNoLivro.css'

/**
 * A rota que `achar(chave)` dá (`passoDoGrupo`, `passoDoItem`…), quando chega; null enquanto carrega, sem rota ou com erro (o
 * botão não aparece). Sem `chave`, não busca.
 */
export function useRotaDaLeitura(achar: (chave: string) => Promise<string | null>, chave: string | null): string | null {
  const carga = useCarregar(() => (chave === null ? Promise.resolve(null) : achar(chave)), chave ?? '')
  return carga.fase === 'ok' ? carga.dados : null
}

interface Props {
  /** A rota do passo (`/ler/…`). */
  para: string
  rotulo: string
  /** O botão cheio (o do Grupo e da Subcoleção, ao lado de «Ler a introdução»); sem ele, só o contorno. */
  cheio?: boolean
  /** O nome para o leitor de tela, quando o rótulo à vista não basta (a subcoleção ao lado do grupo). */
  rotuloAcessivel?: string
}

/**
 * O botão leva a origem (decisão 85) quando está dentro de uma tela de origem (`OrigemDosLinks`: o objeto); fora dela (Coleções,
 * Grupo, Subcoleção) vai sem, e a leitura volta ao grupo do passo.
 */
export function BotaoDaLeitura({ para, rotulo, cheio = false, rotuloAcessivel }: Props) {
  return (
    <LinkComOrigem className={cheio ? 'ler-no-livro ler-no-livro-cheio' : 'ler-no-livro'} to={para} aria-label={rotuloAcessivel}>
      <Icon name="glossario" size={18} />
      <span>{rotulo}</span>
    </LinkComOrigem>
  )
}
