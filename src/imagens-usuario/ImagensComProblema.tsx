/**
 * "Imagens que não subiram" (tela de Sincronização): as imagens paradas por um erro que não passa sozinho (outro
 * conteúdo no mesmo caminho do Dropbox, arquivo grande demais, cópia local sumida). A sincronização não as tenta mais
 * sozinha; "Tentar de novo" as devolve à fila e sincroniza (fila.ts). Para a cópia local sumida, tentar de novo nunca
 * resolve: a ação é "Remover da fila" (tira a pasta local; o registro da imagem fica).
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { sincronizarAgora } from '../usuario/useSincronizacao'
import { assinarFila, imagensComProblema, removerDaFila, tentarImagemDeNovo, type ImagemComProblema } from './fila'

export function ImagensComProblema({ variante = 'tela' }: { variante?: 'tela' | 'painel' }) {
  const [lista, setLista] = useState<ImagemComProblema[]>([])
  const [falha, setFalha] = useState<string | null>(null)
  const carregar = useCallback(() => {
    void imagensComProblema().then(setLista, () => setLista([]))
  }, [])
  useEffect(() => {
    carregar()
    return assinarFila(carregar)
  }, [carregar])
  if (lista.length === 0) return null
  const id = `sync-imagens-${variante}`
  const remover = async (img: ImagemComProblema) => {
    setFalha(null)
    try {
      await removerDaFila(img.id)
      carregar()
    } catch {
      setFalha('Não foi possível tirar a imagem da fila; tente outra vez.')
    }
  }
  const temRepetivel = lista.some((i) => i.causa !== 'copia-ausente')
  const deNovo = async (img: ImagemComProblema) => {
    setFalha(null)
    try {
      await tentarImagemDeNovo(img.id)
      carregar()
      void sincronizarAgora('manual')
    } catch {
      setFalha('Não foi possível pôr a imagem na fila de novo; tente outra vez.')
    }
  }
  return (
    <section className={`sync-secao sync-secao-${variante}`} aria-labelledby={id}>
      <h2 id={id}>Imagens que não subiram</h2>
      <ul className="sync-detalhes">
        {lista.map((img) => (
          <li key={img.id}>
            <span className="sync-detalhe-titulo">
              <Link to={`/item/${encodeURIComponent(img.alvo)}`}>{img.alvo}</Link>
              {img.nome ? ` · ${img.nome}` : ''}
            </span>
            <span className="sync-detalhe-motivo">{img.mensagem}</span>
            {img.causa === 'copia-ausente' ? (
              <>
                <span className="sync-detalhe-motivo">
                  O registro da imagem fica (a marca e o crédito continuam no objeto); se o arquivo já estiver no Dropbox ou no outro aparelho, ele continua lá. Remover da fila só tira daqui a pasta incompleta.
                </span>
                <button type="button" className="sync-tentar" aria-label={`Remover da fila: ${img.nome || img.id}`} onClick={() => void remover(img)}>
                  Remover da fila
                </button>
              </>
            ) : (
              <button type="button" className="sync-tentar" aria-label={`Tentar de novo: ${img.nome || img.id}`} onClick={() => void deNovo(img)}>
                Tentar de novo
              </button>
            )}
          </li>
        ))}
      </ul>
      {falha && (
        <p className="sync-nota" role="alert">
          {falha}
        </p>
      )}
      {temRepetivel && <p className="sync-nota">Com "Tentar de novo", a imagem (que continua neste aparelho e no objeto) volta a subir; sozinha, ela não tenta mais.</p>}
    </section>
  )
}
