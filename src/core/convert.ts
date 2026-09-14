/** Planejamento da conversao de comentarios expostos para a forma segura. */

import { type LanguageContext, resolveSafeSyntax, scanSyntaxes } from "./languages.ts";
import { rewrap } from "./comment.ts";
import {
  dropOverlapping,
  findComments,
  findEmbeddedComments,
  findRawRegions,
  isInsideRegion,
} from "./scan.ts";

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

  const found = [...findComments(source, syntaxes)];

  // Em motor de template, o comentario seguro tambem vale dentro de <script> e
  // <style>: o arquivo e processado como texto antes de virar resposta HTTP.
  if (context.textPreprocessor) {
    found.push(...findEmbeddedComments(source));
  }

  // Dentro de {% raw %} o pre-processador nao roda. Converter ali faria o
  // contrario do prometido: o {# ... #} apareceria como texto na pagina.
  const raw = findRawRegions(source, context.rawBlocks ?? []);

  return dropOverlapping(found)
    .filter((comment) => !isInsideRegion(comment.start, raw))
    .map((comment) => ({
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
