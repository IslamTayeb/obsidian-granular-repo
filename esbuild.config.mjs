import esbuild from "esbuild";
import process from "node:process";

const isProd = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*"],
  format: "cjs",
  platform: "node",
  target: "es2020",
  logLevel: "info",
  sourcemap: !isProd,
  treeShaking: true,
  outfile: "main.js",
});

if (isProd) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
