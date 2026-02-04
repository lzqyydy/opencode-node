export interface LockHandle {
  dispose: () => void
}

export namespace Lock {
  const locks = new Map<
    string,
    {
      readers: number
      writer: boolean
      waitingReaders: (() => void)[]
      waitingWriters: (() => void)[]
    }
  >()

  function get(key: string) {
    if (!locks.has(key)) {
      locks.set(key, {
        readers: 0,
        writer: false,
        waitingReaders: [],
        waitingWriters: [],
      })
    }
    return locks.get(key)!
  }

  function process(key: string) {
    const lock = locks.get(key)
    if (!lock || lock.writer || lock.readers > 0) return

    // Prioritize writers to prevent starvation
    if (lock.waitingWriters.length > 0) {
      const nextWriter = lock.waitingWriters.shift()!
      nextWriter()
      return
    }

    // Wake up all waiting readers
    while (lock.waitingReaders.length > 0) {
      const nextReader = lock.waitingReaders.shift()!
      nextReader()
    }

    // Clean up empty locks
    if (lock.readers === 0 && !lock.writer && lock.waitingReaders.length === 0 && lock.waitingWriters.length === 0) {
      locks.delete(key)
    }
  }

  export async function read(key: string): Promise<LockHandle> {
    const lock = get(key)

    return new Promise((resolve) => {
      if (!lock.writer && lock.waitingWriters.length === 0) {
        lock.readers++
        resolve({
          dispose: () => {
            lock.readers--
            process(key)
          },
        })
      } else {
        lock.waitingReaders.push(() => {
          lock.readers++
          resolve({
            dispose: () => {
              lock.readers--
              process(key)
            },
          })
        })
      }
    })
  }

  export async function write(key: string): Promise<LockHandle> {
    const lock = get(key)

    return new Promise((resolve) => {
      if (!lock.writer && lock.readers === 0) {
        lock.writer = true
        resolve({
          dispose: () => {
            lock.writer = false
            process(key)
          },
        })
      } else {
        lock.waitingWriters.push(() => {
          lock.writer = true
          resolve({
            dispose: () => {
              lock.writer = false
              process(key)
            },
          })
        })
      }
    })
  }

  /** Helper to run a function with a write lock, automatically releasing on completion */
  export async function withWrite<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const handle = await write(key)
    try {
      return await fn()
    } finally {
      handle.dispose()
    }
  }

  /** Helper to run a function with a read lock, automatically releasing on completion */
  export async function withRead<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const handle = await read(key)
    try {
      return await fn()
    } finally {
      handle.dispose()
    }
  }
}
