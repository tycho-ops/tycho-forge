/**
 * Entry point of the @tycho/forge module: runs the bundled CLI with the given arguments.
 * The CLI awaits its command at top level, so the import resolves when the command ends.
 * @license AGPL-3.0-only
 */

/**
 * Runs the module.
 * @param {string[]} args Arguments after `tycho forge`.
 * @returns {Promise<number>} Exit code (the CLI may also exit the process itself).
 */
export async function run(args) {
   process.argv = [process.argv[0], "tycho-forge", ...args];
   await import("./dist/cli.js");
   return 0;
}
