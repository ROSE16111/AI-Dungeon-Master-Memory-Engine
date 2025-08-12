# AI-Dungeon-Master-Memory-Engine
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
  * (option) delete the sub-git repository(which was initial by nmp), add file to project repository
  ```
  Remove-Item -Recurse -Force .git 
  cd ..
  git add .
  git commit -m "Add dungeon-scribe Next.js project"
  git push
  ```
  * get into project and run
  ```cd dungeon-scribe
   nmp run dev```
  * browser: http://localhost:3000 ,we can see Next.js welcome page.