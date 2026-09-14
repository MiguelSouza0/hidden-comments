/** Painel lateral com todos os comentarios ocultos do projeto. */

import * as vscode from "vscode";

import type { HiddenComment } from "../core/sidecar.ts";
import type { SidecarStore } from "../workspace.ts";
import { t } from "../l10n.ts";

export type Node =
  | { readonly kind: "file"; readonly source: string; readonly comments: readonly HiddenComment[] }
  | { readonly kind: "comment"; readonly source: string; readonly comment: HiddenComment };

export class CommentTree implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly store: SidecarStore) {}

  refresh(): void {
    this.changed.fire(undefined);
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (element === undefined) {
      const all = await this.store.listAll();
      return [...all.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([source, comments]) => ({ kind: "file", source, comments }) as const);
    }

    if (element.kind === "file") {
      return [...element.comments]
        .sort((a, b) => a.line - b.line)
        .map((comment) => ({ kind: "comment", source: element.source, comment }) as const);
    }

    return [];
  }

  getTreeItem(element: Node): vscode.TreeItem {
    if (element.kind === "file") {
      const item = new vscode.TreeItem(
        element.source.split("/").pop() ?? element.source,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.description = `${element.comments.length}`;
      item.tooltip = element.source;
      item.resourceUri = vscode.Uri.file(element.source);
      item.iconPath = vscode.ThemeIcon.File;
      return item;
    }

    const { comment } = element;
    const item = new vscode.TreeItem(
      comment.text.replace(/\s+/g, " ").trim(),
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = t("tree.line", String(comment.line + 1));
    item.tooltip = new vscode.MarkdownString(
      `**${comment.author || "?"}**\n\n${comment.text}`,
    );
    item.contextValue = "comment";
    item.iconPath = new vscode.ThemeIcon("comment");
    item.command = {
      command: "hiddenComments.openComment",
      title: "",
      arguments: [element.source, comment.line, comment.id],
    };
    return item;
  }

  dispose(): void {
    this.changed.dispose();
  }
}
