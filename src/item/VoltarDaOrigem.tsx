import { Link } from 'react-router'
import { useAoVoltarParaOrigem } from '../app/OrigemDosLinks'
import type { VoltarDaOrigem as Origem } from '../app/voltar'
import './VoltarDaOrigem.css'

/**
 * O «‹ Verbete: leão-de-teste» da página do objeto (decisão 85), no celular e no computador: o nome da tela de onde se veio,
 * que volta no histórico para ela (como estava) ou, se a entrada anterior não é ela, vai ao caminho. O «‹» fica fora do
 * nome acessível; o espaço depois dele vem do `gap` (num flex, o espaço dentro do span some; add45b1).
 */
export function VoltarDaOrigem({ voltar }: { voltar: Origem }) {
  const aoClicar = useAoVoltarParaOrigem(voltar)
  return (
    <nav aria-label="Origem" className="item-volta-nav">
      <Link className="item-volta" to={voltar.caminho} onClick={aoClicar}>
        <span aria-hidden="true">‹</span>
        {voltar.rotulo}
      </Link>
    </nav>
  )
}
