# AI-Dungeon-Master-Memory-Engine

## dependency:

- `npm run dev` to test on AI-Dungeon-Master-Memory-Engine/dungeon-scribe
- http://localhost:3000/dashboard
- nvm + Node 20
  安装 Node 15.5.3（建议 nvm + Node 20）、建立数据库： npm i、npx prisma generate、npx prisma migrate dev
- to exist: Ctrl + C
- framework: React+Tailwind+shadcn/ui
- components:`npx shadcn@latest add avatar separator button card input label tabs dialog textarea sheet`
- icon lib: lucide-react
- ollama: https://ollama.com
- analyse: `npm i mammoth pdf-parse`
## final route
```
src/app/
├─ page.tsx                         // log in（/），登录后跳 /dashboard

├─ (all)/                           // AppShell 分组
│  ├─ layout.tsx                    // general shell

│  ├─ dashboard/
│  │  └─ page.tsx                   // /dashboard
|  |  └─ record/                     
│  |     └─ page.tsx                // /record

│  ├─ resources/
│  │  ├─ page.tsx                   // /resources  （页内 Tabs: Maps | Background）
         └─ mapview/
            └─ [id]/
               └─ page.tsx 
               
│  ├─ history/
│  │  ├─ page.tsx                   // /history （页内 Tabs: All | Completed）
│  │  ├─ all/                       // （可选）子路由版
│  │  │  └─ page.tsx                // /history/all
│  │  └─ completed/
│  │     └─ page.tsx                // /history/completed

│  ├─ campaigns/
│  │  └─ [id]/
│  │     ├─ summary/
│  │     │  └─ page.tsx             // /campaigns/123/summary（汇总页）
│  │     ├─ session/
│  │     │  └─ page.tsx             // /campaigns/123/session
│  │     └─ character/
│  │        └─ page.tsx             // /campaigns/123/character
|  |


├─ api/
    ├─ analyze
    ├─ upload

└─ components/
        ├─ layout       ← 外壳
```
## cmd

`pwd` check current
`dir` list files in current directory 列出当前目录的文件和文件夹

## front end

react (Next.js + TypeScript + Tailwind + shadcn/ui)

1. install Node.js LTS

- website: nodejs.org
- terminal:`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`(Relax restrictions in the current PowerShell session (restore to default after restarting PowerShell for greater security))
- reopen vscode
- check in terminal
  ```
  node -v
  npm -v
  ```

2. create project and run

- terminal at project file path: `npx create-next-app@latest dungeon-scribe --typescript --eslint --src-dir=false --import-alias "@/*"`
- Press Enter all the way. Then enter the directory and start
- (option) delete the sub-git repository(which was initial by npm), add file to project repository

```
Remove-Item -Recurse -Force .git
cd ..
git add .
git commit -m "Add dungeon-scribe Next.js project"
git push
```

- get into project and run

```
cd dungeon-scribe
npm run dev
```

- browser: http://localhost:3000 ,we can see Next.js welcome page.
- `Ctrl + C` + `Y` to exit next.js server in terminal

3. install tailwind

- install at terminal (at root dir of project);

  - (option)`npm install -D tailwindcss postcss autoprefixer` install
  - `npx @tailwindcss/cli@latest` install newest CLI pakage.
  - `npm i -D @tailwindcss/postcss` install PostCSS
  - create config files by hand: (Option)`tailwind.config.js` and `postcss.config.js`
  - check
    - globals.css has `@import "tailwindcss";`
    - src/app/layout.tsx has `import "./globals.css";`
    - write a test head on src/app/page.tsx
    ```
    {/* 新增的测试标题 */}
        <h1 className="text-3xl font-bold text-blue-600">
          Hello Dungeon Scribe!
        </h1>
    ```
    - `npm run dev` to test

4. install shadcn/ui
   A comprehensive suite of beautiful UI components (buttons, cards, forms, dialogs, sidebars, and more) is built in.

Based on Tailwind CSS, you can quickly customize styles directly using class names.

Components are imported on demand, unlike large UI frameworks that bundle a lot of useless components at once.

Supports Radix UI (provides accessibility support and animations).

- `npm i class-variance-authority clsx tailwind-merge @radix-ui/react-icons` install
- `npx shadcn@latest init` initial
- `npx shadcn@latest add button card input label tabs dialog textarea separator sheet` add common components
- `npm i lucide-react` icon lib

1. start framework
   Next.js App Router is "**files as routes**"（文件即路由）.(dashboard) is a group，You can give this group of pages the same layout [sidebar + top bar] (可以给这组页面套同一个布局(侧边栏+顶栏))

- create files

```
src/app/
└─ (dashboard)/

   ├─ layout.tsx           ← 这组路由的公共外壳
   ├─ dashboard.tsx             ← /dashboard
      └─ page.tsx
   ├─ sessions/
   │  └─ [id]/
   │     └─ page.tsx       ← /sessions/123
   └─ graph/
      └─ page.tsx          ← /graph

```

[id] : dynamic
所有在（dashboard）分组里的页面都会使用同一个 layout

