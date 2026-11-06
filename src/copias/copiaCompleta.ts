/**
 * A cópia completa, com fotos (2C, bloco 1, Tarefa 6; especificação §6.1). Um .zip SEM compressão (as fotos já são
 * comprimidas), montado em partes por `montarZip` (nunca o arquivo inteiro num só ArrayBuffer):
 *
 *   LEIA-ME.txt                 o que é o arquivo e como restaurar (TEXTO_DO_LEIA_ME)
 *   copia.json                  a cópia de segurança `iconodb-copia` v1: o MESMO texto de `gerarArquivo('copia')`
 *   imagens/<IM-…>/<arquivo>    os arquivos de cada imagem não excluída, com os nomes do Dropbox
 *                               (`usuario/imagens/<IM-…>/tela.<webp|jpg>`, `miniatura.…`, `original.<ext>`)
 *
 * As imagens são as do estado da própria cópia (`fundir([], copia.estado)`), então o .zip e o copia.json nunca discordam.
 * Cada arquivo vem da fila deste aparelho (`lerLocal`, o OPFS) e, se não estiver lá, do Dropbox (`Escrita.baixar`), um
 * por vez, à medida que o .zip é montado. Um arquivo que não vem fica de fora; a imagem entra uma vez em `faltaram`
 * (pelo nome do arquivo original). Sem `escrita` (sem internet ou sem login), só os arquivos da fila. Se o Dropbox falha
 * por rede, login ou permissão (`semDropbox`; `baixar` já repetiu), ele não é mais chamado nesta cópia: as fotos seguintes
 * que não estão aqui entram em `faltaram` sem esperar outra rodada de tentativas. Qualquer outro erro (um arquivo
 * ausente, um 409 daquele caminho, uma resposta ilegível) vale só para aquele arquivo.
 */
import { type Escrita } from '../dropbox/escrita'
import { eErroDeRede } from '../dropbox/rede'
import { ErroDePermissao } from '../dropbox/tentativas'
import { lerLocal } from '../imagens-usuario/local'
import { arquivosDaImagem, lerImagem, type ImagemDoUsuario } from '../imagens-usuario/registro'
import { criarArquivoDeBlob } from '../ui/entregarArquivo'
import { gerarArquivo } from '../usuario/arquivosDeExportacao'
import { ErroDeLogin } from '../pacote/manifesto'
import { nomeDoArquivo } from '../usuario/exportar'
import { fundir, type Estado, type EstadoConsolidado } from '../usuario/fusao'
import { montarZip } from './zip'

export const TEXTO_DO_LEIA_ME = `IconoDB: cópia completa, com fotos

Este arquivo .zip guarda uma cópia de tudo o que é seu no IconoDB: notas, coleções, hipóteses, regiões, objetos SKC, sítios, verbetes e as suas fotos. Ele foi gerado pelo app neste aparelho, com os registros gravados nele e as fotos que estavam nele ou no Dropbox.

O que tem dentro:

- copia.json: a cópia de segurança, com todos os seus registros. É o mesmo arquivo do botão «Baixar cópia».
- imagens/: as suas fotos, numa pasta para cada uma, com os mesmos nomes da pasta usuario/imagens/ do Dropbox (a versão de tela, a miniatura e o original).
- LEIA-ME.txt: este texto.

Como restaurar:

1. Abra o IconoDB e, no Menu, vá a «Cópias e exportação».
2. Em «Restaurar a partir de uma cópia», toque em «Escolher a cópia».
3. Escolha este arquivo .zip, assim como está (não precisa descompactar).

Antes de mudar qualquer coisa, o app mostra um resumo do que vai voltar. Restaurar traz de volta o que falta e não apaga nada: o que você mudou depois da data da cópia continua valendo.

Guarde este arquivo fora do Dropbox: no computador, num disco externo ou em outro serviço.
`

/** `iconodb-copia-completa-AAAA-MM-DD-HHMM.zip`, na hora local (a mesma regra dos outros arquivos). */
export const nomeDaCopiaCompleta = (agora: Date) => nomeDoArquivo('copia', agora).replace(/^iconodb-copia-/, 'iconodb-copia-completa-').replace(/\.json$/, '.zip')

