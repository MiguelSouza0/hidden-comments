/**
 * Armazenamento dos comentarios que nao podem entrar no arquivo-fonte.
 *
 * Um JSON por arquivo, versionado junto com o codigo. O modulo e puro: nao
 * toca em disco, so transforma texto e estruturas -- o acesso a arquivos fica
 * na camada do VS Code.
 *
 * O problema central aqui e a ancoragem. Guardar so o numero da linha faz o
 * comentario mentir assim que alguem insere codigo acima dele. Por isso cada
 * comentario carrega a impressao digital da linha que anotou e das linhas em
 * volta, o que permite reencontra-la depois que o arquivo muda.
 */

import { createHash } from "node:crypto";

export const SIDECAR_VERSION = 1;

export interface HiddenComment {
  readonly id: string;
  /** Linha onde o comentario aparece, base zero. */
  readonly line: number;
  /**
   * Distancia ate a linha que serve de ancora.
   *
   * Quase sempre zero. Quando o comentario cai numa linha em branco, a ancora
   * passa a ser a linha de codigo mais proxima -- linha vazia nao identifica
   * nada, e um arquivo tem dezenas delas.
   */
  readonly anchorOffset: number;
  /** Impressao digital da linha ancorada. */
  readonly anchor: string;
  /** Impressao digital da vizinhanca, usada quando a linha sozinha nao basta. */
  readonly context: string;
  readonly text: string;
  readonly author: string;
  readonly createdAt: string;
}

export interface SidecarFile {
  readonly version: number;
  readonly source: string;
  readonly comments: readonly HiddenComment[];
}

export interface ReanchorResult {
  /** Comentarios que continuam ancorados, com a linha ja corrigida. */
  readonly comments: readonly HiddenComment[];
  /** Comentarios cuja linha desapareceu do arquivo. */
  readonly orphans: readonly HiddenComment[];
  /** Verdadeiro quando alguma linha mudou e o arquivo precisa ser regravado. */
  readonly changed: boolean;
}

/** Quantas linhas de cada lado entram na impressao digital da vizinhanca. */
const CONTEXT_RADIUS = 2;

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

