import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export async function execCommand(command: string, args: string[], options?: { cwd?: string }): Promise<string> {
  const { stdout, stderr } = await execAsync(`${command} ${args.join(' ')}`, {
    cwd: options?.cwd,
    shell: '/bin/zsh'
  });
  return stdout.trim();
}