# 配置

我期望的配置方式如下：

```
...
layer: {
  <!-- 是否开启 项目目录src 的层注册 -->
  enabled: true,
  <!-- 显式的注册层 来源类型：LayerDef -->
  defs: [{
    id: 'user-common',
    source: { type: 'local', root: srcPath, dynamic: true },
    priority: 100,
  }],
  <!-- 远程层注册配置 -->
  remote: {
    <!-- 远程层缓存目录 -->
    cacheDir?: '.vona/layers'
    <!-- 缓存优先 -->
    preferCache: true
  },
  <!-- 各个类型资源的扫描配置 -->
  config: {
    apis: {
      <!-- 是否启用单个类型扫描 -->
      enabled: true,
      <!-- 该类型的根目录名称 -->
      name: 'apis',
      <!-- 扫描 glob 匹配规则 -->
      pattern: ['*.{ts,js}'],
      <!-- 扫描 glob 忽略规则 -->
      ignore: []
    }
    ...
  }
}
...
```

# 扫描行为

## 浅层扫描模式

包含： plugins、styles、utils、icons、apis、composables、layouts、components、store

### 输入与预期结果

此处以 plugins 为实例，其他浅层扫描模式的输入与预期结果类似。

- plugins输入
```
低优先级 layer1:
plugins/a.ts
plugins/b/index.ts

高优先级 layer2:
plugins/c.ts
plugins/b.ts
```

- plugins预期结果

在 ovfs 中 plugins/a 仅代表我们合并得出了一个此类资源，他应该包含 LayerAsset 信息，同时他指代的是原始目录 plugins/a.ts，此过程并不需要真的把文件目录进行合并，只是在 ovfs 中进行了一个集中式的映射，提供给下游一个面向资源编程的方式。

```
<!-- ovfs -->
plugins/a --> layer1
plugins/b --> layer2
plugins/c --> layer2
```

## 文件路由扫描模式

包含： pages

### 输入与预期结果

此处以 pages 为实例，其他文件路由扫描模式的输入与预期结果类似。

- pages输入
```
低优先级 layer1:
pages/a.vue
pages/b/index.vue
pages/d/[id].vue

高优先级 layer2:
pages/c.vue
pages/b.vue
```

- pages预期结果

在 ovfs 中 pages/a 仅代表我们合并得出了一个此类资源，他应该包含 LayerAsset 信息，同时他指代的是原始目录 pages/a.ts，此过程并不需要真的把文件目录进行合并，只是在 ovfs 中进行了一个集中式的映射，提供给下游一个面向资源编程的方式。

```
<!-- ovfs -->
pages/a --> layer1
pages/b --> layer2
pages/c --> layer2
pages/d/[id] --> layer1
```

# 动态层

当动态层下发生文件变更时，我们应该以最小变化原则去更新 ovfs 中的映射关系，即只更新变更的文件，而不是全部重新扫描。
