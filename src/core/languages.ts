/**
 * Registro de contextos: para cada tipo de arquivo, qual forma de comentario
 * nunca chega ao navegador e quais formas chegam.
 *
 * Esta e a unica fonte de verdade sobre seguranca de comentario no projeto.
 * Um contexto so pode declarar `safe` se a sintaxe for removida antes da
 * resposta HTTP -- seja porque o arquivo roda no servidor, seja porque o
 * motor de template ou o compilador a descarta ao gerar a saida.
 */

export type ContextId =
  | "jinja"
  | "blade"
  | "twig"
  | "handlebars"
  | "ejs"
  | "pug"
  | "sass"
  | "php"
  | "python"
  | "cstyle-server"
  | "hash-server"
  | "html"
  | "css"
  | "javascript"
  | "jsx"
  | "vue";

/** Uma sintaxe de comentario. Sem `close`, e um comentario de linha. */
export interface CommentSyntax {
  readonly open: string;
  readonly close?: string;
}

/** Trecho em que o pre-processador nao roda (Jinja `{% raw %}`, Blade `@verbatim`). */
export interface RawBlock {
  /** Fonte da expressao regular de abertura. */
  readonly open: string;
  readonly close: string;
}

export interface LanguageContext {
  readonly id: ContextId;
  /** Nome exibido na barra de status. */
  readonly label: string;
  /** Sintaxe que nunca chega ao navegador. Ausente = nao existe forma segura. */
  readonly safe?: CommentSyntax;
  /** Sintaxes que chegam ao navegador; usadas pela varredura. */
  readonly leaking: readonly CommentSyntax[];
  /**
   * Verdadeiro quando a seguranca depende do build: o comentario some se o
   * bundler minificar E nao publicar sourcemap. Como nenhuma das duas coisas
   * e garantida, esses contextos sao tratados como inseguros por padrao.
   */
  readonly buildDependent?: boolean;
  /**
   * A forma segura vale em qualquer ponto do arquivo.
   *
   * Jinja, Twig e Blade nao interpretam HTML: processam o arquivo como texto
   * antes de servir. Por isso `{# ... #}` desaparece ate dentro de um bloco
   * <script>, o que permite esconder tambem os comentarios de JavaScript e CSS
   * embutidos na pagina.
   */
  readonly textPreprocessor?: boolean;
  /** Trechos onde o pre-processador nao roda; nada ali pode ser convertido. */
  readonly rawBlocks?: readonly RawBlock[];
}

const HTML_COMMENT: CommentSyntax = { open: "<!--", close: "-->" };
const BLOCK_C: CommentSyntax = { open: "/*", close: "*/" };
const LINE_C: CommentSyntax = { open: "//" };

