import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { useCliqueParaEditar } from '../hipoteses/cliqueParaEditar'
import { CampoDaNota, type FonteDoCampo, type ManejoDoCampo } from '../notas/CampoDaNota'
import { TextoDaNota, type RealceNoTexto } from '../notas/TextoDaNota'
import { posicaoNoTexto } from '../hipoteses/ancora'
import { useTextoNaTela } from '../hipoteses/textosNaTela'
import type { HipoteseSkc } from '../hipoteses/modelo'
import { mapaDeCodepoints, paraUtf16 } from '../item/offsets'
import { ROTULO_DA_MODALIDADE, ROTULO_DO_NIVEL } from '../item/rotulos'
import { Icon } from '../ui/Icon'
import { useCampoSalvo } from '../usuario/campoSalvo'
import { useEstado } from '../usuario/estado'
import '../item/Leitura.css'
import './ObjetoSkc.css'

interface Props {
  /** O id do objeto SKC (OB-…). */
  id: string
  /** O número do objeto (ou o id, sem número), para o rótulo de uma leitura ligada. */
  numero?: string | null
  /** Esta leitura é de um objeto ligado (aparece na tela do principal): o rótulo diz de qual, com link para vê-lo sozinho. */
  ligada?: boolean
  /** As hipóteses SKC (Tarefa 10): as ancoradas nesta leitura ficam marcadas no texto e abrem o painel. */
  hipoteses?: readonly HipoteseSkc[]
  hipoteseAtiva?: string | null
  aoAbrirHipotese?: (id: string, gatilho: HTMLElement) => void
}

const SEM_HIPOTESES: readonly HipoteseSkc[] = []

/** Os trechos das hipóteses ancoradas na leitura SKC `id`, em UTF-16 do texto de agora (o trecho que sumiu não aparece). */
export function realcesDaLeitura(id: string, texto: string, hipoteses: readonly HipoteseSkc[]): RealceNoTexto[] {
  const mapa = mapaDeCodepoints(texto)
  const saida: RealceNoTexto[] = []
  for (const h of hipoteses) {
    if (!h.ancora || h.ancora.lingua !== 'skc' || h.ancora.fonte !== id) continue
    const pos = posicaoNoTexto(h.ancora, texto)
    if (!pos) continue
    const nota = [h.nivel ? ROTULO_DO_NIVEL[h.nivel].toLowerCase() : null, h.modalidade ? ROTULO_DA_MODALIDADE[h.modalidade] : null].filter(Boolean).join(', ')
    saida.push({ inicio: paraUtf16(mapa, pos.inicio)!, fim: paraUtf16(mapa, pos.fim)!, hipoteses: [h.id], nota })
  }
  return saida
}

/**
 * A leitura SKC de um objeto (ObjetoSKC.dc.html, "SKC / leitura"), com a decisão 37: lê-se limpa (cada `[[ref|rótulo]]`
 * é o rótulo sublinhado e clicável, `TextoDaNota`, nunca HTML); "Editar a leitura", Enter/E no bloco ou tocar no texto
 * abrem o campo com o código e o `[[` das notas (Tarefa 6). O campo grava sozinho (`useCampoSalvo`: 1 s depois da
 * última tecla, ao sair, em Ctrl/⌘S e ao esconder a página, com a rede de segurança).
 * Tarefa 10: o bloco é selecionável como trecho (`data-trecho-fonte` = o id do objeto, `data-trecho-lingua="skc"`), com as
 * posições no texto GUARDADO (com os `[[…]]`); as hipóteses ancoradas aqui ficam marcadas e abrem o painel.
 */
