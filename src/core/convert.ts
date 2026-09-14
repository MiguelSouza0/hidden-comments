/** Planejamento da conversao de comentarios expostos para a forma segura. */

import { type LanguageContext, resolveSafeSyntax, scanSyntaxes } from "./languages.ts";
import { rewrap } from "./comment.ts";
import { findComments } from "./scan.ts";

export interface Replacement {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  /** Texto original, para exibir na pre-visualizacao. */
  readonly original: string;
}

/**
 * Lista as substituicoes que tornariam seguros os comentarios de um arquivo.
 *
 * Devolve lista vazia quando nao ha o que fazer -- contexto sem forma segura,
 * ou arquivo que ja usa so a forma segura. Por consequencia a operacao e
 * idempotente: rodar de novo sobre o resultado nao encontra nada.
 */
export function planConversion(
  source: string,
  context: LanguageContext,
): Replacement[] {
  const safe = resolveSafeSyntax(context, { trustBuild: false });
  const syntaxes = scanSyntaxes(context);

  if (safe === undefined || syntaxes.length === 0) {
    return [];
  }

  return findComments(source, syntaxes).map((comment) => ({
    start: comment.start,
    end: comment.end,
    text: rewrap(safe, comment.inner),
    original: source.slice(comment.start, comment.end),
  }));
}

/** Aplica as substituicoes ao texto. Usado nos testes e na pre-visualizacao. */
export function applyReplacements(
  source: string,
  replacements: readonly Replacement[],
): string {
  const ordered = [...replacements].sort((a, b) => b.start - a.start);
  let result = source;

  for (const replacement of ordered) {
    result =
      result.slice(0, replacement.start) +
      replacement.text +
      result.slice(replacement.end);
  }

  return result;
}
