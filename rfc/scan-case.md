# pages
说明：索引→OVFS 转换规则：去掉顶级目录 `pages/`、扩展名及尾部 `index`，保留动态段标记（如 `[id]`、`[...slug]`），剩余部分保持原样分段，最终 OVFS 资源路径为 `pages/<Segments>`。

## 核心用例

| 场景     | 文件路径                         | 生成路由         | 访问方式         | OVFS资源路径      |
|----------|----------------------------------|------------------|------------------|--------------------|
| 基础路由 | pages/index.vue                  | /                | /                | pages/index        |
| 带参数   | pages/user/[id].vue              | /user/:id        | /user/123        | pages/user/[id]    |
| 多参数   | pages/[category]/[id].vue        | /:category/:id   | /books/123       | pages/[category]/[id] |
| 可选参数 | pages/[[slug]].vue               | /:slug?          | / 或 /any        | pages/[[slug]]     |
| 捕获所有 | pages/[...slug].vue              | /:slug(.*)*      | /a/b/c           | pages/[...slug]    |
| 分组路由 | pages/(admin)/dashboard.vue      | /dashboard       | /dashboard       | pages/(admin)/dashboard |
| 嵌套路由 | pages/parent/child.vue           | /parent/child    | /parent/child    | pages/parent/child |

# components
说明：索引→OVFS 转换规则：去掉顶级目录 `components/`、扩展名及尾部 `index`，剩余部分按分段转为大驼峰，最终 OVFS 资源路径为 `components/<PascalSegments>`。

## 核心用例

| 场景       | 文件路径                          | 索引路径        | 说明               | OVFS资源路径            |
|------------|-----------------------------------|---------------------|--------------------|-------------------------|
| 文件索引   | components/Button.vue             | components/Button   | 单文件组件         | components/Button        |
| 目录索引   | components/Button/index.vue       | components/Button   | 目录下 index.vue   | components/Button        |
| 嵌套一层   | components/base/Input.vue         | components/base/Input | 一级子目录       | components/BaseInput     |
| 嵌套两层   | components/base/form/Select.vue   | components/base/form/Select | 两级子目录     | components/BaseFormSelect |
| 嵌套三层   | components/ui/feedback/Toast.vue  | components/ui/feedback/Toast | 三级子目录（最深） | components/UiFeedbackToast |

# layouts
说明：索引→OVFS 转换规则：去掉顶级目录 `layouts/`、扩展名及尾部 `index`，剩余部分按分段转为大驼峰，最终 OVFS 资源路径为 `layouts/<PascalSegments>`。

## 核心用例

| 场景       | 文件路径                          | 索引路径        | 说明               | OVFS资源路径      |
|------------|-----------------------------------|---------------------|--------------------|-------------------|
| 文件索引   | layouts/Basic.vue                 | layouts/Basic   | 单文件组件         | layouts/Basic     |
| 目录索引   | layouts/Fullscreen/index.vue      | layouts/FullScreen   | 目录下 index.vue | layouts/FullScreen |

# Composables
说明：仅支持扫描一级文件索引和二级目录索引（index）；索引→OVFS 转换规则：去掉顶级目录 `composables/`、扩展名及尾部 `index`，剩余部分保持原样，最终 OVFS 资源路径为 `composables/<Segments>`。

## 核心用例

| 场景       | 文件路径                          | 索引路径        | 说明               | OVFS资源路径              |
|------------|-----------------------------------|---------------------|--------------------|---------------------------|
| 文件索引   | composables/useCounter.ts         | composables/useCounter | 单文件组合式函数 | composables/useCounter    |
| 目录索引   | composables/useForm/index.ts      | composables/useForm | 目录下 index.ts   | composables/useForm       |

# apis
说明：仅支持扫描一级文件索引和二级目录索引（index）；索引→OVFS 转换规则：去掉顶级目录 `apis/`、扩展名及尾部 `index`，剩余部分保持原样，最终 OVFS 资源路径为 `apis/<Segments>`。

## 核心用例

