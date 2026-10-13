import type { BlockMenuCopy } from './BlockMenu'
import type { EditorContextMenuCopy } from './EditorContextMenu'
import type { EditorLinkPopoverCopy } from './EditorLinkPopover'
import type { SelectionToolbarCopy } from './SelectionToolbar'

export type EditorCopy = BlockMenuCopy &
  EditorContextMenuCopy &
  EditorLinkPopoverCopy &
  SelectionToolbarCopy & {
    addColumnLeft: string
    addColumnRight: string
    addRowAbove: string
    addRowBelow: string
    codeBlockLanguage: string
    closeOutline: string
    deleteColumn: string
    deleteBlock: string
    deleteRow: string
    loadImage: string
    loadImageError: string
    loadRemoteImage: (alt: string) => string
    loadingImage: string
    noOutline: string
    outline: string
    plainText: string
    removeLink: string
    insert: string
    linkText: string
    startWritingHint: string
    startWriting: string
  }

export const defaultEditorCopy: EditorCopy = {
  apply: 'Apply',
  blockquote: 'Quote',
  bold: 'Bold',
  bulletList: 'Bulleted list',
  cancel: 'Cancel',
  codeBlock: 'Code block',
  copy: 'Copy',
  cut: 'Cut',
  divider: 'Divider',
  formattingToolbar: 'Formatting',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  heading4: 'Heading 4',
  heading5: 'Heading 5',
  heading6: 'Heading 6',
  moreHeadings: 'More Headings',
  inlineCode: 'Inline code',
  italic: 'Italic',
  link: 'Link',
  linkAddress: 'Link address',
  orderedList: 'Numbered list',
  paragraph: 'Body text',
  selectAll: 'Select all',
  strike: 'Strikethrough',
  table: 'Table',
  addBlock: 'Add block',
  addColumnLeft: 'Add column left',
  addColumnRight: 'Add column right',
  addRowAbove: 'Add row above',
  addRowBelow: 'Add row below',
  codeBlockLanguage: 'Code block language',
  closeOutline: 'Close outline',
  deleteColumn: 'Delete column',
  deleteRow: 'Delete row',
  loadImage: 'Load image',
  loadImageError: 'Could not load image — try again',
  loadRemoteImage: (alt) => `Load remote image${alt ? `: ${alt}` : ''}`,
  loadingImage: 'Loading image…',
  noOutline: 'Headings will appear here.',
  outline: 'Outline',
  plainText: 'Plain text',
  startWriting: 'Start with a thought…',
  removeLink: 'Remove link',
  deleteBlock: 'Delete block',
  insert: 'Insert',
  linkText: 'Link text',
  addLink: 'Add link',
  editLink: 'Edit link',
  insertLink: 'Insert link…',
  startWritingHint: 'Just type — Milo keeps the Markdown for you.',
}
