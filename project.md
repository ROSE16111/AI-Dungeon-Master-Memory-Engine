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
│  │  ├─ maps/                      // （可选）想做子路由就加
│  │  │  └─ page.tsx                // /resources/maps
│  │  └─ background/
│  │     └─ page.tsx                // /resources/background

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
## dependency:
* `npm run dev` to test on AI-Dungeon-Master-Memory-Engine/dungeon-scribe
* http://localhost:3000/dashboard
* nvm + Node 20
* `conda activate D:\document\UQ\4DECO3801\project\DDenv`
安装 Node（建议 nvm + Node 20）、建立数据库： npm i、npx prisma generate、npx prisma migrate dev
* to exist: Ctrl + C
* framework: React+Tailwind+shadcn/ui
* components:`npx shadcn@latest add avatar separator button card input label tabs dialog textarea sheet` `npm install @radix-ui/react-checkbox`
* icon lib: lucide-react
* 装的是 CPU 版 onnxruntime==1.22.1
### py env
```
conda create --prefix D:\document\UQ\4DECO3801\project\DDenv python=3.10 -y
conda activate D:\document\UQ\4DECO3801\project\DDenv
python -m pip install --upgrade pip setuptools wheel
cd /d D:\document\UQ\4DECO3801\project\AI-Dungeon-Master-Memory-Engine\voice-to-text
python -m pip install -r requirement.txt
(Microsoft C++ Build Tools，用 Visual Studio Installer 安装 “使用 C++ 的桌面开发” 工作负载（含 MSVC v143、Windows 10/11 SDK 等）。装完重启终端或电脑，然后再装 webrtcvad)
（改装成现成的python -m pip install webrtcvad-wheels==2.0.14
改成（Windows 下用 wheels，其他平台仍用原包））
python - <<'PY'
import faster_whisper, webrtcvad, sounddevice, onnxruntime
print("OK:", faster_whisper.__version__)
PY

```
#
这里是api的描述，做的时候可以先不管api，纯做前端。api连着后端输出结果给数据库再显示在前端
```
npx prisma generate
npx prisma migrate dev --name init
```
## **dashboard.tsx**: 
这就是一个 Client Component，用 useState 管状态，然后调用两个接口：/api/upload 和 /api/analyze。关键流程：

* 选择文件 → onFile()：把文件塞进 FormData，POST /api/upload，拿到后端返回的 data.text，然后 setText(data.text)。

* 点按钮 → analyze()：把 text 作为 JSON 发给 POST /api/analyze，后端返回结构化结果（语言、关键句、关键词、sessionId），再渲染在页面上

## /api/upload（接收文件→提取纯文本→返回）

职责
* 解析 multipart/form-data
* 按扩展名/ MIME 选择解析器
* 把 docx/pdf/txt 转成一段 纯文本字符串
* return { text }
常用库（Node runtime）
* .docx → mammoth（最省心，提纯文本）
* .pdf → pdf-parse（Node 常用）或 pdfjs-dist（Web 也可）
* .txt → 直接 buffer.toString('utf8')
⚠️ 这些库大多需要 Node.js runtime。如果你的路由写了 export const runtime = 'edge'，就很容易在运行期报错或拿不到内容。
* note: `npm i mammoth pdf-parse` install pdf parse package
## /api/analyze（接收文本→做 NLP/LLM→入库→返回）

职责
* 校验输入 text
* 做语言检测（可选：franc/tinyld）；做关键句、关键词提取
* 方案 A（快 & 免外部服务）：keyword-extractor / compromise / natural / wink-nlp / TextRank 实现
* 方案 B（效果更稳）：走 LLM（如 OpenAI），让模型抽取关键句和关键词
* 用 Prisma 保存一条 session 记录（包含原文、关键词/关键句数组、来源 source）
* return { sessionId, language, keySentences, keyPhrases }

# debug:
从 Git 拉下代码后，.env 里的 DATABASE_URL、数据库文件/实例、以及 Prisma 的迁移都需要你自己在本机执行一次，否则 /api/data 里的 Prisma 查询会直接 500，前端再去 res.json() 就抛 Unexpected end of JSON input

* 生成 .env
    1. if not have, then create .env file and add: `DATABASE_URL="file:./prisma/dev.db"`
* 生成Prisma Client : 
    1. `cd dungeon-scribe`
    2. `npx prisma generate`
* 建表
```
npx prisma migrate dev -n init
# or
npx prisma migrate dev -n <name>

# quick test; 只同步 schema 到数据库，不产生迁移文件。
npx prisma db push

# reset data（清库重建，清空数据）
npx prisma migrate reset
```

* 看表read/visualize：`npx prisma studio`
* 重启： `npm run dev`

# 
Git 在合并一个二进制文件（SQLite 数据库 dev.db）时冲突。
数据库文件不该进版本库（每个人本地都不一样，Git 也没法合并）
`git merge --abort`
```
# 1) 停止跟踪 dev.db（不删磁盘文件）
git rm --cached dungeon-scribe/prisma/dev.db

# 2) 永久忽略
echo "**/prisma/*.db" >> .gitignore
echo "**/prisma/*.db-journal" >> .gitignore

git check-ignore -v dungeon-scribe/prisma/dev.db

git add .gitignore
git commit -m "chore(prisma): stop tracking local SQLite dev.db; ignore db files"
git push

```

拉完代码后，每个人本地
```
# 如果仓库有 migrations（通常有）
npx prisma migrate reset   # 会清空并按迁移重建，开发环境用这个最干净

# 如果没有迁移，只是想按 schema 直接建表
# npx prisma db push

# 看看表是否正常
npx prisma studio

```


