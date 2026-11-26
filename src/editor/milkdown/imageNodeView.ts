import { convertFileSrc, isTauri } from '@tauri-apps/api/core'
import type { NodeViewConstructor } from '@milkdown/prose/view'
import type { MutableRefObject } from 'react'
import { isExternalHttpUrl } from '../../file-system/externalLink'
import type { EditorCopy } from './editorCopy'

type ImageCopy = Pick<
  EditorCopy,
  'loadImage' | 'loadImageError' | 'loadRemoteImage' | 'loadingImage'
>

export function createImageNodeView(
  documentPathRef: MutableRefObject<string | null>,
  copyRef: MutableRefObject<ImageCopy>,
): NodeViewConstructor {
  return (node) => {
    const source = String(node.attrs.src ?? '')
    const alt = String(node.attrs.alt ?? '')
    if (isExternalHttpUrl(source)) return createRemoteImageView(node, copyRef.current)

    // A few Markdown exporters put a .md file path in image syntax. Sending
    // it through Tauri's image asset protocol makes WebKit paint the protocol
    // error inside the document, so keep this malformed image inert.
    if (isMarkdownDocumentPath(source)) {
      const placeholder = document.createElement('span')
      placeholder.className = 'invalid-local-image'
      placeholder.textContent = alt
      return { dom: placeholder, ignoreMutation: () => true }
    }

    const root = document.createElement('span')
    root.className = 'local-image-view'
    root.setAttribute('contenteditable', 'false')
    let currentNode = node
    let currentImage: HTMLImageElement | null = null
    let generation = 0

    const clearCurrentImage = () => {
      if (!currentImage) return
      currentImage.onload = null
      currentImage.onerror = null
      currentImage.removeAttribute('src')
      currentImage = null
    }

    const failureLabel = () =>
      copyRef.current.loadImageError
        .replace(/\s*[—–-]\s*.*$/, '')
        .replace(/[，,]\s*.*$/, '')
        .trim() || copyRef.current.loadImageError

    const syncRuntimeAttributes = () => {
      const imageAlt = String(currentNode.attrs.alt ?? '')
      const title = String(currentNode.attrs.title ?? '')
      if (currentImage) {
        currentImage.alt = imageAlt
        if (title) currentImage.title = title
        else currentImage.removeAttribute('title')
        return
      }
      const placeholder = root.querySelector<HTMLElement>('.local-image-placeholder')
      if (!placeholder) return
      let description = placeholder.querySelector<HTMLElement>('.local-image-placeholder__alt')
      if (imageAlt) {
        if (!description) {
          description = document.createElement('span')
          description.className = 'local-image-placeholder__alt'
          placeholder.prepend(description)
        }
        description.textContent = imageAlt
      } else description?.remove()
      const status = placeholder.querySelector<HTMLElement>('.local-image-placeholder__status')!
      status.textContent = failureLabel()
      placeholder.setAttribute(
        'aria-label',
        imageAlt ? `${imageAlt}. ${status.textContent}` : status.textContent,
      )
      if (title) placeholder.title = title
      else placeholder.removeAttribute('title')
    }

    const showPlaceholder = (state: 'empty' | 'error', token: number) => {
      if (token !== generation) return
      clearCurrentImage()
      root.dataset.imageState = state
      const placeholder = document.createElement('span')
      placeholder.className = 'local-image-placeholder'
      placeholder.dataset.imageState = state
      placeholder.setAttribute('contenteditable', 'false')
      const status = document.createElement('span')
      status.className = 'local-image-placeholder__status'
      placeholder.append(status)
      root.replaceChildren(placeholder)
      syncRuntimeAttributes()
    }

    const render = () => {
      generation += 1
      const token = generation
      clearCurrentImage()
      const nextSource = String(currentNode.attrs.src ?? '')
      if (!nextSource) {
        showPlaceholder('empty', token)
        return
      }

      root.dataset.imageState = 'loading'
      const image = document.createElement('img')
      currentImage = image
      image.loading = 'lazy'
      image.decoding = 'async'
      syncRuntimeAttributes()
      image.onload = () => {
        if (token !== generation || currentImage !== image) return
        root.dataset.imageState = 'loaded'
      }
      image.onerror = () => {
        if (token !== generation || currentImage !== image) return
        showPlaceholder('error', token)
      }
      root.replaceChildren(image)
      image.src =
        documentPathRef.current && isTauri()
          ? convertFileSrc(resolveDocumentPath(documentPathRef.current, nextSource))
          : nextSource
    }

    render()
    return {
      dom: root,
      update: (nextNode) => {
        if (
          nextNode.type !== currentNode.type ||
          isExternalHttpUrl(String(nextNode.attrs.src ?? '')) ||
          isMarkdownDocumentPath(String(nextNode.attrs.src ?? ''))
        )
          return false
        const sourceChanged =
          String(nextNode.attrs.src ?? '') !== String(currentNode.attrs.src ?? '')
        currentNode = nextNode
        if (sourceChanged) render()
        else syncRuntimeAttributes()
        return true
      },
      // This atom has no contentDOM. Only mutations within its stable, inert
      // rendering chrome are ignored; mutations outside the NodeView still
      // reach ProseMirror normally.
      ignoreMutation: (mutation) => mutation.target === root || root.contains(mutation.target),
      destroy: () => {
        generation += 1
        clearCurrentImage()
        root.replaceChildren()
      },
    }
  }
}

