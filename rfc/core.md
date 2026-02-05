# Vona 前端框架的核心能力

## 模块化

Vona 前端框架的核心能力是模块化，每个模块都是一个独立的一个标准 Web 工程。

### 基本结构

Vona 前端框架定义的Web最佳目录实践基本结构如下：

```
src
src/layouts  # 布局目录，扫描其下的所有布局文件
src/components  # 组件目录，扫描其下的所有组件文件
src/pages  # 页面目录，扫描其下的所有页面文件，使用文件路由模式扫描（对应 vue-router 的文件路由）
src/store  # 状态管理目录，扫描其下的所有状态模块文件，对应（vuex、pinia 等状态管理库）
src/utils  # 工具目录，扫描其下的所有工具函数文件，并且获得导出的函数
src/icons  # 图标目录，扫描其下的所有图标文件（使用 svg 转图标插件）
src/styles  # 样式目录
src/apis  # 接口目录，扫描其下的所有接口文件，并且获得导出的函数
src/plugins  # 插件目录，扫描其下的所有插件文件，用于扩展 Vona 前端框架的运行时核心能力
```

### 基础结构的使用场景

1、当用户使用 vona-js 运行项目时，其 src 目录如果符合以上基本结构，那么项目就会被自动扫描并加载。
2、在 vona-js 的 module 中我们能够显式的注册 layer ，比如 Core Layer、User Layer 等，每个 layer 都有一个对应的layer根目录并提供上述目录结构，用于扫描该 layer 下的文件。

### 如何基于基础结构的构建项目

假定存在 Core Layer 和 User Layer 两个层，其中 Core Layer 是 Vona 前端框架的核心层，User Layer 是用户自定义的层；User Layer 的优先级高于 Core Layer。

#### 1、扫描（Discovery）

在 Vona 项目启动时，会根据优先级从高到低扫描文件，先扫描 User Layer 下的文件，再扫描 Core Layer 下的文件。

- 对于 layouts 目录，我们根据扫描的结果进行优先级合并，User Layer 下的文件会覆盖 Core Layer 下的文件。
- 对于 components 目录，我们根据扫描的结果进行优先级合并，User Layer 下的文件会覆盖 Core Layer 下的文件。
- 对于 pages 目录，我们根据扫描的结果进行优先级合并，User Layer 下的文件会覆盖 Core Layer 下的文件。
- 对于 store 目录，我们根据扫描的结果进行优先级合并，User Layer 下的文件会覆盖 Core Layer 下的文件。
- 对于 utils 目录，我们根据扫描的结果进行优先级合并，User Layer 下的文件会覆盖 Core Layer 下的文件。
- 对于 icons 目录，我们根据扫描的结果进行优先级合并，User Layer 下的文件会覆盖 Core Layer 下的文件。
- 对于 styles 目录，我们根据扫描的结果进行优先级合并，User Layer 下的文件会覆盖 Core Layer 下的文件。
- 对于 apis 目录，我们根据扫描的结果进行优先级合并，User Layer 下的文件会覆盖 Core Layer 下的文件。
- 对于 plugins 目录，我们根据扫描的结果进行优先级合并，User Layer 下的文件会覆盖 Core Layer 下的文件。

此时我们得到了一个完整的 Overlay Virtual File System，包含了项目中的所有组件、布局、页面、状态模块、工具函数、图标、样式、接口函数、插件等。

##### 动态扫描

对于部分 layer 比如 用户开发目录的 src ，他可能是实时在变化的，我们需要支持这种动态的扫描能力。

#### 2、装配（Wiring）和 注入（Injection）

1、根据 Overlay Virtual File System，提供的文件处理接口，我们去生成运行时的代码，比如 Vue-router 的初始化基于 pages 扫描结果（文件路由转路由表）、状态管理的初始化基于 store 扫描结果（状态模块转状态管理实例）等。
2、依赖编译时，我们会根据js、ts、Vue的解析过程，将组件使用、方法使用，正确的转化成 import + const 的形式。

#### 3、运行时（Runtime）

1、开发者会基于 Overlay Virtual File System 生成的类型注入比如 全局组件的类型、路由类型，进行约束性的编码
2、开发者通过 #vona 的集中式引用入口使用 Overlay Virtual File System，比如 #vona/component、#vona/layout、#vona/page 等。

一切都是基于类型的编码，并且在编译时进行装配注入。

## 构建的核心开发体验

[自动导入研发模式](./自动导入研发模式.md)
