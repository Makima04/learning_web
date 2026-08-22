// 图解 · DHCP 四步（DORA）与 FTP 双连接：广播/单播序列由 doraSteps() 现算；
// FTP 控制连接 21 / 数据连接 20（主动）或被动端口，两种模式对比。
import { useMemo } from "react";
import { StepDesc, VizControls, VizFrame, usePlayer } from "@/viz/player";
import { cn } from "@/lib/utils";

export interface DoraStep {
  no: number;
  name: string;
  from: string;
  to: string;
  broadcast: boolean;
  note: string;
}

/** DHCP DORA 四步（无 IP 时全部广播，除 Offer 可单播） */
export function doraSteps(): DoraStep[] {
  return [
    { no: 1, name: "Discover", from: "客户(0.0.0.0)", to: "255.255.255.255", broadcast: true, note: "客户端还没 IP：源 0.0.0.0、目的 255.255.255.255 广播找 DHCP 服务器" },
    { no: 2, name: "Offer", from: "DHCP 服务器", to: "客户 MAC", broadcast: false, note: "服务器提供一个可用 IP（含掩码/网关/DNS/租期），通常直接单播给客户 MAC" },
    { no: 3, name: "Request", from: "客户(0.0.0.0)", to: "255.255.255.255", broadcast: true, note: "客户广播「我要用这个 IP」——广播是为了让其他 DHCP 服务器也知道被选中并收回各自 Offer" },
    { no: 4, name: "ACK", from: "DHCP 服务器", to: "客户 MAC", broadcast: false, note: "服务器确认，客户端绑定 IP；租期内可续约（T1=租期一半单播续，T2=87.5% 广播续）" },
  ];
}

interface Frame extends VizFrame {
  show: "dora" | "renew" | "ftp-active" | "ftp-passive" | "summary";
}

function buildFrames(): Frame[] {
  const dora = doraSteps();
  return [
    {
      show: "dora",
      phase: "DORA 四步",
      desc: `DHCP（应用层，UDP 67 服务器 / 68 客户端）动态拿 IP：${dora.map((d) => d.name).join(" → ")}。两次广播两次单播。DHCP 中继让跨网段的请求也能到服务器（中继把广播转单播）。考试爱考消息顺序与广播/单播判断（见下方四卡）`,
    },
    {
      show: "renew",
      phase: "续租与端口",
      desc: "租期机制：T1（50% 租期）单播 Request 续租；T2（87.5%）广播续租；到期未续 → IP 回收。客户端离开网络发 Release。DHCPv6 用 546/547。顺带记：DHCP 属于动态分配（相对静态 BOOTP）；「即插即用」是它相对手动配置的核心卖点。",
    },
    {
      show: "ftp-active",
      phase: "FTP 主动模式",
      desc: "FTP 双连接设计：控制连接（服务器 21 口）传命令，全称会话保持；数据连接按需建立。主动模式（PORT）：客户端先告诉服务器「我开了 X 口等你」→ 服务器主动从 20 口连客户端 X 口。问题：客户端在 NAT/防火墙后，服务器连不进来。",
    },
    {
      show: "ftp-passive",
      phase: "FTP 被动模式",
      desc: "被动模式（PASV）：客户端发 PASV → 服务器回「我在 Y 口等你」→ 客户端主动连服务器 Y 口取数据。两条数据连接方向都由客户端发起，穿 NAT 友好。控制/数据分离是 FTP 的考试重点（带外传输 control out-of-band）；传输模式 ASCII/BINARY、断点续传了解即可。",
    },
    {
      show: "summary",
      phase: "小结",
      desc: "应用层杂项速记：FTP 20/21 双连接、控制带外；DHCP 67/68 DORA、中继；SMTP 推邮件（25，推到对方服务器）、POP3/IMAP 拉（110/143，IMAP 服务器端同步）；MIME 扩展非 ASCII；远程 RDP/SSH（22）。「控制与数据分离」思想也出现在 RTP/RTSP、SIP。",
    },
  ];
}

export function DhcpView() {
  const frames = useMemo(buildFrames, []);
  const p = usePlayer(frames.length);
  const fr = frames[p.idx];

  return (
    <div className="space-y-4">
      {fr.show === "dora" && (
        <div className="space-y-1.5">
          {doraSteps().map((d) => (
            <div key={d.no} className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs",
              d.broadcast ? "border-amber-500 bg-amber-500/10" : "border-border"
            )}>
              <span className="w-20 shrink-0 font-bold text-sky-600">{d.name}</span>
              <span className="w-40 shrink-0 font-mono text-[11px] text-muted-foreground">{d.from} → {d.to}</span>
              <span className="flex-1">{d.note}</span>
              {d.broadcast && <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">广播</span>}
            </div>
          ))}
        </div>
      )}
      {(fr.show === "ftp-active" || fr.show === "ftp-passive") && (
        <div className="space-y-3 rounded-xl border p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-16 font-semibold">客户端</span>
            <div className="flex flex-1 items-center gap-2">
              <div className="h-8 flex-1 rounded border border-emerald-500 bg-emerald-500/10 px-2 leading-8">
                控制连接（服务器 21 口）— 命令/应答
              </div>
            </div>
            <span className="w-16 text-right font-semibold">服务器</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-16" />
            <div className={cn("h-8 flex-1 rounded border px-2 leading-8", fr.show === "ftp-active" ? "border-rose-400 bg-rose-500/10" : "border-sky-400 bg-sky-500/10")}>
              {fr.show === "ftp-active"
                ? "数据连接：服务器 20 口 → 主动连客户端指定口（NAT 不友好）"
                : "数据连接：客户端 → 主动连服务器 PASV 指定的口（NAT 友好）"}
            </div>
            <span className="w-16" />
          </div>
        </div>
      )}
      <StepDesc frame={fr} />
      <VizControls p={p} />
    </div>
  );
}
