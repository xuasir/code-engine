type TemplateDefaultOptions = Record<string, any>

/**
 * 虚拟文件系统文件模板
 */
export type VFSFileTemplateOptions = Omit<VFSFileTemplate, 'write'>
export interface VFSFileTemplate<Options = TemplateDefaultOptions> {
  /** 模板复制到 runtime 构建目录后的目标文件名 */
  filename: string
  /** 一个选项对象，可以通过 `<% options %>` 在模板中访问 */
  options: Options
  /** 要作为模板的源文件的已解析路径 */
  src: string
  /** 自定义内容生成函数 */
  getContents: (data: any) => string | Promise<string>
  /** 写入文件系统 */
  write: (cwd: string) => Promise<void>
}

/**
 * 虚拟文件系统文件夹模板
 */
export interface VFSFolderTemplate {
  /** 模板复制到 runtime 构建目录后的目标文件夹名 */
  folderName: string
  /** 子文件夹 */
  folders: VFSFolderTemplate[]
  /** 子文件 */
  files: VFSFileTemplate[]
  /** 写入文件系统 */
  write: (cwd: string) => Promise<void>
  /** 查找目录 */
  findFolder: (folderPath: string) => VFSFolderTemplate | undefined
  /** 查找文件 */
  findFile: <Options = TemplateDefaultOptions>(filePath: string) => VFSFileTemplate<Options> | undefined
}

/**
 * 虚拟文件系统
 */
export interface VFS {
  /** 根目录 */
  root: VFSFolderTemplate
  /** 添加子目录 */
  addFolder: (folderPath: string) => VFSFolderTemplate
  /** 添加文件 */
  addFile: (filePath: string, opts: Omit<VFSFileTemplate, 'write'>) => VFSFileTemplate
  /** 查找目录 */
  findFolder: (folderPath: string) => VFSFolderTemplate | undefined
  /** 查找文件 */
  findFile: <Options = TemplateDefaultOptions>(filePath: string) => VFSFileTemplate<Options> | undefined
}
