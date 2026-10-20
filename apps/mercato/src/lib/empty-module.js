// Client-bundle stand-in for server-only modules (see next.config.ts's
// webpack() NormalModuleReplacementPlugin). These modules are never actually
// called from the browser — their real implementations still ship in the
// server bundle, since this file is only swapped in for the client build.
module.exports = {}
