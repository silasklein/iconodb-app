/**
 * Escrever imagens do usuário (decisão 33). Nada se perde:
 * 1. os arquivos (original como veio, tela, miniatura) vão ao OPFS deste aparelho (`local.ts`);
 * 2. o evento `imagem` vai ao IndexedDB pelo `registrar` (Tarefa 2) e a imagem aparece na hora, pela cópia local;
 * 3. a fila de envio é avisada (`fila.ts`); a sincronização sobe os arquivos quando houver rede.
 * Se o passo 2 falha sem gravar, os arquivos do passo 1 saem (a imagem nunca fica pela metade); se o evento ficou e o
 * erro veio depois, os arquivos ficam (são do registro). Se o app morre entre 1 e 2, a
 * pasta fica órfã: não aparece, não sobe (ver fila.ts).
 */
import { estadoAtual, registrar, proximoId } from '../usuario/estado'
import { avisarFila } from './fila'
import { guardarLocal, removerLocal } from './local'
import type { Modo } from './modo'
import { processarImagem, type ImagemProcessada } from './processar'
import { extensaoDaTela } from './registro'

export interface DadosDaImagem {
  tipo: Modo
  legenda: string
  credito: string
  principal: boolean
}

export interface AlvoDaImagem {
  /** O número do objeto (CA00023) ou o id de um objeto SKC. */
  objeto: string
}

const ehProcessada = (x: File | Blob | ImagemProcessada): x is ImagemProcessada => typeof (x as ImagemProcessada).tela === 'object' && 'modoSugerido' in x

/**
 * Adiciona a imagem ao objeto e devolve o id (`IM-<aparelho>-<n>`). `arquivo` pode já vir processado (a folha de
 * adicionar processa antes, para mostrar a prévia e o Tipo detectado). Lança ErroDeFormato (não abre neste
 * aparelho), ErroDeEspaco (sem espaço) ou o erro do IndexedDB.
 */
export async function adicionarImagem(alvo: AlvoDaImagem, arquivo: File | Blob | ImagemProcessada, dados: DadosDaImagem): Promise<string> {
  const p = ehProcessada(arquivo) ? arquivo : await processarImagem(arquivo)
  const id = await proximoId('IM')
  const e = extensaoDaTela(p.formato)
  await guardarLocal(id, [
    { nome: `original.${p.extensao}`, blob: p.original },
    { nome: `tela.${e}`, blob: p.tela },
    { nome: `miniatura.${e}`, blob: p.miniatura },
  ])
  try {
    await registrar('imagem', id, 'criar', {
      alvoTipo: 'objeto',
      alvo: alvo.objeto,
      tipo: dados.tipo,
      tipoDetectado: p.modoSugerido,
      metricas: { extremes: p.metricas.extremes, grey_core: p.metricas.grey_core },
      legenda: dados.legenda.trim(),
      credito: dados.credito.trim(),
      principal: dados.principal,
      formato: p.formato,
      extensao: p.extensao,
      nome: p.nome,
      bytes: p.original.size,
      largura: p.largura,
      altura: p.altura,
      miniaturaLargura: p.miniaturaLargura,
      miniaturaAltura: p.miniaturaAltura,
      originalLargura: p.originalLargura,
      originalAltura: p.originalAltura,
    })
  } catch (erro) {
    // Só tira os arquivos se o evento de fato não ficou: com o registro gravado (o erro veio depois), eles são dele.
    if (!estadoAtual().registro('imagem', id)) await removerLocal(id).catch(() => undefined)
    throw erro
  }
  avisarFila()
  return id
}

/** Muda o Tipo ou a marca de principal (a legenda e o crédito se salvam pelo `useCampoSalvo`). */
export async function alterarImagem(id: string, campos: Partial<Pick<DadosDaImagem, 'tipo' | 'principal'>>): Promise<void> {
  const limpos: Record<string, string | boolean> = {}
  if (campos.tipo !== undefined) limpos.tipo = campos.tipo
  if (campos.principal !== undefined) limpos.principal = campos.principal
  if (Object.keys(limpos).length === 0) return
  await registrar('imagem', id, 'alterar', limpos)
}

/** Exclusão reversível: a marca vai no evento; os arquivos ficam (aqui e no Dropbox). */
export async function excluirImagem(id: string): Promise<void> {
  await registrar('imagem', id, 'excluir')
}

export async function restaurarImagem(id: string): Promise<void> {
  await registrar('imagem', id, 'restaurar')
}
