import type { VFS, VFSFileTemplate, VFSFileTemplateOptions, VFSFolderTemplate } from '@a-sir/code-engine-schema'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, normalize } from 'pathe'
import { useCodeEngine } from './context'

// 添加文件到虚拟文件系统
export function addFile(path: string, opts: VFSFileTemplateOptions): void {
  const ce = useCodeEngine()
  ce.hook('vfs:prepare', (ce) => {
    // 创建文件
    ce.vfs.addFile(path, opts)
  })
}

// 创建虚拟文件系统实例
export function createVFS(): VFS {
  const vfs: VFS = {
    // 根文件夹
    root: createFolder('.code-engine'),

    // 添加文件夹到虚拟文件系统
    addFolder(folderPath: string) {
      const normalizedFolderPath = normalize(folderPath)
      // 递归创建
      const folderPathSegments = normalizedFolderPath.split('/')
      let currentFolder: VFSFolderTemplate = this.root
      for (const folderPathSegment of folderPathSegments) {
        const folder = currentFolder.findFolder(folderPathSegment)
        if (folder) {
          currentFolder = folder
        }
        else {
          currentFolder.folders.push(createFolder(folderPathSegment))
          currentFolder = currentFolder.folders[currentFolder.folders.length - 1]
        }
      }
      return currentFolder
    },

    // 添加文件到虚拟文件系统
    addFile(filePath: string, opts: VFSFileTemplateOptions) {
      const normalizedFilePath = normalize(filePath)
      const folderPathSegments = normalizedFilePath.split('/')
      const fileName = folderPathSegments.slice(-1)[0]
      const folderPath = folderPathSegments.slice(0, -1).join('/')
      let folder = this.findFolder(folderPath)
      if (!folder) {
        folder = this.addFolder(folderPath)
      }
      const file = createFile({ ...opts, filename: fileName })
      folder.files.push(file)
      return file
    },

    // 查找文件夹
    findFolder(folderPath: string) {
      const folderPathSegments = folderPath.split('/')
      let currentFolder: VFSFolderTemplate = vfs.root
      for (const folderPathSegment of folderPathSegments) {
        const folder = currentFolder.findFolder(folderPathSegment)
        if (folder) {
          currentFolder = folder
        }
        else {
          return undefined
        }
      }
      return currentFolder
    },

    // 查找文件
    findFile(filePath: string) {
      const allPathSegments = filePath.split('/')
      const folderPathSegments = allPathSegments.slice(0, -1)
      const fileName = allPathSegments.slice(-1)[0]
      const folder = this.findFolder(folderPathSegments.join('/'))
      if (folder) {
        return folder.findFile(fileName)
      }
      return undefined
    },
  }

  return vfs
}

// 创建文件夹
function createFolder(folderName: string): VFSFolderTemplate {
  const folder: VFSFolderTemplate = {
    folderName,
    folders: [],
    files: [],

    // 将文件夹写入文件系统
    async write(cwd: string) {
    // 写入文件系统
      const path = join(cwd, this.folderName)
      mkdirSync(path, { recursive: true })
      await Promise.all([...this.folders.map(folder => folder.write(path)), ...this.files.map(file => file.write(path))])
    },

    // 查找子文件夹
    findFolder(folderName: string) {
      return this.folders.find(folder => folder.folderName === folderName)
    },

    // 查找文件
    findFile(filename: string) {
      return this.files.find(file => file.filename === filename) as any
    },
  }

  return folder
}

// 创建文件
function createFile(opts: VFSFileTemplateOptions): VFSFileTemplate {
  const file: VFSFileTemplate = {
    ...opts,

    // 将文件写入文件系统
    write: async (cwd: string) => {
      const path = join(cwd, file.filename)
      writeFileSync(path, await file.getContents(file.options))
    },
  }

  return file
}
