import { execFile } from 'node:child_process';

export async function execCommand(command: string, args: string[], options?: { cwd?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd: options?.cwd }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout.trim());
    });
  });
}