import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { projectApi } from "./server/project-api.ts";

/** 편집할 프로젝트 폴더. `PHYSISIM_PROJECT`(명령을 실행한 위치 기준) 또는 저장소의 examples/. */
const project = process.env.PHYSISIM_PROJECT
  ? resolve(process.env.INIT_CWD ?? process.cwd(), process.env.PHYSISIM_PROJECT)
  : resolve(import.meta.dirname, "../../examples");

export default defineConfig({
  plugins: [react(), projectApi(project)],
  worker: { format: "es" },
});
