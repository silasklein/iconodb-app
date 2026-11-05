/**
 * O endereço (blob:) de uma imagem do usuário para <img src>. A CSP fica como está (`img-src 'self' blob: data:`):
 * nada é carregado do Dropbox direto pela página; os bytes passam pela Escrita (só `usuario/`) e viram blob:.
 *
 * De onde vem, nesta ordem:
 * 1. a cópia local (OPFS: imagem criada aqui e ainda não confirmada no Dropbox), na hora e sem rede;
 * 2. o Cache Storage (`iconodb-usuario-imagens`): o que já foi visto ou já subiu;
 * 3. o Dropbox (`Escrita.baixar`), guardado no Cache Storage.
 *
 * Do outro aparelho, o evento pode chegar antes dos arquivos: então `ausente` (não é erro) e o hook tenta de novo
 * mais tarde (15 s, 1 min, 5 min, depois a cada 5 min), quando uma sincronização termina e quando a rede volta.
 *
 * Cada endereço é contado: reaproveitado enquanto alguém o usa e revogado (`URL.revokeObjectURL`) quando o último
 * solta. O hook solta ao desmontar.
 */
import { useEffect, useState } from 'react'
import { ErroDeArquivoAusente, escritaDropbox, type Escrita } from '../dropbox/escrita'
import { assinarSync, infoDaSync } from '../usuario/useSincronizacao'
import { estadoAtual } from '../usuario/estado'
import { cacheDasImagens, lerLocal, tipoDoArquivo } from './local'
import { caminhoNoDropbox, lerImagem, nomeDaVersao, type Versao } from './registro'

export type Disponibilidade = { estado: 'ok'; url: string } | { estado: 'ausente' } | { estado: 'indisponivel' }
export type DisponibilidadeNaTela = Disponibilidade | { estado: 'carregando' }

export const ATRASOS_DO_AUSENTE_MS = [15_000, 60_000, 300_000] as const

let obterEscritaFixa: (() => Promise<Escrita | null>) | undefined
/** Troca de onde vem a Escrita (testes). `undefined` volta ao Dropbox. */
export function usarEscritaDasImagens(f: (() => Promise<Escrita | null>) | undefined): void {
  obterEscritaFixa = f
}

interface Endereco {
  url: string
  usos: number
  revogar?: ReturnType<typeof setTimeout>
}
const enderecos = new Map<string, Endereco>()
const emAndamento = new Map<string, Promise<Blob | 'ausente' | 'indisponivel'>>()
const chaveDe = (id: string, versao: Versao) => `${id}/${versao}`

async function obterBlob(id: string, versao: Versao): Promise<Blob | 'ausente' | 'indisponivel'> {
  const reg = estadoAtual().registro('imagem', id)
  const img = reg ? lerImagem(reg) : null
  if (!img) return 'ausente'
  const nome = nomeDaVersao(img, versao)
  const caminho = caminhoNoDropbox(id, nome)
  const local = await lerLocal(id, nome).catch(() => null)
  if (local) return local
  const cache = cacheDasImagens()
  const guardada = await cache?.obter(caminho).catch(() => null)
  if (guardada) return guardada
  let escrita: Escrita | null
  try {
    escrita = await (obterEscritaFixa ?? (() => escritaDropbox()))()
  } catch {
    return 'indisponivel'
  }
  if (!escrita) return 'indisponivel'
  let bytes: ArrayBuffer
  try {
    bytes = await escrita.baixar(caminho)
  } catch (erro) {
    return erro instanceof ErroDeArquivoAusente || (erro as { name?: unknown } | null)?.name === 'ErroDeArquivoAusente' ? 'ausente' : 'indisponivel'
  }
  const tipo = tipoDoArquivo(nome)
  await cache?.guardar(caminho, new Uint8Array(bytes), tipo).catch(() => undefined)
  return new Blob([bytes], { type: tipo })
}

