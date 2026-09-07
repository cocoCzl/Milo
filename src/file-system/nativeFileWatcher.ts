import { Channel, isTauri, Resource, invoke } from '@tauri-apps/api/core'

type NativeWatchEvent = {
  paths: string[]
}

type StopWatching = () => Promise<void>

export async function watchMarkdownFile(
  path: string,
  onChange: () => void,
): Promise<StopWatching> {
  if (!isTauri()) {
    return async () => undefined
  }

  const eventChannel = new Channel<NativeWatchEvent>((event) => {
    if (event.paths.includes(path)) {
      onChange()
    }
  })
  const resourceId = await invoke<number>('plugin:fs|watch', {
    paths: [path],
    options: { delayMs: 120, recursive: false },
    onEvent: eventChannel,
  })
  const watcher = new Resource(resourceId)

  return () => watcher.close()
}
