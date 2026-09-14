/** Ponte entre o nucleo puro e o sistema de arquivos do VS Code. */

import * as vscode from "vscode";

import { type Detection, detectContext, type ProjectMarkers } from "./core/detect.ts";
import {
  type HiddenComment,
  SIDECAR_VERSION,
  parseSidecar,
  reanchor,
  serializeSidecar,
  sidecarPathFor,
} from "./core/sidecar.ts";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const markerCache = new Map<string, ProjectMarkers>();

/**
 * Le as dependencias do projeto para saber com que motor de template os
 * arquivos `.html` sao renderizados.
 *
 * Cobre `pyproject.toml` e `requirements.txt` porque os dois aparecem em
 * projetos Flask e Django reais -- o SER, por exemplo, usa `pyproject.toml`.
 */
export async function readProjectMarkers(
  folder: vscode.WorkspaceFolder,
): Promise<ProjectMarkers> {
  const cached = markerCache.get(folder.uri.toString());
  if (cached) {
    return cached;
  }

  const pythonFiles = ["pyproject.toml", "requirements.txt", "Pipfile", "setup.cfg"];
  let python = "";

  for (const name of pythonFiles) {
    python += await readIfPresent(vscode.Uri.joinPath(folder.uri, name));
  }

  const composer = await readIfPresent(vscode.Uri.joinPath(folder.uri, "composer.json"));
  const lowered = python.toLowerCase();

  const markers: ProjectMarkers = {
    flask: /\bflask\b/.test(lowered),
    django: /\bdjango\b/.test(lowered),
    jinja: /\bjinja2?\b/.test(lowered),
    laravel: /laravel\/framework/.test(composer.toLowerCase()),
  };

  markerCache.set(folder.uri.toString(), markers);
  return markers;
}

export function clearMarkerCache(): void {
  markerCache.clear();
}

async function readIfPresent(uri: vscode.Uri): Promise<string> {
  try {
    return decoder.decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return "";
  }
}

/** Resolve o contexto de um documento aberto. */
export async function detectForDocument(
  document: vscode.TextDocument,
): Promise<Detection | undefined> {
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const markers = folder ? await readProjectMarkers(folder) : undefined;
  const overrides = vscode.workspace
    .getConfiguration("hiddenComments")
    .get<Record<string, string>>("contexts", {});

  return detectContext({
    path: vscode.workspace.asRelativePath(document.uri, false),
    languageId: document.languageId,
    content: document.getText(),
    markers,
    overrides,
  });
}

function sidecarDirectory(): string {
  return vscode.workspace
    .getConfiguration("hiddenComments")
    .get<string>("sidecarDirectory", ".hidden-comments");
}

/** Guarda os comentarios que nao podem entrar no arquivo-fonte. */
export class SidecarStore {
  /** Comentarios cuja ancora sumiu, por arquivo. Alimenta o painel lateral. */
  readonly orphans = new Map<string, readonly HiddenComment[]>();

  private uriFor(document: vscode.TextDocument): vscode.Uri | undefined {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
      return undefined;
    }
    const relative = vscode.workspace.asRelativePath(document.uri, false);
    return vscode.Uri.joinPath(folder.uri, sidecarPathFor(relative, sidecarDirectory()));
  }

  /**
   * Carrega os comentarios de um documento, ja reancorados ao conteudo atual.
   *
   * A reancoragem acontece na leitura porque o arquivo pode ter mudado por
   * fora do editor -- um `git pull`, por exemplo.
   */
  async load(document: vscode.TextDocument): Promise<readonly HiddenComment[]> {
    const uri = this.uriFor(document);
    if (!uri) {
      return [];
    }

    const raw = await readIfPresent(uri);
    if (raw === "") {
      return [];
    }

    const file = parseSidecar(raw);
    if (!file) {
      return [];
    }

    const lines = document.getText().split("\n");
    const result = reanchor(file.comments, lines);

    this.orphans.set(document.uri.toString(), result.orphans);

    if (result.changed) {
      await this.write(uri, document, [...result.comments, ...result.orphans]);
    }

    return result.comments;
  }

  async add(document: vscode.TextDocument, comment: HiddenComment): Promise<void> {
    const current = await this.load(document);
    await this.persist(document, [...current, comment]);
  }

  async update(
    document: vscode.TextDocument,
    id: string,
    text: string,
  ): Promise<void> {
    const current = await this.load(document);
    await this.persist(
      document,
      current.map((item) => (item.id === id ? { ...item, text } : item)),
    );
  }

  async remove(document: vscode.TextDocument, id: string): Promise<void> {
    const current = await this.load(document);
    await this.persist(
      document,
      current.filter((item) => item.id !== id),
    );
  }

  private async persist(
    document: vscode.TextDocument,
    comments: readonly HiddenComment[],
  ): Promise<void> {
    const uri = this.uriFor(document);
    if (!uri) {
      return;
    }
    await this.write(uri, document, comments);
  }

  private async write(
    uri: vscode.Uri,
    document: vscode.TextDocument,
    comments: readonly HiddenComment[],
  ): Promise<void> {
    const relative = vscode.workspace.asRelativePath(document.uri, false);

    if (comments.length === 0) {
      try {
        await vscode.workspace.fs.delete(uri);
      } catch {
        // Nao existia: nada a apagar.
      }
      return;
    }

    const ordered = [...comments].sort((a, b) => a.line - b.line);
    const payload = serializeSidecar({
      version: SIDECAR_VERSION,
      source: relative,
      comments: ordered,
    });

    await vscode.workspace.fs.createDirectory(
      uri.with({ path: uri.path.slice(0, uri.path.lastIndexOf("/")) }),
    );
    await vscode.workspace.fs.writeFile(uri, encoder.encode(payload));
  }

  /** Varre o projeto atras de todos os sidecars, para o painel lateral. */
  async listAll(): Promise<Map<string, readonly HiddenComment[]>> {
    const found = new Map<string, readonly HiddenComment[]>();
    const pattern = `${sidecarDirectory()}/**/*.json`;

    for (const uri of await vscode.workspace.findFiles(pattern)) {
      const file = parseSidecar(await readIfPresent(uri));
      if (file && file.comments.length > 0) {
        found.set(file.source, file.comments);
      }
    }

    return found;
  }
}
