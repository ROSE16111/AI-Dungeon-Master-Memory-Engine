# AI-Dungeon-Master-Memory-Engine
## cmd
`pwd` check current
`dir` list files in current directory列出当前目录的文件和文件夹
## front end
react (Next.js + TypeScript + Tailwind + shadcn/ui)
1. install Node.js LTS
* website: nodejs.org
* terminal:`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`(Relax restrictions in the current PowerShell session (restore to default after restarting PowerShell for greater security))
* reopen vscode
* check in terminal
  ```
  node -v
  npm -v
  ```

2. create project and run
  * terminal at project file path: `npx create-next-app@latest dungeon-scribe --typescript --eslint --src-dir=false --import-alias "@/*"`
  * Press Enter all the way. Then enter the directory and start
  * (option) delete the sub-git repository(which was initial by npm), add file to project repository
  ```
  Remove-Item -Recurse -Force .git 
  cd ..
  git add .
  git commit -m "Add dungeon-scribe Next.js project"
  git push
  ```
  * get into project and run
  ```
  cd dungeon-scribe
  npm run dev
  ```
  * browser: http://localhost:3000 ,we can see Next.js welcome page.
  * `Ctrl + C` + `Y` to exit next.js server in terminal

3. install tailwind 
* install at terminal (at root dir of project);

  * (option)`npm install -D tailwindcss postcss autoprefixer` install
  * `npx @tailwindcss/cli@latest` install newest CLI pakage. 
  * `npm i -D @tailwindcss/postcss` install PostCSS 
  * create config files by hand: (Option)`tailwind.config.js` and `postcss.config.js`
  * check
    * globals.css has `@import "tailwindcss";`
    * src/app/layout.tsx has `import "./globals.css";`
    * write a test head on src/app/page.tsx 
    ```
    {/* 新增的测试标题 */}
        <h1 className="text-3xl font-bold text-blue-600">
          Hello Dungeon Scribe!
        </h1>
    ```
    * `npm run dev` to test
4. install shadcn/ui
A comprehensive suite of beautiful UI components (buttons, cards, forms, dialogs, sidebars, and more) is built in.

Based on Tailwind CSS, you can quickly customize styles directly using class names.

Components are imported on demand, unlike large UI frameworks that bundle a lot of useless components at once.

Supports Radix UI (provides accessibility support and animations).
* `npm i class-variance-authority clsx tailwind-merge @radix-ui/react-icons` install
* `npx shadcn@latest init` initial

5. start framework
Next.js App Router is "**files as routes**"（文件即路由）.(dashboard) is a group，You can give this group of pages the same layout [sidebar + top bar] (可以给这组页面套同一个布局(侧边栏+顶栏))
* create files
```
src/app/
└─ (dashboard)/
   ├─ layout.tsx           ← 这组路由的公共外壳
   ├─ page.tsx             ← /dashboard
   ├─ sessions/
   │  └─ [id]/
   │     └─ page.tsx       ← /sessions/123
   └─ graph/
      └─ page.tsx          ← /graph

```

## js code
`export default` 默认导出。一个文件里只能有一个默认导出
`src/app/page.tsx`：只负责把 / 重定向到 /dashboard