function isMarkdownDocumentPath(source: string) {
  return /\.(?:md|markdown|mdx)(?:[?#].*)?$/i.test(source.trim())
}

function createRemoteImageView(node: Parameters<NodeViewConstructor>[0], copy: ImageCopy) {
  const container = document.createElement('span')
  container.className = 'remote-image-view'
  container.setAttribute('contenteditable', 'false')
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'remote-image-control'
  button.textContent = copy.loadImage
  let currentNode = node
  let currentImage: HTMLImageElement | null = null

  const syncRuntimeAttributes = () => {
    const alt = String(currentNode.attrs.alt ?? '')
    const title = String(currentNode.attrs.title ?? '')
    button.setAttribute('aria-label', copy.loadRemoteImage(alt))
    if (!currentImage) return
    currentImage.alt = alt
    if (title) currentImage.title = title
    else currentImage.removeAttribute('title')
  }

  syncRuntimeAttributes()
  const clearImage = () => {
    if (!currentImage) return
    currentImage.onload = null
    currentImage.onerror = null
    currentImage.removeAttribute('src')
    currentImage = null
  }
  const loadImage = () => {
    clearImage()
    button.disabled = true
    button.textContent = copy.loadingImage
    const image = document.createElement('img')
    currentImage = image
    syncRuntimeAttributes()
    image.onload = () => {
      if (currentImage !== image) return
      container.replaceChildren(image)
    }
    image.onerror = () => {
      if (currentImage !== image) return
      button.disabled = false
      button.textContent = copy.loadImageError
    }
    image.src = String(currentNode.attrs.src ?? '')
  }
  button.addEventListener('click', loadImage)
  container.append(button)
  return {
    dom: container,
    update: (nextNode: Parameters<NodeViewConstructor>[0]) => {
      if (
        nextNode.type !== currentNode.type ||
        String(nextNode.attrs.src ?? '') !== String(currentNode.attrs.src ?? '') ||
        !isExternalHttpUrl(String(nextNode.attrs.src ?? ''))
      )
        return false
      currentNode = nextNode
      syncRuntimeAttributes()
      return true
    },
    ignoreMutation: () => true,
    destroy: () => {
      clearImage()
      button.removeEventListener('click', loadImage)
      container.replaceChildren()
    },
  }
}

function resolveDocumentPath(documentPath: string, relativePath: string) {
  if (/^[\\/]/.test(relativePath)) return relativePath
  const base = documentPath.split(/[\\/]/).slice(0, -1)
  for (const segment of relativePath.split(/[\\/]/)) {
    if (!segment || segment === '.') continue
    if (segment === '..') base.pop()
    else base.push(segment)
  }
  return base.join('/')
}
