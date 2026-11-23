import { FolderOpen, FolderTree, Save, Settings2 } from 'lucide-react'
import { ActionMenu } from './ActionMenu'

type ApplicationMoreMenuProps = {
  fileActions?: { label: string; onSelect: () => void }[]
  dismissed?: boolean
  labels: {
    more: string
    open: string
    openFolder: string
    saveAs: string
    settings: string
  }
  onOpen: () => void
  onOpenFolder: () => void
  onOpenSettings: (trigger: HTMLButtonElement) => void
  onSaveAs: () => void
  saveAsDisabled?: boolean
  shortcuts: {
    open: string
    openFolder: string
    saveAs: string
  }
}

export function ApplicationMoreMenu({
  dismissed = false,
  fileActions = [],
  labels,
  onOpen,
  onOpenFolder,
  onOpenSettings,
  onSaveAs,
  saveAsDisabled = false,
  shortcuts,
}: ApplicationMoreMenuProps) {
  return (
    <ActionMenu
      label={labels.more}
      dismissed={dismissed}
      actions={[
        {
          label: labels.open,
          icon: <FolderOpen aria-hidden="true" size={15} />,
          shortcut: shortcuts.open,
          onSelect: onOpen,
        },
        {
          label: labels.openFolder,
          icon: <FolderTree aria-hidden="true" size={15} />,
          shortcut: shortcuts.openFolder,
          onSelect: onOpenFolder,
        },
        {
          label: labels.saveAs,
          icon: <Save aria-hidden="true" size={15} />,
          shortcut: shortcuts.saveAs,
          disabled: saveAsDisabled,
          separatorBefore: true,
          onSelect: onSaveAs,
        },
        {
          label: labels.settings,
          icon: <Settings2 aria-hidden="true" size={15} />,
          separatorBefore: true,
          onSelect: onOpenSettings,
        },
        ...fileActions.map((action) => ({
          ...action,
          icon: <FolderOpen aria-hidden="true" size={15} />,
        })),
      ]}
    />
  )
}