const CONTEXTS: Readonly<Record<ContextId, LanguageContext>> = {
  // --- Motores de template: a forma segura e descartada no servidor ---
  jinja: {
    id: "jinja",
    label: "Jinja2 / Django",
    safe: { open: "{#", close: "#}" },
    leaking: [HTML_COMMENT],
    textPreprocessor: true,
    rawBlocks: [{ open: "\\{%-?\\s*raw\\s*-?%\\}", close: "\\{%-?\\s*endraw\\s*-?%\\}" }],
  },
  twig: {
    id: "twig",
    label: "Twig",
    safe: { open: "{#", close: "#}" },
    leaking: [HTML_COMMENT],
    textPreprocessor: true,
    rawBlocks: [{ open: "\\{%-?\\s*raw\\s*-?%\\}", close: "\\{%-?\\s*endraw\\s*-?%\\}" }],
  },
  blade: {
    id: "blade",
    label: "Blade",
    safe: { open: "{{--", close: "--}}" },
    leaking: [HTML_COMMENT],
    textPreprocessor: true,
    rawBlocks: [{ open: "@verbatim\\b", close: "@endverbatim\\b" }],
  },
  handlebars: {
    id: "handlebars",
    label: "Handlebars",
    safe: { open: "{{!--", close: "--}}" },
    leaking: [HTML_COMMENT],
    textPreprocessor: true,
    rawBlocks: [{ open: "\\{\\{\\{\\{raw\\}\\}\\}\\}", close: "\\{\\{\\{\\{/raw\\}\\}\\}\\}" }],
  },
  ejs: {
    id: "ejs",
    label: "EJS",
    safe: { open: "<%#", close: "%>" },
    leaking: [HTML_COMMENT],
    textPreprocessor: true,
  },
  pug: {
    id: "pug",
    label: "Pug",
    safe: { open: "//-" },
    leaking: [LINE_C],
  },

  // --- Pre-processadores: o compilador descarta o comentario de linha ---
  sass: {
    id: "sass",
    label: "Sass / SCSS / Less",
    safe: LINE_C,
    leaking: [BLOCK_C],
  },

  // --- Linguagens de servidor: nada do arquivo chega ao navegador ---
  php: { id: "php", label: "PHP", safe: LINE_C, leaking: [] },
  python: { id: "python", label: "Python", safe: { open: "#" }, leaking: [] },
  "cstyle-server": {
    id: "cstyle-server",
    label: "Java / C# / Go",
    safe: LINE_C,
    leaking: [],
  },
  "hash-server": {
    id: "hash-server",
    label: "Ruby / Shell",
    safe: { open: "#" },
    leaking: [],
  },

  // --- Sem forma segura: o arquivo e servido como esta ---
  html: { id: "html", label: "HTML", leaking: [HTML_COMMENT] },
  css: { id: "css", label: "CSS", leaking: [BLOCK_C] },

  // --- Seguranca dependente do build ---
  javascript: {
    id: "javascript",
    label: "JavaScript / TypeScript",
    safe: LINE_C,
    leaking: [LINE_C, BLOCK_C],
    buildDependent: true,
  },
  jsx: {
    id: "jsx",
    label: "JSX / TSX / Astro",
    safe: LINE_C,
    leaking: [LINE_C, BLOCK_C],
    buildDependent: true,
  },
  vue: {
    id: "vue",
    label: "Vue SFC",
    safe: LINE_C,
    leaking: [HTML_COMMENT, LINE_C, BLOCK_C],
    buildDependent: true,
  },
};

export function getContext(id: ContextId): LanguageContext {
  return CONTEXTS[id];
}

export function allContexts(): readonly LanguageContext[] {
  return Object.values(CONTEXTS);
}

/**
 * Decide se o comentario pode ir para dentro do arquivo neste contexto.
 *
 * Devolve a sintaxe a usar, ou `undefined` quando o unico caminho seguro e
 * guardar o texto fora do arquivo (sidecar). Contextos dependentes de build
 * so liberam a escrita se o usuario assumir explicitamente o risco pela
 * configuracao `trustBuildForSourceMaps`.
 */
export function resolveSafeSyntax(
  context: LanguageContext,
  options: { readonly trustBuild: boolean },
): CommentSyntax | undefined {
  if (!context.safe) {
    return undefined;
  }
  if (context.buildDependent && !options.trustBuild) {
    return undefined;
  }
  return context.safe;
}

/**
 * Um contexto e "convertivel" quando existe uma forma segura fixa e distinta
 * da forma que vaza -- isto e, quando da para trocar uma pela outra sem
 * depender de como o projeto e construido.
 *
 * JavaScript e familia ficam de fora de proposito: trocar `/* *\/` por `//`
 * nao esconde nada, ja que as duas formas sobrevivem igualmente num bundle
 * sem minificacao. Nesses casos o caminho e o sidecar.
 */
export function isConvertible(context: LanguageContext): boolean {
  return context.safe !== undefined && context.buildDependent !== true;
}

/**
 * Sintaxes que a varredura deve procurar neste contexto.
 *
 * So devolve algo quando ha uma correcao concreta a oferecer. Apontar cada
 * `//` de um arquivo JavaScript geraria centenas de avisos sem acao possivel,
 * entao contextos nao convertiveis devolvem lista vazia.
 */
export function scanSyntaxes(context: LanguageContext): readonly CommentSyntax[] {
  return isConvertible(context) ? context.leaking : [];
}
