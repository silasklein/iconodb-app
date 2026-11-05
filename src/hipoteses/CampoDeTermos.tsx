import { useCallback, useMemo, useState } from 'react'
import { aoReabrir } from '../banco/cliente'
import { verbetes } from '../banco/consultas'
import type { VerbeteDaLista } from '../banco/tipos'
import { useFormasEmUso, useNomeVivo, useVerbetesSkc } from '../glossario/doUsuario'
import { chaveDaForma, normalizarForma, ROTULO_DO_STATUS } from '../glossario/modelo'
import { CampoDeEscolha, type OpcaoDeEscolha } from '../objetos-skc/CampoDeEscolha'
import { Icon } from '../ui/Icon'
import { useCarregar } from '../ui/useCarregar'
import { PREFIXO_DO_TERMO_NOVO, termoNovo, type TermoEscolhido } from './modelo'
import './Hipoteses.css'

// A lista dos verbetes (uma consulta) vale até o pacote ser reaberto.
let pedido: Promise<VerbeteDaLista[]> | null = null
let ouvindo = false
function listaDeVerbetes(): Promise<VerbeteDaLista[]> {
  if (!ouvindo) {
    ouvindo = true
    aoReabrir(() => {
      pedido = null
    })
  }
  pedido ??= verbetes().catch((e: unknown) => {
    pedido = null
    throw e
  })
  return pedido
}

/** Só nos testes: esquece a lista guardada. */
export function esquecerListaDeVerbetes(): void {
  pedido = null
}

interface Props {
  termos: readonly TermoEscolhido[]
  aoMudar: (termos: TermoEscolhido[]) => void
  /** O erro "Escolha pelo menos um termo." (id para aria-describedby). */
  erro?: string | null
}

/** Uma opção com as chaves de todas as formas dela (para achar a "mesma" forma sem caixa e sem acento). */
interface Candidato {
  opcao: OpcaoDeEscolha
  chaves: string[]
}

/**
 * "Termo" da nova hipótese (NovaHipotese.dc.html): os verbetes escolhidos em pílulas (× tira) e o campo que busca no
 * glossário do pacote e nos verbetes do usuário (sem acento, sem caixa; português, alemão e inglês). A hipótese liga
 * uma identificação a termos do vocabulário (spec §4, camada 3).
 *
 * Decisão 41: quando o que foi digitado não é nenhum verbete, a última opção é "Criar termo «…»" (↓/↑ e Enter, como as
 * outras): a forma normalizada (NFC, espaços) vira uma pílula "novo", e o verbete do usuário só é gravado ao registrar
 * (src/hipoteses/operacoes.ts). Se a forma é a de um verbete que existe (do livro ou do usuário; sem caixa e sem acento),
 * esse vem primeiro e "Criar" não aparece. Sem o glossário dos livros (a consulta falhou), um aviso em linha e ainda dá
 * para criar o termo. Enquanto o glossário carrega, "Criar" espera (para não repetir um verbete dos livros).
 */
export function CampoDeTermos({ termos, aoMudar, erro = null }: Props) {
  const [texto, setTexto] = useState('')
  const carga = useCarregar(listaDeVerbetes, 'verbetes')
  const doUsuario = useVerbetesSkc()
  const formas = useFormasEmUso()
  const nomeDe = useNomeVivo()

  const candidatos = useMemo<Candidato[]>(() => {
    const dosLivros: Candidato[] =
      carga.fase === 'ok'
        ? carga.dados.map((v) => {
            // A forma em uso (Tarefa 11) é o rótulo; a do pacote ainda acha o verbete.
            const emUso = formas.get(v.id)
            return {
              // O apoio diz a forma de antes, que também acha a opção (o campo filtra pelo rótulo e pelo apoio).
              opcao: { id: v.id, rotulo: emUso ?? v.pt ?? v.de ?? v.id, apoio: [emUso && v.pt ? `antes: ${v.pt}` : null, v.de, v.en].filter(Boolean).join(' · ') || undefined },
              chaves: [emUso, v.pt, v.de, v.en].filter((x): x is string => !!x).map(chaveDaForma),
            }
          })
        : []
    const doSkc: Candidato[] = doUsuario.map((v) => ({
      opcao: { id: v.id, rotulo: v.emUso, apoio: [`SKC · ${ROTULO_DO_STATUS[v.status]}`, v.formaEmUso !== null ? `antes: ${v.forma}` : null].filter(Boolean).join(' · ') },
      chaves: [v.forma, v.formaEmUso].filter((x): x is string => x !== null).map(chaveDaForma),
    }))
    return [...dosLivros, ...doSkc]
  }, [carga, doUsuario, formas])

  const chave = chaveDaForma(texto)
  const opcoes = useMemo<OpcaoDeEscolha[]>(() => {
    const escolhidos = new Set(termos.map((t) => t.id))
    const livres = candidatos.filter((c) => !escolhidos.has(c.opcao.id))
    // A forma exata (sem caixa e sem acento) vem primeiro: nunca fica fora das 6 que aparecem.
    const exatos = livres.filter((c) => c.chaves.includes(chave))
    return [...exatos, ...livres.filter((c) => !c.chaves.includes(chave))].map((c) => c.opcao)
  }, [candidatos, termos, chave])

  const livre = useCallback(
    (digitado: string): OpcaoDeEscolha | null => {
      const forma = normalizarForma(digitado)
      if (forma === '' || carga.fase === 'carregando') return null
      const k = chaveDaForma(forma)
      // A forma de um verbete que existe (escolhido ou não), ou de um termo novo já escolhido: nada a criar.
      if (candidatos.some((c) => c.chaves.includes(k)) || termos.some((t) => chaveDaForma(t.rotulo) === k)) return null
      return { id: `${PREFIXO_DO_TERMO_NOVO}${k}`, rotulo: `Criar termo «${forma}»`, apoio: 'verbete novo do SKC, a revisar' }
    },
    [candidatos, termos, carga.fase],
  )

  return (
    <div className={`termos${erro ? ' termos-invalido' : ''}`}>
      <CampoDeEscolha
        rotulo="Termo"
        valor={texto}
        aoMudarTexto={setTexto}
        opcoes={opcoes}
        livre={livre}
        placeholder="ex.: figura alada"
        ajuda={carga.fase === 'erro' ? 'O glossário dos livros não abriu; você ainda pode criar um termo novo.' : undefined}
        prefixo={
          termos.length > 0 ? (
            <ul className="termos-escolhidos" aria-label="Termos escolhidos">
              {termos.map((t) => (
                <li key={t.id} className="termo-pilula">
                  {nomeDe(t.id, t.rotulo)}
                  {t.novo && <span className="termo-novo">novo</span>}
                  <button
                    type="button"
                    className="termo-tirar tip-start"
                    aria-label={`Tirar o termo ${nomeDe(t.id, t.rotulo)}`}
                    data-tip="Tirar o termo"
                    onClick={() => aoMudar(termos.filter((x) => x.id !== t.id))}
                  >
                    <Icon name="fechar" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null
        }
        aoEscolher={(o) => {
          aoMudar([...termos, o.id.startsWith(PREFIXO_DO_TERMO_NOVO) ? termoNovo(texto) : { id: o.id, rotulo: o.rotulo }])
          setTexto('')
        }}
      />
      {erro && (
        <p className="hipoteses-erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}
