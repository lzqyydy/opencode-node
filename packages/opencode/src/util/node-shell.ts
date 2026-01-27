import { spawn } from "node:child_process";

/**
 * Shell 执行结果
 */
export interface ShellOutput {
    /** 标准输出 */
    readonly stdout: Buffer;
    /** 标准错误输出 */
    readonly stderr: Buffer;
    /** 退出码 */
    readonly exitCode: number;

    /** 将 stdout 转换为文本 */
    text(): string;
    /** 将 stdout 解析为 JSON */
    json<T = unknown>(): T;
    /** 将 stdout 转换为 Blob */
    blob(): Blob;
    /** 将 stdout 转换为 ArrayBuffer */
    arrayBuffer(): ArrayBuffer;
    /** 将 stdout 转换为 Uint8Array */
    bytes(): Uint8Array;
    /** 将 stdout 按行分割 */
    lines(): AsyncIterable<string>;
}

/**
 * Shell 配置选项
 */
interface ShellOptions {
    cwd?: string;
    env?: Record<string, string | undefined>;
    quiet?: boolean;
    throws?: boolean;
}

/**
 * ShellPromise - 支持链式配置的懒执行 Promise
 */
export interface ShellPromise extends Promise<ShellOutput> {
    /** 设置工作目录 */
    cwd(path: string): ShellPromise;
    /** 设置环境变量 */
    env(env: Record<string, string | undefined>): ShellPromise;
    /** 静默模式，不输出到控制台 */
    quiet(): ShellPromise;
    /** 按行返回输出 */
    lines(): AsyncIterable<string>;
    /** 设置是否在非零退出码时不抛出异常 */
    nothrow(): ShellPromise;
    /** 设置是否在非零退出码时抛出异常 */
    throws(enabled: boolean): ShellPromise;
    /** 获取文本输出 */
    text(): Promise<string>;
    /** 获取 JSON 输出 */
    json<T = unknown>(): Promise<T>;
    /** 获取 Blob 输出 */
    blob(): Promise<Blob>;
    /** 获取 ArrayBuffer 输出 */
    arrayBuffer(): Promise<ArrayBuffer>;
    /** 获取 Uint8Array 输出 */
    bytes(): Promise<Uint8Array>;
}

/**
 * Shell 执行错误
 */
export class ShellError extends Error {
    constructor(
        message: string,
        public readonly exitCode: number,
        public readonly stdout: Buffer,
        public readonly stderr: Buffer,
    ) {
        super(message);
        this.name = "ShellError";
    }
}

/**
 * 创建 ShellOutput 对象
 */
function createShellOutput(stdout: Buffer<ArrayBuffer>, stderr: Buffer<ArrayBuffer>, exitCode: number): ShellOutput {
    return {
        stdout,
        stderr,
        exitCode,
        text() {
            return stdout.toString("utf-8").trim();
        },
        json<T = unknown>(): T {
            return JSON.parse(stdout.toString("utf-8"));
        },
        blob() {
            return new Blob([stdout]);
        },
        arrayBuffer() {
            return stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength);
        },
        bytes() {
            return new Uint8Array(stdout);
        },
        async *lines() {
            const lines = stdout.toString("utf-8").trim().split("\n");
            for (const line of lines) {
                yield line;
            }
        },
    };
}

/**
 * 执行 shell 命令
 */
function executeCommand(command: string, options: ShellOptions): Promise<ShellOutput> {
    return new Promise((resolve, reject) => {
        const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
        const shellFlag = process.platform === "win32" ? "/c" : "-c";

        const child = spawn(shell, [shellFlag, command], {
            cwd: options.cwd,
            env: { ...process.env, ...options.env },
            stdio: ["inherit", "pipe", "pipe"],
        });

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];

        child.stdout?.on("data", (chunk: Buffer) => {
            stdoutChunks.push(chunk);
            if (!options.quiet) {
                process.stdout.write(chunk);
            }
        });

        child.stderr?.on("data", (chunk: Buffer) => {
            stderrChunks.push(chunk);
            if (!options.quiet) {
                process.stderr.write(chunk);
            }
        });

        child.on("error", (error) => {
            reject(error);
        });

        child.on("close", (code) => {
            const exitCode = code ?? 0;
            const stdout: Buffer<ArrayBuffer> = Buffer.concat(stdoutChunks);
            const stderr: Buffer<ArrayBuffer> = Buffer.concat(stderrChunks);

            if (options.throws !== false && exitCode !== 0) {
                reject(
                    new ShellError(
                        `Command failed with exit code ${exitCode}: ${command}`,
                        exitCode,
                        stdout,
                        stderr,
                    ),
                );
                return;
            }

            resolve(createShellOutput(stdout, stderr, exitCode));
        });
    });
}

