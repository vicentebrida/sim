import { connect, type Socket } from 'node:net';

export type ScanResult = { infected: false } | { infected: true; signature: string };

const CHUNK = 64 * 1024;

/**
 * A minimal clamd client over TCP (the `z`-prefixed commands end with a NUL byte). Files are sent
 * with INSTREAM: chunks prefixed by their length, ended by a zero length.
 */
export class ClamdClient {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 30_000,
  ) {}

  static fromUrl(url: string) {
    const parsed = new URL(url);
    return new ClamdClient(parsed.hostname, Number(parsed.port || 3310));
  }

  async scan(content: Buffer): Promise<ScanResult> {
    const reply = await this.command('INSTREAM', (socket) => {
      for (let start = 0; start < content.length; start += CHUNK) {
        const chunk = content.subarray(start, start + CHUNK);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    // "stream: OK", "stream: <signature> FOUND" or "<reason> ERROR".
    if (reply.endsWith(' OK')) return { infected: false };
    const found = /^stream: (.+) FOUND$/.exec(reply);
    if (found) return { infected: true, signature: found[1]! };
    throw new Error(`clamd: ${reply}`);
  }

  /** The ClamAV version, e.g. "ClamAV 1.4.1/27431/Mon Oct 19 08:30:00 2026". */
  version() {
    return this.command('VERSION');
  }

  private command(name: string, send?: (socket: Socket) => void) {
    return new Promise<string>((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      const received: Buffer[] = [];
      socket.setTimeout(this.timeoutMs, () => socket.destroy(new Error('clamd did not answer')));
      socket.on('connect', () => {
        socket.write(`z${name}\0`);
        send?.(socket);
      });
      socket.on('data', (data: Buffer) => received.push(data));
      socket.on('error', reject);
      socket.on('close', () =>
        resolve(Buffer.concat(received).toString('utf8').replace(/\0+$/, '').trim()),
      );
    });
  }
}
