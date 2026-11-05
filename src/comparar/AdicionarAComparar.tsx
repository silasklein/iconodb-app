import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { acrescentarABandeja } from './operacoes'
import { useBandeja } from './useBandeja'
import './AdicionarAComparar.css'

type Aviso = { tipo: 'entrou' | 'ja-estava' | 'cheia' | 'falhou' }

const TEMPO_DO_AVISO_MS = 8000

/**
 * "Comparar (2/4)" no Item e no objeto SKC (Shift+C): põe o objeto na bandeja de comparação. O que acontece vira uma
 * mensagem, em linguagem simples: entrou, já estava (não grava nada) ou a bandeja está cheia (não grava nada; a mensagem
 * oferece abrir Comparar para tirar um). `nome` é como a mensagem chama o objeto ("CA00019").
 */
export function useAdicionarAComparar(ref: string, nome: string): { rotulo: string; adicionar: () => void; aviso: ReactNode } {
  const bandeja = useBandeja()
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const adicionar = useCallback(() => {
    acrescentarABandeja(ref).then(
      (e) => setAviso({ tipo: e.tipo }),
      () => setAviso({ tipo: 'falhou' }),
    )
  }, [ref])
  // A mensagem espera um pouco e some, menos a de bandeja cheia, que pede uma decisão e fica até ser fechada.
  useEffect(() => {
    if (!aviso || aviso.tipo === 'cheia') return
    const t = setTimeout(() => setAviso(null), TEMPO_DO_AVISO_MS)
    return () => clearTimeout(t)
  }, [aviso])
  return {
    rotulo: `Comparar (${bandeja.contador})`,
    adicionar,
    aviso: <AvisoDaComparacao aviso={aviso} nome={nome} contador={bandeja.contador} aoFechar={() => setAviso(null)} />,
  }
}

function texto(a: Aviso, nome: string, contador: string): string {
  switch (a.tipo) {
    case 'entrou':
      return `${nome} entrou na comparação (${contador}).`
    case 'ja-estava':
      return `${nome} já está na comparação.`
    case 'cheia':
      return 'A comparação já tem 4 objetos. Abra Comparar para tirar um.'
    case 'falhou':
      return 'Não foi possível guardar; tente de novo.'
  }
}

/** A região viva existe sempre (vazia sem aviso), para o leitor de tela anunciar quando o texto chega. */
function AvisoDaComparacao({ aviso, nome, contador, aoFechar }: { aviso: Aviso | null; nome: string; contador: string; aoFechar: () => void }) {
  return (
    <div className={`aviso-comparar${aviso ? ' aviso-comparar-visivel' : ''}`} role="status" aria-label="Mensagem da comparação">
      {aviso && (
        <>
          <span>{texto(aviso, nome, contador)}</span>
          <span className="aviso-comparar-acoes">
            {aviso.tipo !== 'falhou' && (
              <Link className="aviso-comparar-botao" to="/comparar" onClick={aoFechar}>
                Abrir Comparar
              </Link>
            )}
            <button type="button" className="aviso-comparar-botao" onClick={aoFechar}>
              Fechar
            </button>
          </span>
        </>
      )}
    </div>
  )
}