/**
 * 创建懒执行的 ShellPromise
 */
function createShellPromise(command: string, options: ShellOptions = {}): ShellPromise {
    let cachedPromise: Promise<ShellOutput> | null = null;

    const getPromise = (): Promise<ShellOutput> => {
        if (!cachedPromise) {
            cachedPromise = executeCommand(command, options);
        }
        return cachedPromise;
    };

    const shellPromise: ShellPromise = {
        // Promise 接口实现
        then<TResult1 = ShellOutput, TResult2 = never>(
            onfulfilled?: ((value: ShellOutput) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): Promise<TResult1 | TResult2> {
            return getPromise().then(onfulfilled, onrejected);
        },

        catch<TResult = never>(
            onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
        ): Promise<ShellOutput | TResult> {
            return getPromise().catch(onrejected);
        },

        finally(onfinally?: (() => void) | null): Promise<ShellOutput> {
            return getPromise().finally(onfinally);
        },

        [Symbol.toStringTag]: "ShellPromise",

        // 链式配置方法 - 返回新的 ShellPromise
        cwd(path: string): ShellPromise {
            return createShellPromise(command, { ...options, cwd: path });
        },

        env(env: Record<string, string | undefined>): ShellPromise {
            return createShellPromise(command, {
                ...options,
                env: { ...options.env, ...env },
            });
        },

        quiet(): ShellPromise {
            return createShellPromise(command, { ...options, quiet: true });
        },

        throws(enabled: boolean): ShellPromise {
            return createShellPromise(command, { ...options, throws: enabled });
        },

        nothrow(): ShellPromise {
            return createShellPromise(command, { ...options, throws: false });
        },

        // 便捷输出方法
        async text(): Promise<string> {
            const result = await getPromise();
            return result.text();
        },

        async json<T = unknown>(): Promise<T> {
            const result = await getPromise();
            return result.json<T>();
        },

        async blob(): Promise<Blob> {
            const result = await getPromise();
            return result.blob();
        },

        async arrayBuffer(): Promise<ArrayBuffer> {
            const result = await getPromise();
            return result.arrayBuffer();
        },

        async bytes(): Promise<Uint8Array> {
            const result = await getPromise();
            return result.bytes();
        },

        async *lines(): AsyncIterable<string> {
            const result = await getPromise();
            yield* result.lines();
        },
    };

    return shellPromise;
}

/**
 * 转义 shell 参数
 */
function escapeShellArg(arg: unknown): string {
    const str = String(arg);
    if (process.platform === "win32") {
        // Windows: 使用双引号并转义内部双引号
        return `"${str.replace(/"/g, '""')}"`;
    }
    // Unix: 使用单引号并处理内部单引号
    return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Shell 模板标签函数
 *
 * @example
 * ```ts
 * // 基本使用
 * const result = await $`echo "hello"`;
 * console.log(result.text()); // "hello"
 *
 * // 懒执行 - 命令不会立即执行
 * const cmd = $`echo "hello"`;
 * // ... 一些其他代码 ...
 * const output = await cmd.text(); // 此时才执行
 *
 * // 链式配置
 * const result = await $`pwd`.cwd("/tmp").quiet();
 *
 * // 变量插值（自动转义）
 * const name = "world";
 * const result = await $`echo ${name}`;
 *
 * // 获取退出码
 * const result = await $`exit 1`.throws(false);
 * console.log(result.exitCode); // 1
 * ```
 */
export function $(strings: TemplateStringsArray, ...values: unknown[]): ShellPromise {
    // 构建命令字符串，对插值进行转义
    let command = strings[0];
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        // 如果是 ShellPromise，则需要先执行并获取输出
        if (value && typeof value === "object" && Symbol.toStringTag in value) {
            throw new Error("Nested shell commands are not supported. Use await to get the output first.");
        }
        command += escapeShellArg(value) + strings[i + 1];
    }

    return createShellPromise(command);
}

/**
 * 创建带有默认选项的 shell 函数
 *
 * @example
 * ```ts
 * const $project = $.create({ cwd: "/path/to/project", quiet: true });
 * await $project`npm install`;
 * ```
 */
$.create = function (defaultOptions: ShellOptions) {
    return function (strings: TemplateStringsArray, ...values: unknown[]): ShellPromise {
        let command = strings[0];
        for (let i = 0; i < values.length; i++) {
            command += escapeShellArg(values[i]) + strings[i + 1];
        }
        return createShellPromise(command, defaultOptions);
    };
};

$.ShellError = ShellError;

export default $;
