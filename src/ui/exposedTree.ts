/**
 * Painel dos comentarios que estao indo para o navegador.
 *
 * A conversao existia so na paleta de comandos e num quick fix -- caminhos que
 * ninguem encontra por acaso. Aqui o problema fica visivel por si: a lista
 * mostra arquivo por arquivo o que esta exposto, com o botao de converter ao
 * lado.
 */

import * as vscode from "vscode";

import { t } from "../l10n.ts";

export interface ExposedItem {
  readonly line: number;
  readonly text: string;
}

export interface ExposedFile {
  readonly uri: vscode.Uri;
  readonly source: string;
  readonly items: readonly ExposedItem[];
}

export type ExposedNode =
  | { readonly kind: "file"; readonly file: ExposedFile }
  | { readonly kind: "comment"; readonly file: ExposedFile; readonly item: ExposedItem };

export class ExposedTree implements vscode.TreeDataProvider<ExposedNode> {
  private readonly changed = new vscode.EventEmitter<ExposedNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  /** `undefined` enquanto o projeto ainda nao foi varrido. */
  private files: readonly ExposedFile[] | undefined;

  constructor(private readonly scanner: () => Promise<readonly ExposedFile[]>) {}

  /** Descarta o resultado atual; a proxima leitura do painel varre de novo. */
  invalidate(): void {
    this.files = undefined;
    this.changed.fire(undefined);
  }

  async refresh(): Promise<void> {
    this.files = await this.scanner();
    this.changed.fire(undefined);
  }

  /** Arquivos com comentario exposto, para o comando "converter tudo". */
  async currentFiles(): Promise<readonly ExposedFile[]> {
    if (this.files === undefined) {
      this.files = await this.scanner();
    }
    return this.files;
  }

  async getChildren(element?: ExposedNode): Promise<ExposedNode[]> {
    if (element === undefined) {
      // A varredura so acontece quando o painel e aberto: abrir o editor nao
      // pode custar a leitura do projeto inteiro.
      const files = await this.currentFiles();
      return files.map((file) => ({ kind: "file", file }) as const);
    }

    if (element.kind === "file") {
      return element.file.items.map(
        (item) => ({ kind: "comment", file: element.file, item }) as const,
      );
    }

    return [];
  }

  getTreeItem(element: ExposedNode): vscode.TreeItem {
    if (element.kind === "file") {
      const item = new vscode.TreeItem(
        element.file.source.split("/").pop() ?? element.file.source,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.description = `${element.file.items.length}`;
      item.tooltip = element.file.source;
      item.resourceUri = element.file.uri;
      item.iconPath = new vscode.ThemeIcon(
        "warning",
        new vscode.ThemeColor("problemsWarningIcon.foreground"),
      );
      item.contextValue = "exposedFile";
      return item;
    }

    const item = new vscode.TreeItem(
      element.item.text.replace(/\s+/g, " ").trim(),
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = t("tree.line", String(element.item.line + 1));
    item.iconPath = new vscode.ThemeIcon("eye");
    item.contextValue = "exposedComment";
    item.command = {
      command: "vscode.open",
      title: "",
      arguments: [
        element.file.uri,
        { selection: new vscode.Range(element.item.line, 0, element.item.line, 0) },
      ],
    };
    return item;
  }

  dispose(): void {
    this.changed.dispose();
  }
}
