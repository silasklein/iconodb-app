/**
 * Mensagens sobre o Dropbox que mais de uma tela mostra (Preparando, Sincronização).
 */

/** O manifesto (ou outro arquivo do pacote) não está na pasta do app no Dropbox (409 not_found). */
export const MSG_SEM_PACOTE_NO_DROPBOX =
  'O pacote não está na pasta do app no Dropbox. Ponha as pastas nucleo e imagens na pasta deste app, dentro de Dropbox → Aplicativos (o nome pode ter um número, como "(1)"), espere o Dropbox terminar de enviar e tente de novo.'

/** Falta uma das três permissões (Dropbox 401 missing_scope): o que fazer no App Console. */
export const MSG_SEM_PERMISSAO =
  'O app não tem todas as permissões do Dropbox. No App Console, aba Permissions, marque files.content.read, files.content.write e files.metadata.read e clique em Submit; depois toque em "Entrar de novo" (a permissão só vale depois de entrar de novo).'
