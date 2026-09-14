/**
 * Descobre em que contexto um arquivo esta, para saber qual comentario e seguro.
 *
 * O `languageId` do VS Code nao basta. Um projeto Flask ou Django guarda os
 * templates em arquivos `.html` comuns: sem uma extensao de Jinja instalada,
 * o editor os trata como HTML puro, e a extensao perderia justamente o caso
 * em que ela e mais util.
 *
 * A cascata vai do sinal mais forte ao mais fraco e, na duvida, nao chuta:
 * sem contexto reconhecido o comentario vai para o sidecar, que e seguro em
 * qualquer tipo de arquivo.
 */

import { type ContextId, type LanguageContext, getContext } from "./languages.ts";

export interface ProjectMarkers {
  readonly flask?: boolean;
  readonly django?: boolean;
  readonly jinja?: boolean;
  readonly laravel?: boolean;
}

export interface DetectionInput {
  /** Caminho do arquivo, relativo a raiz do projeto. */
  readonly path: string;
  /** `languageId` informado pelo VS Code. */
  readonly languageId?: string;
  /** Conteudo do arquivo (ou um prefixo dele). */
  readonly content?: string;
  readonly markers?: ProjectMarkers;
  /** Overrides do usuario: padrao glob -> id de contexto. */
  readonly overrides?: Readonly<Record<string, string>>;
}

export type DetectionReason =
  | "override"
  | "extension"
  | "content"
  | "project"
  | "languageId";

export interface Detection {
  readonly context: LanguageContext;
  readonly reason: DetectionReason;
}

