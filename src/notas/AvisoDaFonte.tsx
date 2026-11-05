import { useState } from 'react'
import { Icon } from '../ui/Icon'
import type { NotaVista } from './indiceDeNotas'
import { useConferencia } from './useConferencia'
import './Notas.css'

/**
 * "O texto da fonte mudou" (spec §7.6): mostrado junto da nota quando o trecho do livro em que ela se apoia já não é o
 * mesmo (ou saiu do pacote). A nota continua legível e ligada; o aviso só pede que se confira com a fonte. "Já conferi"
 * grava o texto de agora como o conferido.
 */
export function AvisoDaFonte({ nota }: { nota: Pick<NotaVista, 'id' | 'ancoras'> }) {
  const { conferencia, conferi } = useConferencia(nota)
  const [falhou, setFalhou] = useState(false)
  if (!conferencia) return null
  const mudou = conferencia.mudaram.length > 0
  const saiu = conferencia.sumiram.length
  return (
    <div className="nota-aviso">
      <Icon name="aviso" size={16} />
      <p role="status" className="nota-aviso-texto">
        {mudou ? (
          <>
            <strong>O texto da fonte mudou</strong> desde que você escreveu esta nota. Confira se ela ainda vale.
            {saiu > 0 && ` ${saiu === 1 ? 'Um trecho também não está mais no pacote.' : `${saiu} trechos também não estão mais no pacote.`}`}
          </>
        ) : (
          <>
            <strong>O trecho da fonte não está mais no pacote</strong>
            {saiu > 1 ? ` (${saiu} trechos)` : ''}. A nota continua aqui; confira se ela ainda vale.
          </>
        )}
        {falhou && ' Não foi possível guardar a conferência; tente de novo.'}
      </p>
      <button
        type="button"
        className="nota-aviso-botao"
        onClick={() => {
          setFalhou(false)
          conferi().catch(() => setFalhou(true))
        }}
      >
        Já conferi
      </button>
    </div>
  )
}
