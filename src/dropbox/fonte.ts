/**
 * A Fonte do pacote no Dropbox: SÓ LEITURA (listar e baixar). A escrita, restrita a /usuario/, é outro
 * módulo (escrita.ts). Os arquivos ficam na raiz da pasta do app
 * (/nucleo/…, /imagens/…); o escopo "app folder" já resolve a raiz.
 *
 * O cliente é pedido a cada download (cliente() renova o token quando precisa),
 * porque a primeira sincronização pode durar mais que a vida de um access token.
 * Cada chamada tem prazo (prazo.ts): uma conexão pendurada vira "sem conexão", não uma tela parada.
 */
import { type Fonte } from '../pacote/manifesto'
import { cliente } from './auth'
import { PRAZO_ARQUIVO_MS, PRAZO_CURTO_MS } from './prazo'
import { eErroDeRede } from './rede'
import { clienteOuLogin, comTentativas, dormir } from './tentativas'

// A leitura e a escrita partilham erros e repetições (tentativas.ts); quem já importava daqui continua importando.
export { ErroDePacoteAusente, ErroDePermissao, resumoDoErro } from './tentativas'
export { eErroDeRede }

export interface OpcoesDaFonte {
  /** Espera entre tentativas (para os testes). */
  esperar?: (ms: number) => Promise<void>
}

/**
 * A Fonte do Dropbox; null se não há login (ou ele expirou). Se a renovação do token
 * falhar por falta de internet, o erro sobe (é "sem conexão", não "sem login").
 */
export async function fonteDropbox(opcoes: OpcoesDaFonte = {}): Promise<Fonte | null> {
  if (!(await cliente())) return null
  const esperar = opcoes.esperar ?? dormir
  return {
    async listar(prefixo = '') {
      const pasta = prefixo === '' ? '' : `/${prefixo.replace(/^\/+|\/+$/g, '')}`
      const caminhos: string[] = []
      await comTentativas(async () => {
        caminhos.length = 0
        const c = await clienteOuLogin(PRAZO_CURTO_MS)
        let r = await c.filesListFolder({ path: pasta, recursive: true })
        for (;;) {
          for (const e of r.result.entries) if (e['.tag'] === 'file' && e.path_display) caminhos.push(e.path_display.slice(1))
          if (!r.result.has_more) break
          r = await c.filesListFolderContinue({ cursor: r.result.cursor })
        }
      }, esperar)
      return caminhos.sort()
    },
    async baixar(caminho) {
      return comTentativas(async () => {
        // O manifesto e o fold.json são pequenos: prazo curto. Os demais: o de arquivo.
        const c = await clienteOuLogin(caminho.endsWith('.json') ? PRAZO_CURTO_MS : PRAZO_ARQUIVO_MS)
        const r = await c.filesDownload({ path: `/${caminho}` })
        const blob = (r.result as unknown as { fileBlob: Blob }).fileBlob
        return blob.arrayBuffer()
      }, esperar, { caminho })
    },
  }
}
