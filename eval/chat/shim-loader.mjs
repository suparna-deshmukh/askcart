// Eval-only loader: lets the real Next route handlers run in plain Node.
// 1) "next/server" -> local NextResponse shim.
// 2) extensionless relative imports ("../../../lib/catalog") -> retry with ".js".
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return { url: new URL("./next-server-shim.mjs", import.meta.url).href, shortCircuit: true };
  }
  try {
    return await nextResolve(specifier, context);
  } catch (e) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/.test(specifier)) {
      return nextResolve(specifier + ".js", context);
    }
    throw e;
  }
}
