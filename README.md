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
  ```cd dungeon-scribe
   npm run dev```
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
