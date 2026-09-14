/**
 * Textos da extensao em portugues e ingles.
 *
 * A API `vscode.l10n` resolve o idioma pelo do editor e nao aceita troca em
 * tempo de execucao. Como a extensao precisa de uma alternancia propria
 * (`hiddenComments.language`), as mensagens ficam neste dicionario. Os titulos
 * de comando e as descricoes de configuracao continuam nos arquivos
 * `package.nls*.json`, que e o mecanismo que o VS Code exige para eles.
 */

import * as vscode from "vscode";

export type Locale = "en" | "pt-br";

type Dictionary = Readonly<Record<string, Readonly<Record<Locale, string>>>>;

const MESSAGES: Dictionary = {
  "status.on": { en: "Hidden comments: on", "pt-br": "Comentarios ocultos: ativo" },
  "status.off": { en: "Hidden comments: off", "pt-br": "Comentarios ocultos: inativo" },
  "status.tooltip": {
    en: "Click to turn hidden comments on or off",
    "pt-br": "Clique para ativar ou desativar os comentarios ocultos",
  },
  "status.context": { en: "Context: {0}", "pt-br": "Contexto: {0}" },
  "status.contextUnknown": { en: "no context", "pt-br": "sem contexto" },
  "status.hidden": { en: "(comments hidden)", "pt-br": "(comentarios escondidos)" },

  "prompt.comment": {
    en: "Hidden comment (it will not reach the browser)",
    "pt-br": "Comentario oculto (nao chega ao navegador)",
  },
  "prompt.commentPlaceholder": {
    en: "e.g. this z-index fights with the modal",
    "pt-br": "ex.: esse z-index briga com o modal",
  },
  "prompt.edit": { en: "Edit hidden comment", "pt-br": "Editar comentario oculto" },

  "msg.noEditor": { en: "Open a file first.", "pt-br": "Abra um arquivo primeiro." },
  "msg.disabled": {
    en: "Hidden Comments is turned off. Turn it on in the status bar.",
    "pt-br": "A extensao esta desativada. Ative pela barra de status.",
  },
  "msg.insertedSafe": {
    en: "Comment written as {0} - it is stripped before the response reaches the browser.",
    "pt-br": "Comentario escrito como {0} - e removido antes da resposta chegar ao navegador.",
  },
  "msg.insertedSidecar": {
    en: "{0} has no comment syntax that stays out of the browser, so the comment was stored outside the file.",
    "pt-br": "{0} nao tem sintaxe de comentario que fique fora do navegador, entao o comentario foi guardado fora do arquivo.",
  },
  "msg.sidecarUnknown": {
    en: "Unrecognized file type: the comment was stored outside the file, which is always safe.",
    "pt-br": "Tipo de arquivo nao reconhecido: o comentario foi guardado fora do arquivo, o que e sempre seguro.",
  },
  "msg.buildDependent": {
    en: "In {0} a comment only disappears if the build minifies and publishes no source map. Stored outside the file instead.",
    "pt-br": "Em {0} o comentario so some se o build minificar e nao publicar sourcemap. Guardado fora do arquivo.",
  },

  "msg.scanClean": {
    en: "No exposed comments in {0}.",
    "pt-br": "Nenhum comentario exposto em {0}.",
  },
  "msg.scanFound": {
    en: "{0} exposed comment(s) in {1} file(s).",
    "pt-br": "{0} comentario(s) exposto(s) em {1} arquivo(s).",
  },
  "msg.convertClean": {
    en: "Nothing to convert.",
    "pt-br": "Nada a converter.",
  },
  "msg.convertReady": {
    en: "{0} comment(s) ready to convert. Review and apply in the preview panel.",
    "pt-br": "{0} comentario(s) prontos para converter. Revise e aplique no painel de pre-visualizacao.",
  },
  "msg.convertNotSupported": {
    en: "{0} has no safe comment syntax, so there is nothing to convert to.",
    "pt-br": "{0} nao tem sintaxe segura de comentario, entao nao ha para onde converter.",
  },
  "msg.deleted": { en: "Comment removed.", "pt-br": "Comentario removido." },
  "msg.orphaned": {
    en: "{0} hidden comment(s) lost their anchor after the file changed.",
    "pt-br": "{0} comentario(s) oculto(s) perderam a ancora depois que o arquivo mudou.",
  },

  "diag.exposed": {
    en: "This comment is served to the browser. Convert it to {0}.",
    "pt-br": "Este comentario vai para o navegador. Converta para {0}.",
  },
  "diag.source": { en: "Hidden Comments", "pt-br": "Comentarios Ocultos" },
  "action.convert": { en: "Convert", "pt-br": "Converter" },
  "action.convertFile": { en: "Convert this file", "pt-br": "Converter este arquivo" },

  "tree.orphans": { en: "Lost anchor", "pt-br": "Ancora perdida" },
  "tree.empty": {
    en: "No hidden comments in this project yet.",
    "pt-br": "Nenhum comentario oculto neste projeto ainda.",
  },
  "tree.line": { en: "line {0}", "pt-br": "linha {0}" },

  "confirm.delete": {
    en: "Remove this hidden comment?",
    "pt-br": "Remover este comentario oculto?",
  },
  "confirm.yes": { en: "Remove", "pt-br": "Remover" },

  "context.safe": {
    en: "{0}: comments written as {1} never reach the browser.",
    "pt-br": "{0}: comentarios escritos como {1} nunca chegam ao navegador.",
  },
  "context.unsafe": {
    en: "{0}: no comment syntax stays out of the browser here, so comments are stored outside the file.",
    "pt-br": "{0}: nenhuma sintaxe de comentario fica fora do navegador aqui, entao os comentarios sao guardados fora do arquivo.",
  },
};

function resolveLocale(): Locale {
  const configured = vscode.workspace
    .getConfiguration("hiddenComments")
    .get<string>("language", "auto");

  if (configured === "pt-br" || configured === "en") {
    return configured;
  }

  return vscode.env.language.toLowerCase().startsWith("pt") ? "pt-br" : "en";
}

/** Traduz uma chave, substituindo `{0}`, `{1}`... pelos argumentos. */
export function t(key: keyof typeof MESSAGES | string, ...args: string[]): string {
  const entry = MESSAGES[key];
  if (!entry) {
    return key;
  }

  return args.reduce(
    (text, value, index) => text.replaceAll(`{${index}}`, value),
    entry[resolveLocale()],
  );
}
