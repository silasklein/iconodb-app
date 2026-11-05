import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { Modalidade, Nivel } from '../banco/tipos'
import { caminhoDaBusca } from '../busca/url'
import { useNomeVivo } from '../glossario/doUsuario'
import { destinoDe, useRedirecionamentos } from '../pacote/redirecionamentos'
import { ROTULO_DA_MODALIDADE, ROTULO_DO_NIVEL } from '../item/rotulos'
import { Icon } from '../ui/Icon'
import { useEstado, type Estado } from '../usuario/estado'
import { conferirAncora, reconferirAncora } from './ancora'
import { CampoDeTermos } from './CampoDeTermos'
import { lerHipotese, MODALIDADES, nomeDaHipoteseSkc, NIVEIS_SKC, type AncoraDaHipoteseSkc, type HipoteseSkc } from './modelo'
import { alterarHipotese, excluirHipotese, restaurarHipotese } from './operacoes'
import { Segmentos } from './Segmentos'
import { rotuloDaFonteNaTela } from './selecao'
import { textoGuardado } from './textosNaTela'
import { TextoEditavel } from './TextoEditavel'
import './Hipoteses.css'

export const OPCOES_DE_NIVEL = NIVEIS_SKC.map((n) => ({ valor: n, rotulo: ROTULO_DO_NIVEL[n].toLowerCase() }))
export const OPCOES_DE_CERTEZA = MODALIDADES.map((m) => ({ valor: m, rotulo: ROTULO_DA_MODALIDADE[m] }))

/** O texto de uma leitura, como guardado, para conferir a âncora: chave `<fonte>|<lingua>`. */
export type TextosDasLeituras = ReadonlyMap<string, string>
export const chaveDoTexto = (fonte: string, lingua: AncoraDaHipoteseSkc['lingua']) => `${fonte}|${lingua}`

/** A hipótese SKC lida do estado (re-renderiza quando o registro muda). */
export function useHipoteseSkc(id: string): HipoteseSkc | null {
  const seletor = useMemo(() => {
    let reg: unknown = undefined
    let valor: HipoteseSkc | null = null
    return (e: Estado) => {
      const r = e.registro('hipotese', id) ?? null
      if (r !== reg) {
        reg = r
        valor = r ? lerHipotese(r) : null
      }
      return valor
    }
  }, [id])
  return useEstado(seletor)
}

export { nomeDaHipoteseSkc }
export const etiquetaDaHipoteseSkc = (h: Pick<HipoteseSkc, 'nivel' | 'modalidade'>) =>
  [h.nivel ? ROTULO_DO_NIVEL[h.nivel] : 'Sem nível', h.modalidade ? ROTULO_DA_MODALIDADE[h.modalidade] : null, 'SKC'].filter(Boolean).join(' · ')

const dataDoHlc = (hlc: string) => {
  const ms = Number(hlc.slice(0, 13))
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleDateString('pt-BR') : null
}

interface Props {
  h: HipoteseSkc
  regiaoAcesa: boolean
  textos: TextosDasLeituras
  /** "TESTE I: 2" de cada trecho do livro (por `PA-…`); a leitura SKC é "SKC". */
  rotulosDasFontes: ReadonlyMap<string, string>
}

/**
 * O painel de uma hipótese SKC (o mesmo PainelHipotese das hipóteses do livro, com o rótulo SKC): o termo, o trecho
 * (com o aviso "O texto da fonte mudou", spec §7.6), do que fala (o elemento, aceso na imagem), a justificativa (lida
 * limpa, editada com `[[`), e "Editar a hipótese" (nível, certeza, termos; cada mudança se grava na hora) e "Excluir".
 */