function reter(chave: string): string | null {
  const e = enderecos.get(chave)
  if (!e) return null
  clearTimeout(e.revogar)
  e.revogar = undefined
  e.usos++
  return e.url
}

/**
 * O endereço da versão (`tela` ou `miniatura`) da imagem. Cada resposta `ok` conta um uso: chame
 * `soltarUrlDoUsuario(id, versao)` quando não precisar mais (o hook faz isso).
 */
export async function urlImagemDoUsuario(id: string, versao: Versao): Promise<Disponibilidade> {
  const chave = chaveDe(id, versao)
  const pronta = reter(chave)
  if (pronta) return { estado: 'ok', url: pronta }
  let fazendo = emAndamento.get(chave)
  if (!fazendo) {
    fazendo = obterBlob(id, versao).finally(() => emAndamento.delete(chave))
    emAndamento.set(chave, fazendo)
  }
  const r = await fazendo
  if (r === 'ausente' || r === 'indisponivel') return { estado: r }
  const outra = reter(chave)
  if (outra) return { estado: 'ok', url: outra }
  const url = URL.createObjectURL(r)
  enderecos.set(chave, { url, usos: 1 })
  return { estado: 'ok', url }
}

/** Solta um uso; sem nenhum, o endereço é revogado (logo em seguida, para uma tela que remonta não piscar). */
export function soltarUrlDoUsuario(id: string, versao: Versao): void {
  const chave = chaveDe(id, versao)
  const e = enderecos.get(chave)
  if (!e || e.usos === 0) return
  e.usos--
  if (e.usos > 0) return
  e.revogar = setTimeout(() => {
    if (e.usos > 0) return
    URL.revokeObjectURL(e.url)
    enderecos.delete(chave)
  }, 0)
}

/** O endereço da imagem do usuário numa tela: carrega, tenta de novo quando ausente, solta ao desmontar. */
export function useUrlDoUsuario(id: string | null, versao: Versao): DisponibilidadeNaTela {
  const [resultado, setResultado] = useState<{ chave: string; r: Disponibilidade } | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const chave = id ? chaveDe(id, versao) : ''

  useEffect(() => {
    setTentativa(0)
  }, [chave])

  useEffect(() => {
    if (!id) return
    let vivo = true
    let retida = false
    let timer: ReturnType<typeof setTimeout> | undefined
    void urlImagemDoUsuario(id, versao).then((r) => {
      if (!vivo) {
        if (r.estado === 'ok') soltarUrlDoUsuario(id, versao)
        return
      }
      if (r.estado === 'ok') retida = true
      setResultado({ chave: chaveDe(id, versao), r })
      if (r.estado !== 'ok') {
        const atraso = ATRASOS_DO_AUSENTE_MS[Math.min(tentativa, ATRASOS_DO_AUSENTE_MS.length - 1)]!
        timer = setTimeout(() => setTentativa((t) => t + 1), atraso)
      }
    })
    return () => {
      vivo = false
      clearTimeout(timer)
      if (retida) soltarUrlDoUsuario(id, versao)
    }
  }, [id, versao, tentativa])

  // Sem a imagem: uma sincronização que termina (pode ter trazido o arquivo) ou a rede de volta pedem outra tentativa.
  const falta = resultado?.chave === chave && resultado.r.estado !== 'ok'
  useEffect(() => {
    if (!falta) return
    let ultima = infoDaSync().ultimaEm
    const deNovo = () => setTentativa((t) => t + 1)
    const parar = assinarSync(() => {
      const agora = infoDaSync().ultimaEm
      if (agora !== ultima) {
        ultima = agora
        deNovo()
      }
    })
    window.addEventListener('online', deNovo)
    return () => {
      parar()
      window.removeEventListener('online', deNovo)
    }
  }, [falta])

  if (!id) return { estado: 'ausente' }
  return resultado?.chave === chave ? resultado.r : { estado: 'carregando' }
}
