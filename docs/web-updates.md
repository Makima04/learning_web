# 管理员网页更新

入口：管理员登录 → 设置 → 系统更新 → 检查更新 → 立即更新 → 刷新使用新版。

这是 Docker 镜像在线升级：前后端一起更新，后端切换时有短暂中断。检查更新只接受管理员请求，
使用服务器 root 预设的 `ghcr.io/makima04/learning_web:latest`，不能从网页填写镜像、执行命令或修改部署路径。
普通账号既不显示入口，也无法调用更新接口。

## 首次安装（仅一次）

当前生产服务器仍是旧版本，已完成备份，尚未执行迁移。请在能够 SSH 到服务器的 Mac 终端运行：

```bash
python3 /Users/makima/program/web/english_web/scripts/setup-production-web-updates.py
```

脚本会打包当前工作区，上传、校验并在板子本机构建 ARM64 镜像；先恢复备份进行隔离验证，再重新备份并迁移，
同时安装 systemd 更新服务，并给应用添加只读 Unix socket 目录及专用组。
默认沿用已确认的 `root@192.168.1.161` 和
`/home/orangepi/learning_web/backups/study-20261031-195513-GKDSOr`。
如当前运行镜像已改变，需先重新运行备份脚本，再通过 `--backup <新目录>` 指定。

看到 `DEPLOY_STATUS=OK` 后，管理员刷新网页进入 `/settings/update`。
首次在板子本机构建可能需要较长时间；后续网页更新仅拉取并验证镜像，不在服务器编译。
初始安装需要 Docker、Compose v2、Python 3.9+、systemd 与 root。当前 Orange Pi Jammy 满足系统条件，
镜像构建、systemd 和容器切换仍需在板子上实际验证。

## 发布新版本

网页安装的是已发布版本。双架构镜像全部在 GitHub Actions 构建，本地无需参与：

1. 提交并推送 `main`，等待 CI 的 `lint` / `test` / `build`（amd64+arm64 原生并行）/ `manifest` 全部通过。
2. 管理员在网页检查更新并点击安装。

若 `manifest` job 失败而两个 per-arch 镜像已推成功，可在 Actions 页面 Re-run failed jobs，或本机只做合成（`docker buildx imagetools create`），无需重新构建。

镜像必须包含 `org.opencontainers.image.revision` 标签，值与 Rust 编译版本、前端版本一致；Dockerfile 已设置。
检查阶段通过 Registry API 只读取公开仓库的镜像清单与配置，获取服务器对应架构的摘要和版本标签，
不下载镜像层。只有云端配置摘要（镜像 ID）与当前运行镜像不同才显示更新按钮。
点击安装后才下载镜像，固定到检查时选定架构的 manifest 摘要，即使后续 `latest` 改变，
也不会安装另一版。下载后再次校验镜像 ID 与版本标签，通过后才开始备份、预检和切换。
检查需要仓库支持公开读取（当前 GHCR 仓库为公开）；认证使用仓库返回的匿名 Bearer token。

### 已安装主机服务的更新

本次检查逻辑在主机的 `agent.py` 中，单独发布或安装应用镜像不会更新它。
将新版 `scripts/web_updater/agent.py` 上传到主机后，在没有检查、安装或恢复任务运行时，
由 root 备份并替换 `/opt/english-web-updater/agent.py`（权限保持 `0600`），
再执行 `systemctl restart english-web-updater.service`。无需重新构建镜像或迁移数据库。

## 更新事务

- 备份数据库和当前应用配置，恢复到隔离库，在候选容器中验证启动、原有数据、学习命令幂等及维护屏障。
- 对全部原有业务表和字段计算摘要（包括学习幂等凭据）；允许新增表/字段，原有数据变化或删除则拒绝自动升级，需安排人工迁移。
- 维护标志落盘后暂停业务 API，停止旧容器，再次备份，包含预检期间所有已确认写入。
- 只重建应用服务，数据库容器和其他 Compose 服务保持运行；版本与数据校验通过后解除维护。
- 失败时保持维护，恢复本次停服后的数据库备份和旧镜像。仅在屏障内自动恢复，避免覆盖更新成功后的新学习。
- 若恢复也失败，保留事务记录和维护状态，显示需要人工处理。不会持续开放写入或静默忽略故障。
- 任务由主机服务执行；离开页面不会取消任务。浏览器遇到重启断连会继续轮询，未确认的学习写入保留在原同步队列中。

这不是任意数据库结构变更的通用迁移平台：改变原有数据或移除学习协议 v2 的版本会被预检拦截。
此更新器的主机程序由 root 在初始化时安装；网页更新应用镜像，不让容器替换 root 执行的主机程序。

## 主机文件与排障

- 服务：`english-web-updater.service`，日志：`journalctl -u english-web-updater.service -n 100 --no-pager`。
- 程序及 root 配置：`/opt/english-web-updater/`。
- 私有任务状态、事务记录及 Compose 配置：`/var/lib/english-web-updater/`（root 可读）。
- 共享目录：`/var/lib/english-web-updater/shared`，容器只读挂载到 `/run/english-web-updater`；只有 socket 和维护标志，不含凭据。
- socket 权限：root 与 `english-web-update` 组可连接，未监听 TCP 管理端口，Web 容器没有 Docker socket。
- 备份仍放在 `/home/orangepi/learning_web/backups/`，保留旧镜像和备份，不自动清理。

不要直接删除维护标志或恢复旧备份后放行写入。先检查 `transaction.json` 和日志；
服务在有恢复记录时重启会先完成恢复。已提交成功的事务只恢复新版运行状态，不再覆盖数据库。
实际 Compose 路径以运行容器标签为准，主机服务每次使用完整配置、原项目名和 `--project-directory`，
避免改动其他容器或误拉基础配置中的其他镜像。

本地检查命令：

```bash
python3 -m unittest discover -s scripts/web_updater -p 'test_*.py'
DATABASE_URL=postgres://makima@localhost/postgres cargo test --manifest-path backend/Cargo.toml
cd frontend && npm test && npm run build
```
