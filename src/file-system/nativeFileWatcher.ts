import { Channel, isTauri, Resource, invoke } from '@tauri-apps/api/core'

type NativeWatchEvent = {
  paths: string[]
}

type StopWatching = () => Promise<void>

type Subscription = { path: string; onChange: () => void }
type DirectoryWatch = { subscriptions: Set<Subscription>; ready: Promise<Resource> }
const directories = new Map<string, DirectoryWatch>()

export function watchResourceCounts() {
  return {
    directories: directories.size,
    subscriptions: [...directories.values()].reduce(
      (total, watch) => total + watch.subscriptions.size,
      0,
    ),
  }
}

export async function watchMarkdownFile(path: string, onChange: () => void): Promise<StopWatching> {
  if (!isTauri()) {
    return async () => undefined
  }

  // Native reads/saves return canonical absolute paths. The already-authorized
  // parent is non-recursively watched, with exact-file routing in this process.
  // One notify debouncer/FSEvents resource per directory instead of per tab.
  const directory = path.slice(0, path.lastIndexOf('/')) || '/'
  let watch = directories.get(directory)
  if (!watch) {
    const subscriptions = new Set<Subscription>()
    const eventChannel = new Channel<NativeWatchEvent>((event) => {
      const paths = new Set(event.paths)
      for (const entry of [...subscriptions]) {
        if (paths.has(entry.path) || paths.has(directory)) entry.onChange()
      }
    })
    const ready = invoke<number>('plugin:fs|watch', {
      paths: [directory],
      options: { delayMs: 120, recursive: false },
      onEvent: eventChannel,
    }).then((rid) => new Resource(rid))
    watch = { subscriptions, ready }
    directories.set(directory, watch)
  }
  const owned = watch
  const subscription = { path, onChange }
  owned.subscriptions.add(subscription)
  let watcher: Resource
  try {
    watcher = await owned.ready
  } catch (reason) {
    owned.subscriptions.delete(subscription)
    if (directories.get(directory) === owned) directories.delete(directory)
    throw reason
  }
  let stopped = false
  return async () => {
    if (stopped) return
    stopped = true
    owned.subscriptions.delete(subscription)
    if (!owned.subscriptions.size) {
      if (directories.get(directory) === owned) directories.delete(directory)
      await watcher.close()
    }
  }
}
