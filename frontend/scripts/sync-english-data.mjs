// 从仓库内的发布数据同步 Vite 使用的副本，本地开发和镜像构建共用。
import { copyFileSync, mkdirSync } from "node:fs";

const source = new URL("../../web/", import.meta.url);
const destination = new URL("../public/", import.meta.url);

mkdirSync(destination, { recursive: true });
for (const filename of ["data.js", "papers.js", "wordinfo.js"]) {
  copyFileSync(new URL(filename, source), new URL(filename, destination));
}
