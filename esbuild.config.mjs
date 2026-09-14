import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
/** Build de desenvolvimento: sem minificar e com sourcemap, para o F5 parar na linha certa. */
const dev = watch || process.argv.includes("--dev");

/** A API do VS Code e um modulo CommonJS injetado em tempo de execucao: nao pode ser empacotado. */
const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.cjs",
  format: "cjs",
  platform: "node",
  target: "node18",
  external: ["vscode"],
  sourcemap: dev ? "inline" : false,
  minify: !dev,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