const BY_EXTENSION: ReadonlyArray<readonly [string, ContextId]> = [
  // A ordem importa: `.blade.php` tem que ser testado antes de `.php`.
  [".blade.php", "blade"],
  [".twig", "twig"],
  [".njk", "jinja"],
  [".jinja2", "jinja"],
  [".jinja", "jinja"],
  [".j2", "jinja"],
  [".hbs", "handlebars"],
  [".handlebars", "handlebars"],
  [".mustache", "handlebars"],
  [".ejs", "ejs"],
  [".pug", "pug"],
  [".jade", "pug"],
  [".scss", "sass"],
  [".sass", "sass"],
  [".less", "sass"],
  [".php", "php"],
  [".py", "python"],
  [".java", "cstyle-server"],
  [".cs", "cstyle-server"],
  [".go", "cstyle-server"],
  [".rb", "hash-server"],
  [".sh", "hash-server"],
  [".vue", "vue"],
  [".jsx", "jsx"],
  [".tsx", "jsx"],
  [".astro", "jsx"],
  [".ts", "javascript"],
  [".mts", "javascript"],
  [".js", "javascript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".css", "css"],
];

const BY_LANGUAGE_ID: Readonly<Record<string, ContextId>> = {
  html: "html",
  css: "css",
  scss: "sass",
  less: "sass",
  javascript: "javascript",
  typescript: "javascript",
  javascriptreact: "jsx",
  typescriptreact: "jsx",
  vue: "vue",
  astro: "jsx",
  php: "php",
  python: "python",
  java: "cstyle-server",
  csharp: "cstyle-server",
  go: "cstyle-server",
  ruby: "hash-server",
  shellscript: "hash-server",
  "jinja-html": "jinja",
  jinja: "jinja",
  "django-html": "jinja",
  twig: "twig",
  blade: "blade",
  handlebars: "handlebars",
  pug: "pug",
};

/** Extensoes que sozinhas nao decidem nada e dependem de conteudo/projeto. */
const AMBIGUOUS_EXTENSIONS = [".html", ".htm"];

const CONTEXT_IDS = new Set<string>([
  "jinja", "blade", "twig", "handlebars", "ejs", "pug", "sass",
  "php", "python", "cstyle-server", "hash-server",
  "html", "css", "javascript", "jsx", "vue",
]);

export function detectContext(input: DetectionInput): Detection | undefined {
  const path = input.path.replace(/\\/g, "/").toLowerCase();

  const override = matchOverride(path, input.overrides);
  if (override) {
    return { context: getContext(override), reason: "override" };
  }

  const ambiguous = AMBIGUOUS_EXTENSIONS.some((ext) => path.endsWith(ext));

  if (!ambiguous) {
    const byExtension = BY_EXTENSION.find(([ext]) => path.endsWith(ext));
    if (byExtension) {
      return { context: getContext(byExtension[1]), reason: "extension" };
    }
  }

  const byContent = sniffContent(input.content);
  if (byContent) {
    return { context: getContext(byContent), reason: "content" };
  }

  if (ambiguous) {
    const byProject = inferFromProject(path, input.markers);
    if (byProject) {
      return { context: getContext(byProject), reason: "project" };
    }
  }

  const byLanguageId = input.languageId
    ? BY_LANGUAGE_ID[input.languageId]
    : undefined;
  if (byLanguageId) {
    return { context: getContext(byLanguageId), reason: "languageId" };
  }

  return undefined;
}

/**
 * Procura marcas inequivocas de motor de template no conteudo.
 *
 * `{{ ... }}` de proposito nao conta: Angular, Vue e Handlebars usam a mesma
 * marcacao, e tomar um template Angular por Jinja faria a extensao inserir
 * `{# ... #}`, que o navegador mostraria como texto na tela. So sinais
 * exclusivos de um motor sao aceitos.
 */
function sniffContent(content: string | undefined): ContextId | undefined {
  if (!content) {
    return undefined;
  }

  const head = content.slice(0, 8000);

  if (/\{%-?\s*(extends|block|include|if|for|load|csrf_token)\b/.test(head)) {
    return "jinja";
  }
  if (/\{#[\s\S]*?#\}/.test(head)) {
    return "jinja";
  }
  if (/^\s*@(extends|section|include|yield)\s*\(/m.test(head)) {
    return "blade";
  }
  if (/\{\{!--[\s\S]*?--\}\}/.test(head)) {
    return "handlebars";
  }
  if (/<%[-=#]?[\s\S]*?%>/.test(head)) {
    return "ejs";
  }

  return undefined;
}

/** Usa as dependencias do projeto para decidir o que e um `.html` ambiguo. */
function inferFromProject(
  path: string,
  markers: ProjectMarkers | undefined,
): ContextId | undefined {
  if (!markers) {
    return undefined;
  }

  const inTemplateFolder = /(^|\/)templates?\//.test(path);

  if (inTemplateFolder && (markers.flask || markers.django || markers.jinja)) {
    return "jinja";
  }
  if (inTemplateFolder && markers.laravel) {
    return "blade";
  }

  return undefined;
}

function matchOverride(
  path: string,
  overrides: Readonly<Record<string, string>> | undefined,
): ContextId | undefined {
  if (!overrides) {
    return undefined;
  }

  for (const [pattern, contextId] of Object.entries(overrides)) {
    if (CONTEXT_IDS.has(contextId) && globToRegExp(pattern).test(path)) {
      return contextId as ContextId;
    }
  }

  return undefined;
}

/** Conversao minima de glob para expressao regular: cobre `**`, `*` e `?`. */
export function globToRegExp(pattern: string): RegExp {
  const lower = pattern.toLowerCase();
  let source = "";
  let index = 0;

  while (index < lower.length) {
    const char = lower[index] as string;

    if (char === "*") {
      if (lower.startsWith("**/", index)) {
        source += "(?:.*/)?";
        index += 3;
        continue;
      }
      if (lower.startsWith("**", index)) {
        source += ".*";
        index += 2;
        continue;
      }
      source += "[^/]*";
      index += 1;
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      index += 1;
      continue;
    }

    source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    index += 1;
  }

  return new RegExp(`^${source}$`);
}