/** As imagens que vão no .zip: as não excluídas, em ordem de id (a mesma de `imagens` no copia.json). */
function imagensDaCopia(estado: Estado): ImagemDoUsuario[] {
  const saida: ImagemDoUsuario[] = []
  for (const r of estado.registros.get('imagem')?.values() ?? []) {
    const img = lerImagem(r)
    if (img && !img.excluido) saida.push(img)
  }
  return saida.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * O que a seção mostra antes de baixar: as fotos não excluídas e a soma dos tamanhos conhecidos. Só o tamanho do original
 * fica no registro (`bytes`); a versão de tela e a miniatura não têm tamanho guardado e não entram na soma (são pequenas
 * perto do original; o texto diz «cerca de»). Um original sem tamanho conta 0.
 */
export function resumoDaCopiaCompleta(estado: Estado): { fotos: number; bytes: number } {
  const imagens = imagensDaCopia(estado)
  return { fotos: imagens.length, bytes: imagens.reduce((n, i) => n + (i.bytes ?? 0), 0) }
}

export interface DependenciasDaCopiaCompleta {
  /** O Dropbox; null sem internet ou sem login (só os arquivos da fila deste aparelho entram). */
  escrita: Escrita | null
  agora: Date
  /** Uma vez no começo (0 de total) e depois de cada foto. */
  aoAvancar: (feitas: number, total: number) => void
}

type Entrada = { nome: string; dados: Blob | Uint8Array }

/** O Dropbox inteiro está fora (não só aquele arquivo): rede, login vencido ou sem a permissão de leitura. */
const semDropbox = (erro: unknown) => {
  const nome = (erro as { name?: unknown } | null)?.name
  return eErroDeRede(erro) || erro instanceof ErroDeLogin || erro instanceof ErroDePermissao || nome === 'ErroDeRede' || nome === 'ErroDeLogin' || nome === 'ErroDePermissao'
}

/** Monta o .zip. `faltaram`: o nome do arquivo original de cada foto com algum arquivo que não veio (o id, sem nome). */
export async function montarCopiaCompleta(dep: DependenciasDaCopiaCompleta): Promise<{ arquivo: File; faltaram: string[] }> {
  const copia = await gerarArquivo('copia', dep.agora)
  const estado = fundir([], (JSON.parse(copia.conteudo) as { estado: EstadoConsolidado }).estado)
  const imagens = imagensDaCopia(estado)
  const faltaram: string[] = []
  let escrita = dep.escrita
  dep.aoAvancar(0, imagens.length)

  /** O arquivo da fila deste aparelho, senão do Dropbox; null se não veio. */
  async function buscar(id: string, nome: string, caminho: string): Promise<Blob | Uint8Array | null> {
    const local = await lerLocal(id, nome).catch(() => null)
    if (local) return local
    if (!escrita) return null
    try {
      return new Uint8Array(await escrita.baixar(caminho))
    } catch (erro) {
      // Rede, login ou permissão (depois das repetições): o Dropbox sai desta cópia. Outro erro: só este arquivo.
      if (semDropbox(erro)) escrita = null
      return null
    }
  }

  async function* entradas(): AsyncGenerator<Entrada> {
    yield { nome: 'LEIA-ME.txt', dados: new TextEncoder().encode(TEXTO_DO_LEIA_ME) }
    yield { nome: 'copia.json', dados: new TextEncoder().encode(copia.conteudo) }
    let feitas = 0
    for (const img of imagens) {
      let faltou = false
      for (const a of arquivosDaImagem(img)) {
        const dados = await buscar(img.id, a.nome, a.caminho)
        if (dados) yield { nome: `imagens/${img.id}/${a.nome}`, dados }
        else faltou = true
      }
      if (faltou) faltaram.push(img.nome || img.id)
      dep.aoAvancar(++feitas, imagens.length)
    }
  }

  const zip = await montarZip(entradas())
  return { arquivo: criarArquivoDeBlob(nomeDaCopiaCompleta(dep.agora), zip, 'application/zip'), faltaram }
}
