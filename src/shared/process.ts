import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { isWindows } from './platform.js';

const execAsync = promisify(exec);

export async function execCommand(command: string, args: string[], options?: { cwd?: string }): Promise<string> {
  const shell = isWindows ? 'cmd.exe' : '/bin/zsh';
  const { stdout } = await execAsync(`${command} ${args.join(' ')}`, {
    cwd: options?.cwd,
    shell
  });
  return stdout.trim();
}