/** Normaliza a linha antes do hash: reindentar nao deve quebrar a ancora. */
function normalize(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

/**
 * Impressao digital de uma linha.
 *
 * Linha em branco devolve string vazia de proposito: um arquivo tem dezenas
 * delas, e casar por linha vazia ancoraria o comentario em qualquer lugar.
 * Nesses casos so a vizinhanca decide.
 */
export function fingerprint(line: string | undefined): string {
  const normalized = normalize(line ?? "");
  return normalized === "" ? "" : sha1(normalized);
}

/** Impressao digital da linha somada as vizinhas. */
export function contextFingerprint(lines: readonly string[], index: number): string {
  const start = Math.max(0, index - CONTEXT_RADIUS);
  const end = Math.min(lines.length, index + CONTEXT_RADIUS + 1);
  const window = lines.slice(start, end).map(normalize).join("\n");
  return sha1(window);
}

/**
 * Encontra a linha de codigo mais proxima para servir de ancora.
 *
 * Procura primeiro para baixo, porque um comentario normalmente se refere ao
 * codigo que vem depois dele.
 */
function findAnchorLine(lines: readonly string[], line: number): number {
  if (fingerprint(lines[line]) !== "") {
    return line;
  }

  for (let distance = 1; distance < lines.length; distance += 1) {
    const below = line + distance;
    if (below < lines.length && fingerprint(lines[below]) !== "") {
      return below;
    }
    const above = line - distance;
    if (above >= 0 && fingerprint(lines[above]) !== "") {
      return above;
    }
  }

  return line; // arquivo inteiro em branco
}

export function createComment(params: {
  readonly lines: readonly string[];
  readonly line: number;
  readonly text: string;
  readonly author: string;
  readonly now?: Date;
}): HiddenComment {
  const { lines, line, text, author } = params;
  const anchorLine = findAnchorLine(lines, line);

  return {
    id: `c_${sha1(`${line}:${text}:${Date.now()}:${Math.random()}`).slice(0, 8)}`,
    line,
    anchorOffset: anchorLine - line,
    anchor: fingerprint(lines[anchorLine]),
    context: contextFingerprint(lines, anchorLine),
    text,
    author,
    createdAt: (params.now ?? new Date()).toISOString(),
  };
}

/**
 * Reancora os comentarios no conteudo atual do arquivo.
 *
 * Ordem de tentativa: a linha original, depois a linha mais proxima com a
 * mesma impressao digital, depois a vizinhanca. Nao encontrando nenhuma, o
 * comentario vira orfao em vez de apontar em silencio para a linha errada.
 */
export function reanchor(
  comments: readonly HiddenComment[],
  lines: readonly string[],
): ReanchorResult {
  const anchored: HiddenComment[] = [];
  const orphans: HiddenComment[] = [];
  let changed = false;

  for (const comment of comments) {
    const anchorLine = findAnchorLine2(comment, lines);

    if (anchorLine === undefined) {
      orphans.push(comment);
      changed = true;
      continue;
    }

    const target = clamp(anchorLine - comment.anchorOffset, lines.length);

    if (target === comment.line) {
      anchored.push(comment);
      continue;
    }

    changed = true;
    anchored.push({
      ...comment,
      line: target,
      context: contextFingerprint(lines, anchorLine),
    });
  }

  return { comments: anchored, orphans, changed };
}

function clamp(value: number, length: number): number {
  return Math.min(Math.max(value, 0), Math.max(length - 1, 0));
}

/**
 * Reencontra a linha que serve de ancora ao comentario.
 *
 * Quando a mesma linha aparece varias vezes no arquivo -- coisa comum em CSS
 * e em marcacao repetitiva -- a impressao digital sozinha nao decide. Nesses
 * casos a vizinhanca desempata, e so depois a proximidade da posicao antiga.
 */
function findAnchorLine2(
  comment: HiddenComment,
  lines: readonly string[],
): number | undefined {
  const previous = comment.line + comment.anchorOffset;

  if (comment.anchor === "") {
    return undefined; // ancora invalida: nao ha como reencontrar
  }

  if (fingerprint(lines[previous]) === comment.anchor) {
    return previous;
  }

  const candidates: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (fingerprint(lines[index]) === comment.anchor) {
      candidates.push(index);
    }
  }

  if (candidates.length === 0) {
    return undefined;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }

  const byContext = candidates.filter(
    (index) => contextFingerprint(lines, index) === comment.context,
  );
  const pool = byContext.length > 0 ? byContext : candidates;

  return pool.reduce((best, index) =>
    Math.abs(index - previous) < Math.abs(best - previous) ? index : best,
  );
}

/** Caminho do sidecar correspondente a um arquivo-fonte. */
export function sidecarPathFor(sourcePath: string, directory: string): string {
  const clean = sourcePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${directory}/${clean}.json`;
}

export function serializeSidecar(file: SidecarFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Le o JSON do sidecar, devolvendo `undefined` para conteudo invalido. */
export function parseSidecar(raw: string): SidecarFile | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }

  const candidate = parsed as Partial<SidecarFile>;
  if (!Array.isArray(candidate.comments) || typeof candidate.source !== "string") {
    return undefined;
  }

  const comments = candidate.comments.filter(isHiddenComment);
  return { version: SIDECAR_VERSION, source: candidate.source, comments };
}

function isHiddenComment(value: unknown): value is HiddenComment {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Partial<HiddenComment>;
  return (
    typeof item.id === "string" &&
    typeof item.line === "number" &&
    typeof item.anchorOffset === "number" &&
    typeof item.text === "string" &&
    typeof item.anchor === "string" &&
    typeof item.context === "string"
  );
}
