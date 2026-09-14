/**
 * Localiza comentarios no texto fonte.
 *
 * Nao e um parser completo de HTML ou CSS -- e um varredor deliberadamente
 * conservador, que prefere ignorar um comentario a marcar como comentario
 * algo que nao e. Marcar errado significaria alterar codigo valido durante a
 * conversao, que e o pior desfecho possivel para esta extensao.
 */

import type { CommentSyntax, RawBlock } from "./languages.ts";

export interface FoundComment {
  /** Deslocamento do inicio do delimitador de abertura. */
  readonly start: number;
  /** Deslocamento logo apos o delimitador de fechamento. */
  readonly end: number;
  readonly syntax: CommentSyntax;
  /** Texto entre os delimitadores, sem nenhuma normalizacao. */
  readonly inner: string;
}

const SKIPPED_HTML_BLOCKS = ["script", "style"];

/**
 * Comentarios `<!-- -->`, pulando o conteudo de <script> e <style>.
 *
 * Dentro dessas tags, `<!--` nao abre comentario HTML: pertence ao JavaScript
 * ou ao CSS ali dentro e nao pode ser tocado.
 */
export function findHtmlComments(source: string): FoundComment[] {
  const found: FoundComment[] = [];
  const syntax: CommentSyntax = { open: "<!--", close: "-->" };
  let index = 0;

  while (index < source.length) {
    const skipTo = skipRawTextBlock(source, index);
    if (skipTo !== undefined) {
      index = skipTo;
      continue;
    }

    if (source.startsWith("<!--", index)) {
      const closeAt = source.indexOf("-->", index + 4);
      if (closeAt === -1) {
        break; // comentario sem fechamento: nao mexer
      }
      found.push({
        start: index,
        end: closeAt + 3,
        syntax,
        inner: source.slice(index + 4, closeAt),
      });
      index = closeAt + 3;
      continue;
    }

    index += 1;
  }

  return found;
}

/** Se `index` abre um <script>/<style>, devolve o offset apos a tag de fechamento. */
function skipRawTextBlock(source: string, index: number): number | undefined {
  if (source[index] !== "<") {
    return undefined;
  }

  for (const tag of SKIPPED_HTML_BLOCKS) {
    const head = source.slice(index, index + tag.length + 1).toLowerCase();
    if (head !== `<${tag}`) {
      continue;
    }
    // Confirma que e mesmo a tag, e nao um prefixo (<scriptish>).
    const after = source[index + tag.length + 1];
    if (after !== undefined && !/[\s>/]/.test(after)) {
      continue;
    }
    const closing = new RegExp(`</${tag}\\s*>`, "i");
    const rest = source.slice(index);
    const match = closing.exec(rest);
    return match ? index + match.index + match[0].length : source.length;
  }

  return undefined;
}

/**
 * Comentarios de bloco (`/* *\/`), ignorando os que estao dentro de strings.
 *
 * `content: "/* isto nao e comentario *\/"` e CSS valido, e converter esse
 * trecho quebraria a folha de estilo.
 */
export function findBlockComments(
  source: string,
  syntax: CommentSyntax,
): FoundComment[] {
  const close = syntax.close;
  if (close === undefined) {
    throw new Error("findBlockComments exige uma sintaxe com fechamento");
  }

  const found: FoundComment[] = [];
  let index = 0;

  while (index < source.length) {
    const afterString = skipString(source, index);
    if (afterString !== undefined) {
      index = afterString;
      continue;
    }

    if (source.startsWith(syntax.open, index)) {
      const closeAt = source.indexOf(close, index + syntax.open.length);
      if (closeAt === -1) {
        break;
      }
      found.push({
        start: index,
        end: closeAt + close.length,
        syntax,
        inner: source.slice(index + syntax.open.length, closeAt),
      });
      index = closeAt + close.length;
      continue;
    }

    index += 1;
  }

  return found;
}

/** Comentarios de linha, ignorando os que estao dentro de strings. */
export function findLineComments(
  source: string,
  syntax: CommentSyntax,
): FoundComment[] {
  const found: FoundComment[] = [];
  let index = 0;

  while (index < source.length) {
    const afterString = skipString(source, index);
    if (afterString !== undefined) {
      index = afterString;
      continue;
    }

    if (source.startsWith(syntax.open, index)) {
      let lineEnd = source.indexOf("\n", index);
      if (lineEnd === -1) {
        lineEnd = source.length;
      }
      found.push({
        start: index,
        end: lineEnd,
        syntax,
        inner: source.slice(index + syntax.open.length, lineEnd),
      });
      index = lineEnd;
      continue;
    }

    index += 1;
  }

  return found;
}

/** Se `index` abre uma string, devolve o offset logo apos o fechamento. */
function skipString(source: string, index: number): number | undefined {
  const quote = source[index];
  if (quote !== '"' && quote !== "'" && quote !== "`") {
    return undefined;
  }

  let cursor = index + 1;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === "\\") {
      cursor += 2;
      continue;
    }
    if (char === quote) {
      return cursor + 1;
    }
    // String de aspas simples/duplas nao atravessa linha em CSS nem em JS.
    if (char === "\n" && quote !== "`") {
      return cursor;
    }
    cursor += 1;
  }

  return source.length;
}