export function ConteudoSkc({ h, regiaoAcesa, textos, rotulosDasFontes }: Props) {
  const [editando, setEditando] = useState(false)
  const [falhou, setFalhou] = useState(false)
  // Os nomes dos termos são os de agora (a forma em uso, Tarefa 11), não os guardados na hipótese.
  const nomeDe = useNomeVivo()
  const nome = nomeDaHipoteseSkc(h, nomeDe)
  // Um termo do usuário que o pacote publicou (Tarefa 16) leva direto ao verbete do livro.
  const redirecionamentos = useRedirecionamentos()
  // Tirar o último termo não tira (a hipótese liga uma identificação a termos do vocabulário): o campo diz por quê, em
  // vez de um × mudo (revisão 3, Minor 4).
  const [ultimoTermo, setUltimoTermo] = useState(false)
  const gravar = (p: Promise<unknown>) => {
    setFalhou(false)
    p.catch(() => setFalhou(true))
  }
  const termo = h.termos[0] ?? null
  const idDoElemento = h.sobre.tipo === 'elemento' ? h.sobre.id : ''
  // A região-elemento excluída (revisão 1, I6): a hipótese fica, com o nome guardado e o aviso.
  const regiaoExcluida = useEstado((e) => (idDoElemento.startsWith('RG-') ? e.registro('regiao', idDoElemento)?.excluido === true : false))
  const linhas: [string, ReactNode][] = []
  if (h.ancora) {
    const fonte = h.ancora.lingua === 'skc' ? 'SKC' : (rotulosDasFontes.get(h.ancora.fonte) ?? rotuloDaFonteNaTela(h.ancora.fonte, h.ancora.lingua))
    linhas.push([
      'Trecho',
      <>
        <span lang={h.ancora.lingua === 'de' ? 'de' : undefined}>{`»${h.ancora.trecho}«`}</span>
        {fonte && <span className="painel-hipotese-apoio">{` · ${fonte}`}</span>}
      </>,
    ])
  }
  linhas.push([
    'Sobre',
    <>
      {h.sobre.tipo === 'elemento' ? (
        <>
          <strong>{h.sobre.rotulo || 'região'}</strong> (elemento{regiaoExcluida ? '; região excluída' : ''})
        </>
      ) : (
        'objeto inteiro'
      )}
      {regiaoAcesa && ' · acesa na imagem'}
    </>,
  ])
  if (h.termos.length > 1) {
    linhas.push([
      'Termos',
      <>
        {h.termos.map((t, i) => (
          <span key={t.id}>
            {i > 0 && ', '}
            <Link to={`/verbete/${encodeURIComponent(destinoDe(redirecionamentos, t.id))}`}>{nomeDe(t.id, t.rotulo)}</Link>
          </span>
        ))}
      </>,
    ])
  }
  const data = dataDoHlc(h.criadoEm)
  linhas.push(['Fonte', `SKC, sua (não publicada)${data ? ` · ${data}` : ''}`])

  if (h.excluido) {
    return (
      <div className="painel-hipotese-cabeca">
        <h2>{nome}</h2>
        <p role="status">
          Hipótese excluída.{' '}
          <button type="button" className="texto-editavel-botao" onClick={() => gravar(restaurarHipotese(h.id))}>
            Restaurar
          </button>
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="painel-hipotese-cabeca">
        <h2>{nome}</h2>
        <span className="painel-hipotese-ids codigo">{[h.id, termo?.id].filter(Boolean).join(' · ')}</span>
      </div>
      {h.ancora && <AvisoDaAncora id={h.id} ancora={h.ancora} texto={textos.get(chaveDoTexto(h.ancora.fonte, h.ancora.lingua)) ?? textoGuardado(h.ancora.fonte, h.ancora.lingua)} />}
      <dl className="painel-hipotese-dados">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      <div className="hipotese-skc-justificativa">
        <h3 className="posicao-titulo">Justificativa</h3>
        <TextoEditavel tipo="hipotese" reg={h.id} campo="justificativa" valor={h.justificativa} rotulo="Justificativa" oQue="a justificativa" vazio="Sem justificativa ainda." />
      </div>
      {editando && (
        <div className="hipotese-skc-edicao">
          <span className="form-rotulo" id={`${h.id}-nivel`}>
            Nível
          </span>
          <Segmentos rotulo="Nível" rotuloId={`${h.id}-nivel`} opcoes={OPCOES_DE_NIVEL} valor={h.nivel} aoEscolher={(n: Nivel) => gravar(alterarHipotese(h.id, { nivel: n }))} />
          <span className="form-rotulo" id={`${h.id}-certeza`}>
            Certeza
          </span>
          <Segmentos rotulo="Certeza" rotuloId={`${h.id}-certeza`} opcoes={OPCOES_DE_CERTEZA} valor={h.modalidade} aoEscolher={(m: Modalidade) => gravar(alterarHipotese(h.id, { modalidade: m }))} />
          <CampoDeTermos
            termos={h.termos}
            erro={ultimoTermo ? 'Uma hipótese precisa de pelo menos um termo: escolha outro antes de tirar este.' : null}
            aoMudar={(t) => {
              setUltimoTermo(t.length === 0)
              if (t.length > 0) gravar(alterarHipotese(h.id, { termos: t }))
            }}
          />
          <p className="form-ajuda">Cada mudança se grava na hora. Uma hipótese fica com pelo menos um termo.</p>
        </div>
      )}
      {falhou && (
        <p className="hipoteses-erro" role="alert">
          Não foi possível guardar; tente de novo.
        </p>
      )}
      <div className="painel-hipotese-acoes">
        {termo && (
          <Link className="painel-hipotese-principal" to={`/verbete/${encodeURIComponent(termo.id)}`}>
            Abrir verbete
          </Link>
        )}
        {termo && (
          <Link className="painel-hipotese-secundaria" to={caminhoDaBusca(nome, { escopo: 'termo' })} aria-label="Filtrar a busca por este termo">
            Filtrar a busca
          </Link>
        )}
      </div>
      <div className="hipotese-skc-mais">
        <button type="button" className="texto-editavel-botao" aria-expanded={editando} onClick={() => setEditando((e) => !e)}>
          <Icon name="editarFicha" size={16} />
          {editando ? 'Pronto' : 'Editar a hipótese'}
        </button>
        <button type="button" className="texto-editavel-botao" onClick={() => gravar(excluirHipotese(h.id))}>
          Excluir a hipótese
        </button>
      </div>
    </>
  )
}

/**
 * "O texto da fonte mudou" (spec §7.6), com "Já conferi" (grava o sha de agora e a posição achada). Numa âncora na
 * tradução ("pt"), "A tradução mudou desde que você marcou este trecho" (M10): o sha é o da tradução, não o do original.
 */
function AvisoDaAncora({ id, ancora, texto }: { id: string; ancora: AncoraDaHipoteseSkc; texto: string | null }) {
  const [mudou, setMudou] = useState(false)
  const [falhou, setFalhou] = useState(false)
  useEffect(() => {
    if (texto === null || !globalThis.crypto?.subtle) {
      setMudou(false)
      return
    }
    let vivo = true
    conferirAncora(ancora, texto).then(
      (r) => vivo && setMudou(r === 'mudou'),
      () => vivo && setMudou(false),
    )
    return () => {
      vivo = false
    }
  }, [ancora.sha, texto]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!mudou || texto === null) return null
  return (
    <div className="nota-aviso">
      <Icon name="aviso" size={16} />
      <p role="status" className="nota-aviso-texto">
        {ancora.lingua === 'pt' ? (
          // A âncora "pt" é no texto da TRADUÇÃO (desvio deliberado da §7.6; src/hipoteses/modelo.ts): quem mudou foi ela.
          <>
            <strong>A tradução mudou</strong> desde que você marcou este trecho. Confira se ele ainda sustenta a hipótese.
          </>
        ) : (
          <>
            <strong>O texto da fonte mudou</strong> desde que você registrou esta hipótese. Confira se o trecho ainda a sustenta.
          </>
        )}
        {falhou && ' Não foi possível guardar a conferência; tente de novo.'}
      </p>
      <button
        type="button"
        className="nota-aviso-botao"
        onClick={() => {
          setFalhou(false)
          reconferirAncora(ancora, texto)
            .then((nova) => alterarHipotese(id, { ancora: nova }))
            .catch(() => setFalhou(true))
        }}
      >
        Já conferi
      </button>
    </div>
  )
}
