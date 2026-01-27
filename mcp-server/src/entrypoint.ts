export type SelfCommand = {
  cmd: string;
  args: string[];
};

const SCRIPT_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs'];

export function resolveSelfCommand(execPath: string, argv1?: string | null): SelfCommand {
  if (argv1 && SCRIPT_EXTENSIONS.some((ext) => argv1.endsWith(ext))) {
    return { cmd: execPath, args: [argv1] };
  }

  return { cmd: execPath, args: [] };
}

export function parseMode(argv: string[]): 'daemon' | 'mcp' {
  return argv.includes('--daemon') ? 'daemon' : 'mcp';
}
