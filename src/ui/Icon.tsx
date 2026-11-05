import type { ReactNode } from 'react'

/**
 * Todos os glifos do design, um por conceito (auditoria AI-8).
 * Grade 24 x 24, traço de 1,5 px, pontas e junções arredondadas, cor = currentColor.
 * O comentário de cada glifo diz de qual tela do design ele foi tirado.
 */
const GLIFOS = {
  // Navegação
  /** Voltar à tela anterior (cabeçalhos de Bibliografia, Grupo, Item). */
  voltar: <path d="M15 5l-7 7 7 7" />,
  /** Item anterior no grupo (Item). */
  anterior: (
    <>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </>
  ),
  /** Próximo item no grupo; também a seta de "entrar" (Item, Login). */
  proximo: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  /** Ir ao detalhe: seta de linha (ItemDesktop, Revisao). */
  detalhe: <path d="M9 5l7 7-7 7" />,
  /** Abrir uma lista ou seletor (MinhasNotas). */
  expandir: <path d="M6 9l6 6 6-6" />,
  /** Descer até as imagens do grupo (PC-Grupo). */
  descer: (
    <>
      <path d="M12 4v15" />
      <path d="M6 13l6 6 6-6" />
    </>
  ),
  /** Subir um lugar na lista (coleção: mover o item). */
  subir: (
    <>
      <path d="M12 20V5" />
      <path d="M6 11l6-6 6 6" />
    </>
  ),
  /** Pegar um item para mover (coleção). */
  arrastar: (
    <>
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
    </>
  ),
  /** Menu do app (Main, PC-*). */
  menu: (
    <>
      <path d="M4 9h16" />
      <path d="M10 15h10" />
    </>
  ),
  /** Fechar painel ou limpar campo (Busca, Hipotese, Comparar). */
  fechar: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),

  // Seções do app (barra superior)
  /** Coleções (PC-*). */
  colecoes: (
    <>
      <rect x="4" y="4" width="7" height="7" />
      <rect x="13" y="4" width="7" height="7" />
      <rect x="4" y="13" width="7" height="7" />
      <rect x="13" y="13" width="7" height="7" />
    </>
  ),
  /** Glossário (PC-*). */
  glossario: (
    <>
      <path d="M12 6.5C10 5 7 4.5 4 4.5v13c3 0 6 .5 8 2 2-1.5 5-2 8-2v-13c-3 0-6 .5-8 2z" />
      <path d="M12 6.5v13" />
    </>
  ),
  /** Sítios (PC-*). */
  sitios: (
    <>
      <path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
  ),
  /** Bibliografia (PC-*). */
  bibliografia: (
    <>
      <path d="M5 4v16" />
      <path d="M9.5 4v16" />
      <path d="M14 4.5l5.5 15" />
    </>
  ),
  /** Revisão (PC-*). */
  revisao: (
    <>
      <path d="M4 13.5L6.5 5h11l2.5 8.5V19H4z" />
      <path d="M4 13.5h5l1 2h4l1-2h5" />
    </>
  ),
  /** Sincronizar (Main, Item, Menu). */
  sincronizar: (
    <>
      <path d="M20 12a8 8 0 0 1-14.2 5" />
      <path d="M4 12a8 8 0 0 1 14.2-5" />
      <path d="M18.5 3v4h-4" />
      <path d="M5.5 21v-4h4" />
    </>
  ),

  // Busca e listas
  /** Buscar (Busca, Colecoes, Main). */
  buscar: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  /** Uma busca recente (BuscaSugestoes). */
  recentes: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  /** Filtrar resultados (Busca, Glossario). */
  filtro: (
    <>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </>
  ),
  /** Ordenar a lista (Bibliografia). */
  ordenar: (
    <>
      <path d="M7 4v16" />
      <path d="M3.5 16.5L7 20l3.5-3.5" />
      <path d="M17 20V4" />
      <path d="M13.5 7.5L17 4l3.5 3.5" />
    </>
  ),
  /** Ver outros objetos com o mesmo termo (Hipotese). */
  outrosObjetos: (
    <>
      <rect x="3" y="5" width="5" height="8" />
      <rect x="9.5" y="5" width="5" height="8" />
      <rect x="16" y="5" width="5" height="8" />
      <path d="M3 18.5h18" strokeDasharray="1 2.5" />
    </>
  ),

  // Ações
  /** Adicionar, criar (Colecoes, Item, Comparar). */
  adicionar: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  /** Recolher ou tirar (Item, PC-Revisao). */
  recolher: <path d="M5 12h14" />,
  /** Confirmar, salvar, aprovado (Nota, Glossario, NovaHipotese). */
  confirmar: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  /** Copiar referência (Item, Bibliografia, Sitio). */
  copiar: (
    <>
      <rect x="8" y="8" width="12" height="12" />
      <path d="M16 8V4H4v12h4" />
    </>
  ),
  /** Editar a ficha (e as imagens) de um objeto SKC: lápis dentro de um quadrado (ObjetoSKC, decisão 34). */
  editarFicha: (
    <>
      <path d="M11 4H4v16h16v-7" />
      <path d="M17.5 3.5l3 3-8.5 8.5H9v-3z" />
    </>
  ),
  /** Registrar hipótese: camadas com + (ObjetoSKC, decisão 34). */
  registrarHipotese: (
    <>
      <path d="M13 6.5L12 6 3 10.5 12 15l9-4.5" />
      <path d="M3 15l9 4.5 9-4.5" />
      <path d="M19 2v6" />
      <path d="M16 5h6" />
    </>
  ),
  /** Escrever nota (Item). */
  escrever: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  /** Inserir link para objeto, verbete ou obra (Nota). */
  vincular: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  /** Excluir (PC-Notas). */
  excluir: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V4.5h5V7" />
      <path d="M6.5 7l1 13h9l1-13" />
    </>
  ),
  /** Deixar como está, arquivar o caso (PC-Revisao, Revisao). */
  arquivar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="4" />
      <path d="M5 8.5v11h14v-11" />
      <path d="M10 12.5h4" />
    </>
  ),
  /** Trocar o sítio escolhido (Item, ItemSitio). */
  trocar: (
    <>
      <path d="M4 8h14" />
      <path d="M15 5l3 3-3 3" />
      <path d="M20 16H6" />
      <path d="M9 13l-3 3 3 3" />
    </>
  ),
  /** Abrir em outra aba (PC-Sitio, PC-Sitios). */
  abrirExterno: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v6H4V6h6" />
    </>
  ),

  // Item
  /** Mostrar o original / a tradução (Item). */
  traducao: (
    <>
      <path d="M3 5h9" />
      <path d="M7.5 3v2" />
      <path d="M5 5c1 3.2 3.2 5.8 6 7.2" />
      <path d="M10 5c-1 3.2-3.2 5.8-6 7.2" />
      <path d="M13 21l4-9 4 9" />
      <path d="M14.5 17.5h5" />
    </>
  ),
  /** Ver todas as hipóteses por nível (Item). */
  niveis: (
    <>
      <path d="M12 4l9 4.5-9 4.5-9-4.5z" />
      <path d="M3 12.5l9 4.5 9-4.5" />
      <path d="M3 16.5l9 4.5 9-4.5" />
    </>
  ),
  /** Guardar na coleção (Item). */
  guardar: <path d="M6 3h12v18l-6-4-6 4z" />,
  /** Comparar objetos (Item, PC-Grupo). */
  comparar: (
    <>
      <rect x="3.5" y="5" width="7" height="14" />
      <rect x="13.5" y="5" width="7" height="14" />
    </>
  ),
  /** Só as diferenças na comparação (Comparar). */
  diferencas: (
    <>
      <path d="M5 8h14" />
      <path d="M5 16h6" />
      <path d="M15 13l4 6M19 13l-4 6" />
    </>
  ),

  // Imagem
  /** Ampliar a imagem (Item, Imagem). */
  ampliar: (
    <>
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </>
  ),
  /** Ajustar à tela (PC-Imagem). */
  ajustar: (
    <>
      <path d="M8 4H4v4" />
      <path d="M16 4h4v4" />
      <path d="M8 20H4v-4" />
      <path d="M16 20h4v-4" />
      <path d="M9 9h6v6H9z" />
    </>
  ),
  /** Alternar original e invertido (Imagem). */
  inverter: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" />
    </>
  ),
  /** Adicionar imagem ao objeto (ItemAdicionarImagem, PC-ItemAdicionarImagem). */
  adicionarImagem: (
    <>
      <path d="M13 5H4v14h14v-6" />
      <path d="M4 16l4-4 3 3 2-2 5 5" />
      <path d="M19 2v6" />
      <path d="M16 5h6" />
    </>
  ),
  /** Tirar foto com a câmera (ItemAdicionarImagem). */
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <path d="M15.5 13a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z" />
    </>
  ),
  /** Escolher da galeria de fotos (ItemAdicionarImagem). */
  fotos: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="M10.5 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
      <path d="M4 17l5-5 4 4 2-2 5 5" />
    </>
  ),
  /** Escolher do app Arquivos (ItemAdicionarImagem). */
  arquivos: <path d="M3 6h6l2 2h10v11H3z" />,
  /** Arrastar ou enviar arquivos (PC-ItemAdicionarImagem). */
  enviarArquivo: (
    <>
      <path d="M12 15V4" />
      <path d="M7.5 8.5L12 4l4.5 4.5" />
      <path d="M4 15v5h16v-5" />
    </>
  ),
  /** Marcar região (Imagem, NovaHipotese). */
  marcarRegiao: <path d="M4 8l6-4 9 3 1 9-7 5-8-3z" />,
  /** Mostrar ou ocultar as regiões (Imagem). */
  regioes: (
    <>
      <path d="M3 9l5-5 7 2 1 7-6 4-6-3z" />
      <path d="M12 12.5l5-2.5 4 4-2 6-6 0" strokeDasharray="2 2.2" />
    </>
  ),
  /** Desfazer o último ponto (Imagem). */
  desfazer: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  /** Mostrar (PC-Imagem). */
  mostrar: (
    <>
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
      <path d="M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z" />
    </>
  ),
  /** Ocultar (PC-Imagem). */
  ocultar: (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.9 5.7A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4" />
      <path d="M6.4 6.9C3.9 8.7 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.4 4.2-1" />
    </>
  ),

  // Sítios e ajuda
  /** Escolher no mapa (NovoSitio, Sitio). */
  mapa: (
    <>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </>
  ),
  /** Mira para clicar no mapa (PC-NovoSitio). */
  mira: (
    <>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 2v5" />
      <path d="M12 17v5" />
      <path d="M2 12h5" />
      <path d="M17 12h5" />
    </>
  ),
  /** Alfinete de mapa: «Mostrar no mapa» nas linhas do celular (SitiosMapa). */
  alfinete: (
    <>
      <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  /** Limites das regiões: o polígono tracejado (SitiosMapa, PC-SitiosMapa). */
  limites: <path d="M4 5l7-1.5 9 3-1.5 9.5L10 20l-6-3.5z" strokeDasharray="2.5 2.5" />,
  /** Opção escolhida (ItemSitio). */
  marcado: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
    </>
  ),
  /** Opção não escolhida (ItemSitio). */
  desmarcado: <circle cx="12" cy="12" r="8.5" />,
  /** Ajuda (Nota, PC-Notas). */
  ajuda: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5" />
      <path d="M12 16.8v.2" />
    </>
  ),
  /** Aviso de erro em campo (NovoSitio). */
  aviso: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.2v.3" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof GLIFOS
export type IconSize = 16 | 18 | 20 | 22

export const ICON_NAMES = Object.keys(GLIFOS) as IconName[]

interface IconProps {
  name: IconName
  size?: IconSize
}

/** Glifo decorativo: quem o usa dá o nome acessível (ver IconButton). */
export function Icon({ name, size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {GLIFOS[name]}
    </svg>
  )
}