export function LeituraSkc({ id, numero = null, ligada = false, hipoteses = SEM_HIPOTESES, hipoteseAtiva = null, aoAbrirHipotese }: Props) {
  const valor = useEstado((e) => {
    const v = e.registro('objeto', id)?.campos.leitura
    return typeof v === 'string' ? v : ''
  })
  const campo = useCampoSalvo({ tipo: 'objeto', reg: id, campo: 'leitura', valor })
  useTextoNaTela(id, 'skc', valor)
  const [editando, setEditando] = useState(false)
  const manejo = useRef<ManejoDoCampo>(null)
  const bloco = useRef<HTMLDivElement>(null)
  const idRotulo = useId()
  const idCampo = useId()
  // O campo das notas lê o texto do hook e grava por ele.
  const ref = useRef(campo)
  ref.current = campo
  const fonte = useMemo<FonteDoCampo>(
    () => ({
      get texto() {
        return ref.current.texto
      },
      mudar: (t: string) => ref.current.setTexto(t),
      descarregar: () => ref.current.gravarAgora(),
    }),
    [],
  )
  const editar = () => {
    setEditando(true)
    campo.aoFocar()
  }
  const sair = () => {
    void campo.aoDesfocar()
    setEditando(false)
    requestAnimationFrame(() => bloco.current?.focus())
  }
  // O duplo clique seleciona uma palavra (para uma hipótese), não abre o editor (revisão 1 da Tarefa 10, I8).
  const clicou = useCliqueParaEditar(editar)
  const teclou = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
      e.preventDefault()
      e.stopPropagation()
      editar()
    }
  }
  const texto = editando ? campo.texto : valor
  const realces = useMemo(() => (editando ? [] : realcesDaLeitura(id, valor, hipoteses)), [editando, id, valor, hipoteses])
  return (
    <div className="leitura leitura-skc">
      <div className="leitura-fonte">
        <span className="leitura-sigla" id={idRotulo}>
          SKC
        </span>
        <span className="leitura-numero">{ligada ? numero : 'leitura'}</span>
      </div>
      <div className="leitura-corpo">
        {editando ? (
          <div className="leitura-skc-edicao">
            <label htmlFor={idCampo} className="leitura-skc-rotulo">
              Leitura SKC
            </label>
            <CampoDaNota
              ref={manejo}
              id={idCampo}
              rascunho={fonte}
              autoFoco
              aoFechar={sair}
              aoSalvar={sair}
              descritoPor={`${idCampo}-ajuda`}
              aoPerderFoco={(e) => {
                // Sair para fora do bloco (não para o botão "Pronto") volta à leitura.
                const para = e.relatedTarget as HTMLElement | null
                if (para && e.currentTarget.closest('.leitura-skc')?.contains(para)) return
                if (!para && document.activeElement === e.currentTarget) return
                void campo.aoDesfocar()
                setEditando(false)
              }}
            />
            <span id={`${idCampo}-ajuda`} className="leitura-skc-ajuda">
              Digite [[ para ligar a um verbete, objeto ou obra. Esc ou «Pronto» voltam à leitura; o texto se grava sozinho.
            </span>
            <span className="leitura-skc-acoes">
              <button type="button" className="leitura-skc-botao" onMouseDown={(e) => e.preventDefault()} onClick={() => manejo.current?.inserirLink()}>
                <Icon name="vincular" size={16} />
                Inserir link
              </button>
              <button type="button" className="leitura-skc-botao" onClick={sair}>
                Pronto
              </button>
            </span>
          </div>
        ) : (
          <>
            {texto.trim() ? (
              <div
                ref={bloco}
                className="leitura-texto leitura-skc-bloco"
                role="group"
                tabIndex={0}
                aria-labelledby={idRotulo}
                onClick={clicou}
                onKeyDown={teclou}
                data-trecho-fonte={id}
                data-trecho-lingua="skc"
              >
                <TextoDaNota texto={texto} posicoes realces={realces} hipoteseAtiva={hipoteseAtiva} aoAbrirHipotese={aoAbrirHipotese} />
              </div>
            ) : (
              <p className="leitura-skc-vazia">Sem leitura SKC ainda.</p>
            )}
            <span className="leitura-skc-acoes">
              <button type="button" className="leitura-skc-botao" onClick={editar}>
                <Icon name="escrever" size={16} />
                {texto.trim() ? 'Editar a leitura' : 'Escrever a leitura'}
              </button>
              {ligada && (
                <Link className="leitura-skc-botao" to={`/item/${encodeURIComponent(id)}?sozinho=1`}>
                  Ver {numero ?? 'o objeto'} sozinho
                </Link>
              )}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