- components
  -app-shell
  └─sidebar
  └─topbar

## js code

`export default` 默认导出。一个文件里只能有一个默认导出
`src/app/page.tsx`：只负责把 / 重定向到 /dashboard

## minimum mvp

前端：Next.js(App Router)+TS+Tailwind+ shadcn

实时转写：浏览器 Web Speech API（Chrome 可直接用；之后可替换成 Deepgram/Whisper 流式）

文件文本抽取：pdf-parse（PDF）、mammoth（docx）、纯文本直读

文本分析（后端 Node）：

中文关键词：nodejieba（自带 TF-IDF 提取）

英文关键词：keyword-extractor

关键句：按「句子命中关键词得分」排序取 TopN

存储：SQLite(+ Prisma)

1.  install dependence - prisma at node_modules/ 属于项目本地依赖
    我选 @node-rs/jieba（而不是 nodejieba），它有预编译，Windows 下不需要你安装 VS C++

    - 在项目根目录执行
    - ```
      npm i prisma @prisma/client pdf-parse mammoth keyword-extractor nodejieba sbd zod
      npx prisma init --datasource-provider sqlite
      ```

      ```

      ```

Warn:

```
npm error gyp ERR! cwd D:\document\UQ\4DECO3801\project\AI-Dungeon-Master-Memory-Engine\dungeon-scribe\node_modules\nodejieba
npm error gyp ERR! node -v v22.18.0
npm error gyp ERR! node-gyp -v v11.2.0
npm error gyp ERR! not ok
npm error [error] build error
npm error [error] stack Error: Failed to execute 'D:\nodejs\node.exe D:\nodejs\node_modules\npm\node_modules\node-gyp\bin\node-gyp.js configure --fallback-to-build --module=D:\document\UQ\4DECO3801\project\AI-Dungeon-Master-Memory-Engine\dungeon-scribe\node_modules\nodejieba\build\Release\nodejieba.node --module_name=nodejieba --module_path=D:\document\UQ\4DECO3801\project\AI-Dungeon-Master-Memory-Engine\dungeon-scribe\node_modules\nodejieba\build\Release --napi_version=10 --node_abi_napi=napi --napi_build_version=0 --node_napi_label=node-v127' (1)
npm error     at ChildProcess.<anonymous> (C:\Users\26988\AppData\Local\npm-cache\_npx\32b9dae5b17fba55\node_modules\@mapbox\node-pre-gyp\lib\util\compile.js:89:23)
npm error     at ChildProcess.emit (node:events:518:28)
npm error     at maybeClose (node:internal/child_process:1101:16)
npm error     at ChildProcess._handle.onexit (node:internal/child_process:304:5)
npm error [error] System Windows_NT 10.0.22631
npm error [error] command "D:\\nodejs\\node.exe" "C:\\Users\\26988\\AppData\\Local\\npm-cache\\_npx\\32b9dae5b17fba55\\node_modules\\@mapbox\\node-pre-gyp\\bin\\node-pre-gyp" "install" "--fallback-to-build"
npm error [error] cwd D:\document\UQ\4DECO3801\project\AI-Dungeon-Master-Memory-Engine\dungeon-scribe\node_modules\nodejieba
npm error [error] node -v v22.18.0
npm error [error] node-pre-gyp -v v2.0.0
npm error [error] not ok
npm error A complete log of this run can be found in: C:\Users\26988\AppData\Local\npm-cache\_logs\2025-08-26T03_54_28_308Z-debug-0.log
node:internal/modules/cjs/loader:1368
  throw err;

Error: Cannot find module 'D:\document\UQ\4DECO3801\project\AI-Dungeon-Master-Memory-Engine\dungeon-scribe\node_modules\prisma\build\index.js'
```

```
* method: 先装 nvm-windows，再切到 Node 20

```

winget install -e --id CoreyButler.NVMforWindows
nvm version
nvm install 20.18.0
nvm use 20.18.0
node -v # 应该是 v20.18.0

power shell 管理员打开：
cd D:\document\UQ\4DECO3801\project\AI-Dungeon-Master-Memory-Engine

```
* 优先用 cmd 语法从父目录删
```

cmd /c rmdir /s /q dungeon-scribe\node_modules

cd dungeon-scribe

npm i prisma @prisma/client pdf-parse mammoth keyword-extractor @node-rs/jieba sbd zod

npx prisma init --datasource-provider sqlite
npx prisma generate
npx prisma migrate dev --name init

npm run dev