/** Busca todas as sintaxes informadas e devolve os achados em ordem de posicao. */
export function findComments(
  source: string,
  syntaxes: readonly CommentSyntax[],
): FoundComment[] {
  const found: FoundComment[] = [];

  for (const syntax of syntaxes) {
    if (syntax.open === "<!--") {
      found.push(...findHtmlComments(source));
    } else if (syntax.close !== undefined) {
      found.push(...findBlockComments(source, syntax));
    } else {
      found.push(...findLineComments(source, syntax));
    }
  }

  return found.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Comentarios embutidos em <script> e <style>
// ---------------------------------------------------------------------------

export interface Region {
  readonly start: number;
  readonly end: number;
}

const SCRIPT_SYNTAXES: readonly CommentSyntax[] = [
  { open: "/*", close: "*/" },
  { open: "//" },
];
const STYLE_SYNTAXES: readonly CommentSyntax[] = [{ open: "/*", close: "*/" }];

/**
 * Prefixos que parecem comentario mas sao instrucao para alguma ferramenta.
 *
 * Converter qualquer um destes mudaria o comportamento do codigo: o linter
 * deixaria de ser desligado, o sourcemap sumiria, a licenca que o minificador
 * deve preservar seria descartada, o tipo anotado em JSDoc pararia de valer.
 */
const PRAGMA = new RegExp(
  [
    "^\\s*!", // /*! ... */ preservado por minificadores
    "^\\s*#", // //# sourceMappingURL
    "^\\*", // /** ... */ JSDoc
    "^/?\\s*<", // /// <reference ... /> (a terceira barra entra no conteudo)
    "^\\s*@", // @license, @preserve, @ts-ignore, @jsx
    "^\\s*(eslint|prettier|ts-|tslint|jshint|jslint|stylelint|biome)",
    "^\\s*(global|globals|exported|istanbul|c8|v8|webpack|vite|rollup|esbuild)\\b",
    "^\\s*@__PURE__",
  ].join("|"),
);

export function isPragma(inner: string): boolean {
  return PRAGMA.test(inner);
}

/** Conteudo interno de cada bloco <script> e <style> do documento. */
export function findEmbeddedRegions(
  source: string,
): ReadonlyArray<Region & { readonly kind: "script" | "style" }> {
  const regions: Array<Region & { kind: "script" | "style" }> = [];

  for (const kind of ["script", "style"] as const) {
    const opening = new RegExp(`<${kind}\\b[^>]*>`, "gi");
    let match: RegExpExecArray | null;

    while ((match = opening.exec(source)) !== null) {
      const start = match.index + match[0].length;
      const closing = new RegExp(`</${kind}\\s*>`, "i").exec(source.slice(start));
      const end = closing ? start + closing.index : source.length;

      regions.push({ kind, start, end });
      opening.lastIndex = end;
    }
  }

  return regions.sort((a, b) => a.start - b.start);
}

/** Trechos protegidos por `{% raw %}`, `@verbatim` e equivalentes. */
export function findRawRegions(
  source: string,
  blocks: readonly RawBlock[],
): readonly Region[] {
  const regions: Region[] = [];

  for (const block of blocks) {
    const opening = new RegExp(block.open, "gi");
    let match: RegExpExecArray | null;

    while ((match = opening.exec(source)) !== null) {
      const closing = new RegExp(block.close, "i").exec(source.slice(match.index));
      const end = closing ? match.index + closing.index + closing[0].length : source.length;

      regions.push({ start: match.index, end });
      opening.lastIndex = end;
    }
  }

  return regions;
}

export function isInsideRegion(offset: number, regions: readonly Region[]): boolean {
  return regions.some((region) => offset >= region.start && offset < region.end);
}

/** Verdadeiro quando so ha espaco em branco entre o inicio da linha e o offset. */
function startsLine(source: string, offset: number): boolean {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  return source.slice(lineStart, offset).trim() === "";
}

/**
 * Comentarios de JavaScript e CSS dentro de <script> e <style>.
 *
 * So aceita comentario que ocupa a linha inteira. Um `//` no meio da linha
 * pode estar dentro de uma expressao regular -- `/https?:\/\//` termina com
 * duas barras -- e converter aquilo quebraria o codigo. Comentario de
 * documentacao, que e o que interessa esconder, quase sempre comeca a linha.
 */
export function findEmbeddedComments(source: string): FoundComment[] {
  const found: FoundComment[] = [];

  for (const region of findEmbeddedRegions(source)) {
    const inner = source.slice(region.start, region.end);
    const syntaxes = region.kind === "script" ? SCRIPT_SYNTAXES : STYLE_SYNTAXES;

    for (const syntax of syntaxes) {
      const items =
        syntax.close !== undefined
          ? findBlockComments(inner, syntax)
          : findLineComments(inner, syntax);

      for (const item of items) {
        const start = region.start + item.start;
        if (!startsLine(source, start) || isPragma(item.inner)) {
          continue;
        }
        found.push({ ...item, start, end: region.start + item.end });
      }
    }
  }

  return dropOverlapping(found);
}

/**
 * Descarta achados contidos em outro.
 *
 * Um `// nota` dentro de um bloco `/* ... *\/` seria encontrado duas vezes, e
 * aplicar as duas substituicoes corromperia o arquivo.
 */
export function dropOverlapping(found: readonly FoundComment[]): FoundComment[] {
  const ordered = [...found].sort((a, b) => a.start - b.start || b.end - a.end);
  const result: FoundComment[] = [];
  let lastEnd = -1;

  for (const item of ordered) {
    if (item.start >= lastEnd) {
      result.push(item);
      lastEnd = item.end;
    }
  }

  return result;
}