| 场景       | 文件路径                          | 索引路径        | 说明               | OVFS资源路径   |
|------------|-----------------------------------|---------------------|--------------------|----------------|
| 文件索引   | apis/user.ts                     | apis/user          | 单文件请求定义函数 | apis/user      |
| 目录索引   | apis/org/index.ts                | apis/org           | 目录下 index.ts    | apis/org       |

# utils
说明：仅支持扫描一级文件索引和二级目录索引（index）；索引→OVFS 转换规则：去掉顶级目录 `utils/`、扩展名及尾部 `index`，剩余部分保持原样，最终 OVFS 资源路径为 `utils/<Segments>`。

## 核心用例

| 场景       | 文件路径                          | 索引路径        | 说明               | OVFS资源路径         |
|------------|-----------------------------------|---------------------|--------------------|----------------------|
| 文件索引   | utils/formatDate.ts               | utils/formatDate   | 单文件工具函数     | utils/formatDate     |
| 目录索引   | utils/validateEmail/index.ts      | utils/validateEmail | 目录下 index.ts   | utils/validateEmail  |

# icons
说明：仅支持扫描一级文件索引和二级目录索引（index）；索引→OVFS 转换规则：去掉顶级目录 `icons/`、扩展名及尾部 `index`，剩余部分按分段转为大驼峰，最终 OVFS 资源路径为 `icons/<PascalSegments>`（例如：`icons/Logo/Input.svg` → `icons/LogoInput`）；图标文件仅支持 `.svg` 格式。

## 核心用例

| 场景       | 文件路径                          | 索引路径        | 说明               | OVFS资源路径        |
|------------|-----------------------------------|---------------------|--------------------|---------------------|
| 文件索引   | icons/ArrowRight.svg              | icons/ArrowRight   | 单文件图标组件     | icons/ArrowRight    |
| 目录索引   | icons/ArrowLeft/index.svg         | icons/ArrowLeft    | 目录下 index.svg   | icons/ArrowLeft     |
| 嵌套一层   | icons/Logo/Input.svg              | icons/Logo/Input   | 一级子目录         | icons/LogoInput     |

# styles
说明：仅支持扫描一级文件索引和二级目录索引（index）；索引→OVFS 转换规则：去掉顶级目录 `styles/`、扩展名及尾部 `index`，剩余部分保持原样，最终 OVFS 资源路径为 `styles/<Segments>`。

## 核心用例

| 场景       | 文件路径                          | 索引路径        | 说明               | OVFS资源路径        |
|------------|-----------------------------------|---------------------|--------------------|---------------------|
| 文件索引   | styles/Global.scss                | styles/Global      | 单文件图标组件     | styles/Global       |
| 目录索引   | styles/Var/index.scss             | styles/Var         | 目录下 index.scss  | styles/Var          |
| 嵌套一层   | styles/Common/Input.scss          | styles/Common/Input | 一级子目录        | styles/Common/Input  |

# plugins
说明：仅支持扫描一级文件索引和二级目录索引（index）；索引→OVFS 转换规则：去掉顶级目录 `plugins/`、扩展名及尾部 `index`，剩余部分保持原样，最终 OVFS 资源路径为 `plugins/<Segments>`。

## 核心用例

| 场景       | 文件路径                          | 索引路径        | 说明               | OVFS资源路径   |
|------------|-----------------------------------|---------------------|--------------------|----------------|
| 文件索引   | plugins/Auth.ts                   | plugins/Auth       | 单文件运行时插件   | plugins/Auth   |
| 目录索引   | plugins/sso/index.ts              | plugins/sso        | 目录下 index.ts    | plugins/sso    |

# store
说明：仅支持扫描一级文件索引和二级目录索引（index）；索引→OVFS 转换规则：去掉顶级目录 `store/`、扩展名及尾部 `index`，剩余部分保持原样，最终 OVFS 资源路径为 `store/<Segments>`。

## 核心用例

| 场景       | 文件路径                          | 索引路径        | 说明               | OVFS资源路径  |
|------------|-----------------------------------|---------------------|--------------------|---------------|
| 文件索引   | store/Global.ts                   | store/Global       | 单文件运行时插件   | store/Global  |
| 目录索引   | store/User/index.ts               | store/User         | 目录下 index.ts    | store/User    |
