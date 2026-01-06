import type { VFS, VFSFileTemplate, VFSFileTemplateOptions, VFSFolderTemplate } from '@a-sir/code-engine-schema'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, normalize } from 'pathe'
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
      return resolveFolder(this.root, folderPath, true)!
    },

    // 添加文件到虚拟文件系统
    addFile(filePath: string, opts: VFSFileTemplateOptions) {
      const normalizedFilePath = normalize(filePath)
      const folderPath = dirname(normalizedFilePath)
      const fileName = basename(normalizedFilePath)

      const folder = resolveFolder(this.root, folderPath, true)!
      const file = createFile({ ...opts, filename: fileName })
      folder.files.push(file)
      return file
    },

    // 查找文件夹
    findFolder(folderPath: string) {
      return resolveFolder(this.root, folderPath, false)
    },

    // 查找文件
    findFile(filePath: string) {
      const normalizedFilePath = normalize(filePath)
      const folderPath = dirname(normalizedFilePath)
      const fileName = basename(normalizedFilePath)

      const folder = resolveFolder(this.root, folderPath, false)
      if (folder) {
        return folder.findFile(fileName)
      }
      return undefined
    },
  }

  return vfs
}

/**
 * 内部辅助函数：解析文件夹路径
 * @param root 起始根文件夹
 * @param path 目标路径
 * @param createIfMissing 如果不存在是否创建
 */
function resolveFolder(root: VFSFolderTemplate, path: string, createIfMissing: boolean): VFSFolderTemplate | undefined {
  const normalizedPath = normalize(path)

  // 处理根路径情况，path可能是空或者'.'
  if (normalizedPath === '' || normalizedPath === '.') {
    return root
  }

  const parts = normalizedPath.split('/').filter(p => p && p !== '.')
  let current: VFSFolderTemplate = root

  for (const part of parts) {
    let next = current.findFolder(part)
    if (!next) {
      if (createIfMissing) {
        next = createFolder(part)
        current.folders.push(next)
      }
      else {
        return undefined
      }
    }
    current = next
  }

  return current
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
      await mkdir(path, { recursive: true })
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
      const ce = useCodeEngine()
      // 利用 Effect 系统实现自动依赖追踪与更新
      await ce.runEffect(async () => {
        const path = join(cwd, file.filename)
        // TODO: 这里可以进一步优化，比如读取磁盘对比 hash，只有内容变了才写入
        const content = await file.getContents(file.options)
        await writeFile(path, content)
      })
    },
  }

  return file
}
