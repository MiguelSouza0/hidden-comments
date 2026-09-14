/** Montagem e desmontagem de comentarios na sintaxe de cada contexto. */

import type { CommentSyntax } from "./languages.ts";

export interface FormatOptions {
  /** Indentacao aplicada a cada linha a partir da segunda. */
  readonly indent?: string;
}

/**
 * Monta um comentario novo a partir do texto digitado pelo usuario.
 *
 * Texto de uma linha vira um comentario de uma linha; texto com quebras vira
 * um bloco, ou varias linhas de comentario quando a sintaxe nao tem
 * fechamento.
 */
export function formatComment(
  syntax: CommentSyntax,
  text: string,
  options: FormatOptions = {},
): string {
  const indent = options.indent ?? "";
  const lines = text.split("\n").map((line) => line.trim());

  if (syntax.close === undefined) {
    return lines
      .map((line, position) =>
        position === 0 ? `${syntax.open} ${line}` : `${indent}${syntax.open} ${line}`,
      )
      .join("\n");
  }

  if (lines.length === 1) {
    return `${syntax.open} ${lines[0] ?? ""} ${syntax.close}`;
  }

  const body = lines.map((line) => `${indent}  ${line}`).join("\n");
  return `${syntax.open}\n${body}\n${indent}${syntax.close}`;
}

/**
 * Troca os delimitadores de um comentario existente, preservando o miolo.
 *
 * Usado pela conversao: o texto que a equipe escreveu tem que sair do outro
 * lado intacto, inclusive a indentacao interna de comentarios de varias
 * linhas. So o espacamento junto aos delimitadores e normalizado.
 */
export function rewrap(syntax: CommentSyntax, inner: string): string {
  if (syntax.close === undefined) {
    return inner
      .split("\n")
      .map((line) => `${syntax.open} ${line.trim()}`)
      .join("\n");
  }

  if (inner.includes("\n")) {
    return `${syntax.open}${inner}${syntax.close}`;
  }

  return `${syntax.open} ${inner.trim()} ${syntax.close}`;
}