```

初始化 Prisma（用 SQLite）

### API

API 路由是新增的服务端文件，路径在 src/app/api/\*\*/route.ts。

只有当页面去 fetch('/api/...') 时才会调用它们；不调用就没影响

API 放在 src/app/api/<name>/route.ts 的文件，会变成一个服务器接口，比如 /api/analyze。

你可以在里面做：读写数据库、解析文件、做 NLP 等

#### 建表

1. `prisma/schema.prisma` database code
2. 生成客户端并建表

  npx prisma generate
  npx prisma migrate dev --name addResources

  npm install @prisma/client



1. 新建 Prisma 客户端工具
   新建文件：src/lib/prisma.ts

2. 新建后端 API 路由
   (1) 文本分析并保存：POST /api/analyze

新建文件：src/app/api/analyze/route.ts

In the future, /api/analyze will be /api/analyze-llm to use llm to extract key information

**dashboard.tsx**:
这就是一个 Client Component，用 useState 管状态，然后调用两个接口：/api/upload 和 /api/analyze。关键流程：

- 选择文件 → onFile()：把文件塞进 FormData，POST /api/upload，拿到后端返回的 data.text，然后 setText(data.text)。

- 点按钮 → analyze()：把 text 作为 JSON 发给 POST /api/analyze，后端返回结构化结果（语言、关键句、关键词、sessionId），再渲染在页面上

### add fonts

加“艺术字”字体（Next.js 原生方式）

选择 Cinzel
`src/styles/fonts.ts`

### storage

把选中的 campaignId 存进 cookie（或服务端 session），这样：

换页面不会丢；

SSR 时也能拿到；

多端共享（如果你存在数据库里，并在用户表里写 lastSelectedCampaignId）

1. 创建 API 路由，负责设置/读取当前 Campaign
2. 在 Login 页面提交时写 Cookie 并跳转

- 在组件里新增一个函数：把选中的 campaign 写进 Cookie
- 把 onSubmit 改成异步，先写 Cookie 再跳转

3. 在状态区加一个 campaign state
   `//const [campaignTitle, setCampaignTitle] = useState<string | null>(null);`
4. 组件挂载后去拉取当前 Campaign（从 Cookie 读，后端返回）
   上面的前端会向 POST /api/current-campaign 发送：

{ "title": "<你选择的 campaign 名称>", "remember": true/false }

request: app/api/**current-campaign**/route.ts

```

res.cookies.set("currentCampaignId", id, {
path: "/",
httpOnly: true,
sameSite: "lax",
secure: process.env.NODE*ENV === "production",
maxAge: remember ? 60 * 60 \_ 24 \* 30 : undefined,
});

```

Cookie 的 HttpOnly 让它只能在服务器端读，客户端用一个 GET 接口“转述”给页面就行

### Documention

Using TypeDocs.

Run to generate / regenerate: npx typedoc --entryPointStrategy Expand src

支持图片转文本：

npm install tesseract.js
npm install node-tesseract-ocr
npm install pdf-parse mammoth
npm install tesseract.js pdf-parse pdf2pic mammoth node-fetch
npm i mammoth turndown

还需要本机安装 tesseract-ocr 可执行程序（Windows 需要去下载 Tesseract installer
并把路径加到环境变量里）



##
`Copy-Item .\dungeon-scribe\prisma\dev.db .\dungeon-scribe\prisma\dev.local.backup.db`
保留你本地的 dev.db 文件，但从 Git 索引里去掉它；之后 .gitignore 的规则才会生效
```

# 把冲突文件从索引里移除（工作区文件会保留）

git rm --cached -f "dungeon-scribe/prisma/dev.db"

# 标记冲突已解决并完成这次合并

git commit -m "Resolve merge: stop tracking prisma/dev.db"

# 确保 .gitignore 已包含：**/prisma/\*.db 和 **/prisma/\*.db-journal

git add .gitignore
git commit -m "Ensure prisma db files are ignored" # 如果有改动

# 推送

git push


# MaskMap
<div style={{width:display.w, height:display.h}}>
  [最底层]  <canvas ref={baseRef}>         —— 底图（等比缩放后的地图像素）
  [中间层]  <div style={gridStyle}>         —— 网格(用CSS渐变画线，便宜又清晰)
  [上面层]  <canvas ref={fogRef}>          —— 雾层(整块黑 + 用“挖洞”显示光照)
  [悬浮层]  <Hud/>                          —— HUD 控制面板（右下角，可调节参数）
</div>
底图：把图片绘制进 baseRef canvas。

网格：不占用 canvas，直接用 background-image: linear-gradient(...) 画直线，性能与分辨率都稳定。

雾层：整块黑底（带透明度），然后把光照区域“挖掉”，让底图透出来。// 通过 destination-out“挖掉”光照区域（内圈硬边 + 外圈软边径向渐变）
g.globalCompositeOperation = 'destination-out';

HUD：pointer-events: none 外壳 + “内容区 pointer-events: auto”，不挡住地图其他区域的鼠标/键盘事件
加了一个 outerRef（容器 div），用 ResizeObserver 监听容器宽度；

根据原图尺寸 dims 和容器宽度计算 display = { w, h, scale }；

两个 canvas 的 像素宽高 都设置为 display.w / display.h，确保图像与雾层完全一致大小；

网格线 backgroundSize 和计算光照时的 cellW/cellH 都基于 显示尺寸，不会因缩放错位。

这样做的意义：图片过大时，按容器宽度等比缩小，避免初次进来就只能看到局部。用户在容器内滚动/放大策略可以再按需求扩展。