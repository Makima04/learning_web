# Orange Pi 学习同步迁移记录

当前状态：生产备份已校验，尚待在服务器执行候选版本恢复演练与切换。

## 已确认的部署

- 主机：`root@192.168.1.161`，`orangepi3b`。
- Compose 目录：`/home/orangepi/learning_web`。
- 应用容器：`english_web`，对外端口 `8800`。
- 数据库容器：`learning_web-db-1`，数据库 `english_web`。
- 首次备份：`backups/study-20261031-195513-GKDSOr`。
- 初始回滚镜像：`english-web:rollback-study-20261031-195513-GKDSOr`。
- 初始数据：1 个账号，3830 张卡片，18528 条事件，95 条每日统计。
- 迁移 001 的校验和与本地源码一致。数据库备份格式、SHA256 校验通过。

## 发布方式

本机 `python3 scripts/package-study-release.py` 生成源码包、源码清单与校验和。
将包及 `.sha256` 文件上传服务器，检查校验和并解压到部署目录的 `releases/`。
在解压目录执行：

```bash
python3 scripts/deploy_production_study.py \
  --backup /home/orangepi/learning_web/backups/study-20261031-195513-GKDSOr \
  --apply --enable-web-updater
```

脚本会在服务器本机构建镜像，恢复备份到临时数据库，验证迁移前后用户数据摘要一致，
并检查 HTTP 接口的重试幂等、旧数据导入和分钟步骤。临时容器不发布宿主端口，临时库验证后删除。
验证通过后重新备份当前数据库，只重建应用服务；迁移 002 增加幂等凭据，003 对齐已有卡片的北京时间零点。
学习次数、难度和客户端版本不会因日期对齐而改变。

正式部署后镜像会固定到源码内容标识，实际 Compose 配置路径由 `ACTIVE_COMPOSE` 输出。
加上 `--enable-web-updater` 会一并安装主机更新服务。首次安装的单命令入口及后续管理员网页更新见 [网页更新](web-updates.md)。
后续维护应使用该配置、原项目名及 `--project-directory /home/orangepi/learning_web`，
避免重新用基础配置中的 `latest` 覆盖候选版本。

## 回滚

`ROLLBACK_STATE` 指向切换前备份目录中的 `deployment-state.json`。
在同一源码目录执行 `python3 scripts/deploy_production_study.py --rollback <该文件路径>`。
脚本恢复固定的旧镜像，并撤销旧二进制不认识的新增 SQLx 迁移记录；新增数据表及学习数据保留，
避免用旧备份覆盖切换之后的学习。新增迁移本身可重复应用。

## 旧逻辑退出

本阶段保留旧服务端写接口，浏览器已有卡片、事件和计数队列已通过统一事务导入接口迁移。
迁移凭据按账号保存，重复请求复用操作 ID；只有服务端确认成功，原队列才完成清理。
生产切换验证后，再移除旧写接口及客户端别名；旧本地格式的一次性读取转换仍需保留，
以便长期离线的浏览器刷新新版后恢复未同步进度。
