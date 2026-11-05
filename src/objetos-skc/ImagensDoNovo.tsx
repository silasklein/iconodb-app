import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import type { Modo } from '../imagens-usuario/modo'
import { ErroDeFormato, MSG_FORMATO, processarImagem, type ImagemProcessada } from '../imagens-usuario/processar'
import { CamposDaImagem, tamanhoLegivel, useSugestoesDeCredito, MSG_SEM_CREDITO } from '../telas/AdicionarImagem'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { apagarArquivoDoRascunho, guardarArquivoDoRascunho, lerArquivoDoRascunho, type ImagemDoRascunho } from './rascunhoDoNovo'
import '../telas/AdicionarImagem.css'
import './Formulario.css'

/** Uma imagem escolhida no NovoObjeto, antes de o objeto existir. */
export interface ImagemDoNovo extends ImagemDoRascunho {
  arquivo: File | null
  fase: 'preparando' | 'pronta' | 'erro'
  processada?: ImagemProcessada
  previa?: string
  detectado?: Modo
  erro?: string
  aberta: boolean
  erroDoCredito?: boolean
}

let contador = 0
const novaChave = () => `${Date.now().toString(36)}-${(++contador).toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const ROTULO_DO_TIPO: Record<Modo, string> = { traco: 'Desenho de traço', tons: 'Foto / tons' }

interface Props {
  itens: ImagemDoNovo[]
  mudar: (f: (itens: ImagemDoNovo[]) => ImagemDoNovo[]) => void
  computador: boolean
  processar?: (arquivo: File) => Promise<ImagemProcessada>
}

/**
 * As imagens do NovoObjeto (NovoObjeto.dc.html / PC-NovoObjeto.dc.html): Tirar foto / Fotos / Arquivos no celular, área
 * de soltar e "Escolher arquivos"/"Fotos" no computador; um cartão por imagem (Principal, Tipo com "detectado",
 * Legenda, Crédito / fonte, "Usar como imagem principal"). As fotos entram como `tons` (não invertidas) a menos que a
 * detecção diga traço; tudo é corrigível. Os arquivos vão ao rascunho no IndexedDB assim que escolhidos.
 */
export function ImagensDoNovo({ itens, mudar, computador, processar = processarImagem }: Props) {
  const sugestoes = useSugestoesDeCredito()
  const entradas = useRef<Record<string, HTMLInputElement | null>>({})
  const [arrastando, setArrastando] = useState(false)
  const preparar = (chave: string, arquivo: File) => {
    processar(arquivo).then(
      (p) =>
        mudar((lista) =>
          lista.map((i) =>
            i.chave === chave
              ? { ...i, fase: 'pronta', processada: p, previa: URL.createObjectURL(p.miniatura), detectado: p.modoSugerido, tipo: i.tipo ?? p.modoSugerido }
              : i,
          ),
        ),
      (erro: unknown) =>
        mudar((lista) =>
          lista.map((i) =>
            i.chave === chave
              ? { ...i, fase: 'erro', erro: erro instanceof ErroDeFormato ? MSG_FORMATO : 'Não foi possível preparar esta imagem neste aparelho. Tente de novo ou escolha outra.' }
              : i,
          ),
        ),
    )
  }
  const acrescentar = (arquivos: readonly File[]) => {
    if (arquivos.length === 0) return
    const novos: ImagemDoNovo[] = arquivos.map((arquivo, k) => ({
      chave: novaChave(),
      nome: arquivo.name,
      arquivo,
      fase: 'preparando',
      tipo: null,
      legenda: '',
      credito: '',
      principal: false,
      aberta: k === 0,
    }))
    mudar((lista) => {
      const temPrincipal = lista.some((i) => i.principal)
      return [...lista.map((i) => ({ ...i, aberta: false })), ...novos.map((n, k) => ({ ...n, principal: !temPrincipal && k === 0 }))]
    })
    for (const n of novos) {
      void guardarArquivoDoRascunho(n.chave, n.arquivo!)
      preparar(n.chave, n.arquivo!)
    }
  }

  // Ao voltar de um recarregar: os arquivos guardados são lidos e preparados de novo.
  const restaurados = useRef(false)
  useEffect(() => {
    if (restaurados.current) return
    restaurados.current = true
    for (const i of itens) {
      if (i.arquivo || i.fase !== 'preparando') continue
      void lerArquivoDoRascunho(i.chave).then((arquivo) => {
        if (!arquivo) {
          mudar((lista) => lista.filter((x) => x.chave !== i.chave))
          return
        }
        mudar((lista) => lista.map((x) => (x.chave === i.chave ? { ...x, arquivo } : x)))
        preparar(i.chave, arquivo)
      })
    }
    // Só na montagem.
  }, []) // eslint-disable-line

  // As prévias saem da memória quando a tela sai.
  const previas = useRef<string[]>([])
  previas.current = itens.flatMap((i) => (i.previa ? [i.previa] : []))
  useEffect(() => () => previas.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const escolhidos = (e: ChangeEvent<HTMLInputElement>) => {
    acrescentar([...(e.target.files ?? [])])
    e.target.value = ''
  }
  const tirar = (chave: string) => {
    void apagarArquivoDoRascunho(chave)
    mudar((lista) => {
      const sai = lista.find((i) => i.chave === chave)
      if (sai?.previa) URL.revokeObjectURL(sai.previa)
      const resto = lista.filter((i) => i.chave !== chave)
      if (sai?.principal && resto[0] && !resto.some((i) => i.principal)) resto[0] = { ...resto[0], principal: true }
      return resto
    })
  }
  const alterar = (chave: string, m: Partial<ImagemDoNovo>) => mudar((lista) => lista.map((i) => (i.chave === chave ? { ...i, ...m } : i)))
  const marcarPrincipal = (chave: string, p: boolean) => mudar((lista) => lista.map((i) => (i.chave === chave ? { ...i, principal: p } : p ? { ...i, principal: false } : i)))

  const entrada = (nome: 'camera' | 'fotos' | 'arquivos') => (
    <input
      ref={(el) => {
        entradas.current[nome] = el
      }}
      type="file"
      accept="image/*"
      multiple={nome !== 'camera'}
      capture={nome === 'camera' ? 'environment' : undefined}
      data-origem={nome}
      tabIndex={-1}
      aria-hidden="true"
      onChange={escolhidos}
    />
  )
  const abrir = (nome: string) => entradas.current[nome]?.click()

  return (
    <section className="form-secao novo-imagens" aria-labelledby="novo-imagens-titulo">
      <h2 id="novo-imagens-titulo" className="form-secao-titulo">
        Imagens <span className="codigo">{itens.length}</span>
      </h2>
      {computador ? (
        <div
          className={`novo-soltar${arrastando ? ' novo-soltar-ativo' : ''}`}
          onDragOver={(e: DragEvent) => {
            if ([...e.dataTransfer.types].includes('Files')) {
              e.preventDefault()
              setArrastando(true)
            }
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault()
            setArrastando(false)
            acrescentar([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/') || f.type === ''))
          }}
        >
          <Icon name="enviarArquivo" size={22} />
          <span>Arraste imagens aqui ou</span>
          <span className="novo-soltar-botoes">
            <button type="button" className="form-botao" onClick={() => abrir('arquivos')}>
              Escolher arquivos
            </button>
            <button type="button" className="form-botao" onClick={() => abrir('fotos')}>
              Fotos
            </button>
          </span>
        </div>
      ) : (
        <div className="novo-fontes">
          <button type="button" className="novo-fonte" onClick={() => abrir('camera')}>
            <Icon name="camera" size={20} />
            Tirar foto
          </button>
          <button type="button" className="novo-fonte" onClick={() => abrir('fotos')}>
            <Icon name="fotos" size={20} />
            Fotos
          </button>
          <button type="button" className="novo-fonte" onClick={() => abrir('arquivos')}>
            <Icon name="arquivos" size={20} />
            Arquivos
          </button>
        </div>
      )}
      <div hidden>
        {entrada('camera')}
        {entrada('fotos')}
        {entrada('arquivos')}
      </div>
      {itens.length > 0 && (
        <ul className="novo-cartoes" aria-label="Imagens escolhidas">
          {itens.map((i, k) => {
            const rotulo = `Imagem ${k + 1}`
            const descricao =
              i.fase === 'preparando'
                ? 'preparando…'
                : i.fase === 'erro'
                  ? 'não abre neste aparelho'
                  : `${ROTULO_DO_TIPO[i.tipo ?? 'tons']} · ${i.nome}${i.arquivo ? ` · ${tamanhoLegivel(i.arquivo.size)}` : ''}`
            return (
              <li key={i.chave} className="novo-cartao">
                <div className="novo-cartao-topo">
                  <span className="novo-cartao-miniatura" aria-hidden="true">
                    {i.previa && <img src={i.previa} alt="" />}
                  </span>
                  <span className="novo-cartao-texto">
                    <span className="novo-cartao-titulo">
                      {rotulo}
                      {i.principal && <span className="novo-cartao-principal">Principal</span>}
                    </span>
                    <span className="novo-cartao-descricao">{descricao}</span>
                  </span>
                  {i.fase === 'pronta' && (
                    <IconButton
                      icon={i.aberta ? 'recolher' : 'expandir'}
                      label={i.aberta ? `Fechar os campos da ${rotulo.toLowerCase()}` : `Abrir os campos da ${rotulo.toLowerCase()}`}
                      expandido={i.aberta}
                      onClick={() => alterar(i.chave, { aberta: !i.aberta })}
                    />
                  )}
                  <IconButton icon="fechar" label={`Tirar a ${rotulo.toLowerCase()}`} onClick={() => tirar(i.chave)} />
                </div>
                {i.fase === 'erro' && (
                  <p className="adicionar-imagem-erro" role="alert">
                    <Icon name="aviso" size={16} />
                    {i.erro}
                  </p>
                )}
                {i.fase === 'pronta' && i.aberta && (
                  <div className="novo-cartao-campos">
                    <CamposDaImagem
                      valores={{ tipo: i.tipo ?? 'tons', legenda: i.legenda, credito: i.credito, principal: i.principal }}
                      detectado={i.detectado ?? null}
                      rotuloDoLivro={null}
                      erroDoCredito={i.erroDoCredito ? MSG_SEM_CREDITO : null}
                      aoMudarTipo={(tipo) => alterar(i.chave, { tipo })}
                      aoMudarPrincipal={(p) => marcarPrincipal(i.chave, p)}
                      legenda={{ aoMudar: (legenda) => alterar(i.chave, { legenda }) }}
                      credito={{ aoMudar: (credito) => alterar(i.chave, { credito, erroDoCredito: false }) }}
                      sugestoes={sugestoes}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="form-ajuda">Fica no seu Dropbox; aparece nos outros aparelhos depois de sincronizar.</p>
    </section>
  )
}
