/**
 * Localiza comentarios no texto fonte.
 *
 * Nao e um parser completo de HTML ou CSS -- e um varredor deliberadamente
 * conservador, que prefere ignorar um comentario a marcar como comentario
 * algo que nao e. Marcar errado significaria alterar codigo valido durante a
 * conversao, que e o pior desfecho possivel para esta extensao.
 */

import type { CommentSyntax } from "./languages.ts";

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
