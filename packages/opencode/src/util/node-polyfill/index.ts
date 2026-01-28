import {
    file,
    write,
    type NodeBunFile,
    type NodeBunFileStats,
    type NodeBunFileWriter,
} from './node-files.ts';

import {
    spawn,
    which,
    stdin,
    type NodeSpawnOptions,
    type NodeFileSink,
    type NodeSubprocess,
    type WhichOptions,
} from './node-process.ts';

import {
    sleep,
    resolve,
    stringWidth,
    hash,
    Glob,
    type GlobScanOptions,
} from './node-others.ts';

import {
    serve,
    connect,
    type NodeServer,
    type NodeBunServer,
    type NodeServeOptions,
    type NodeConnectOptions,
    type NodeSocket,
    type NodeWebSocketHandler,
    type NodeServerWebSocket,
} from './node-http.ts';

/**
 * ResolveMessage - A polyfill for Bun's ResolveMessage error type
 * This is used for module resolution errors in Node.js
 */
export class ResolveMessage extends Error {
    public readonly code: string;
    public readonly specifier: string;
    public readonly referrer: string;
    public readonly position?: { line: number; column: number };
    public readonly importKind?: string;

    constructor(
        message: string,
        options: {
            code?: string;
            specifier?: string;
            referrer?: string;
            position?: { line: number; column: number };
            importKind?: string;
        } = {}
    ) {
        super(message);
        this.name = 'ResolveMessage';
        this.code = options.code ?? 'MODULE_NOT_FOUND';
        this.specifier = options.specifier ?? '';
        this.referrer = options.referrer ?? '';
        this.position = options.position;
        this.importKind = options.importKind;
    }

    /**
     * Check if an error is a module resolution error (compatible with both Bun and Node.js)
     */
    static isResolveError(e: unknown): e is ResolveMessage | (Error & { code: string; specifier?: string }) {
        if (e instanceof ResolveMessage) return true;
        if (e instanceof Error) {
            const code = (e as any).code;
            return (
                code === 'MODULE_NOT_FOUND' ||
                code === 'ERR_MODULE_NOT_FOUND' ||
                code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' ||
                code === 'ERR_PACKAGE_IMPORT_NOT_DEFINED'
            );
        }
        return false;
    }

    /**
     * Create a ResolveMessage from a Node.js module resolution error
     */
    static fromError(e: Error & { code?: string }): ResolveMessage {
        // Try to extract specifier from the error message
        // Node.js errors typically have messages like "Cannot find module 'xxx'"
        let specifier = '';
        const match = e.message.match(/Cannot find (?:module|package) ['"]([^'"]+)['"]/);
        if (match) {
            specifier = match[1];
        }

        return new ResolveMessage(e.message, {
            code: e.code,
            specifier,
        });
    }
}

export {
    file,
    write,
    type NodeBunFile,
    type NodeBunFileStats,
    type NodeBunFileWriter,
    spawn,
    which,
    stdin,
    type NodeSpawnOptions,
    type NodeFileSink,
    type NodeSubprocess,
    type WhichOptions,
    sleep,
    resolve,
    stringWidth,
    hash,
    Glob,
    type GlobScanOptions,
    serve,
    connect,
    type NodeServer,
    type NodeBunServer,
    type NodeServeOptions,
    type NodeConnectOptions,
    type NodeSocket,
    type NodeWebSocketHandler,
    type NodeServerWebSocket,
};

export * as NodePolyFillBun from '.';
