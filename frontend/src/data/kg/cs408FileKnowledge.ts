import { math, text } from "@/data/kg/mathReviewBuilder";
import type { ReviewBlock } from "@/lib/kg/knowledgeReview";

// 知识清单按文件管理的四个小节组织成层级分类树。图与树共用节点，跨小节复用同一份定义。
export interface FileKnowledgeNode {
  title: string;
  content: ReviewBlock[];
  /** 结合 408 真题与王道高频考点的易错提示或做题边界 */
  examTip?: string;
}

export const FILE_KNOWLEDGE_NODES = {
  logical: {
    title: "文件逻辑结构",
    content: [text("逻辑结构描述用户看到的文件内容，分为无结构文件（字节流）和有结构文件（由记录组成，进一步分为顺序、索引、索引顺序文件）。")],
    examTip: "逻辑结构面向用户视角，目的是方便用户组织和检索数据；UNIX 中普通文件和 I/O 设备均抽象为无结构字节流。",
  },
  physical: {
    title: "文件物理结构",
    content: [text("物理结构描述文件的逻辑块在外存中的组织方式，主要分为连续分配、链接分配（隐式/FAT）和索引分配，直接决定随机访问与动态扩展能力。")],
    examTip: "磁带等顺序介质只能采用连续分配；既支持随机访问又易于动态扩展的是索引分配（或显式链接 FAT）。",
  },
  stream: {
    title: "字节流",
    content: [text("无结构文件由连续字节组成，应用自行解释格式。文件系统通常用字节偏移指定读写位置。")],
  },
  record: {
    title: "定长与变长记录",
    content: [text("有结构文件由记录组成：定长记录可按记录号直接计算起点（记录成组且不跨块时，每块最多放 ⌊B/R⌋ 条）；变长记录通常需扫描长度信息或借助索引定位。")],
    examTip: "题目若说明记录成组且不跨磁盘块，先求每块放 ⌊B/R⌋ 条记录，再定第 i 条记录所在块，不能直接拿总字节除以块大小。",
  },
  sequentialFile: {
    title: "顺序文件",
    content: [text("记录按一定顺序排列，可按写入顺序（串结构）或关键字顺序（顺序结构）组织。适合批量逐条处理，插入和按关键字检索代价取决于排列方式。")],
    examTip: "只有定长记录的顺序结构文件才支持按关键字折半查找；变长记录或链式存储均无法直接折半。",
  },
  indexedFile: {
    title: "索引文件",
    content: [text("为变长记录建立索引表，将关键字映射到记录位置以支持快速随机定位。索引表占用额外空间，增删改记录时需同步维护。")],
  },
  indexedSequential: {
    title: "索引顺序文件",
    content: [
      text("将顺序记录分组，先查索引表定位到候选组，再在组内顺序查找。N 条记录均分为约 √N 组时，最优平均查找次数最少。"),
      math`\text{最优平均查找次数}\approx\sqrt{N}`,
    ],
    examTip: "经典题：10000 条记录的顺序文件改用索引顺序文件，最优平均查找约 √10000 = 100 次（原顺序查找约 5000 次）。",
  },
  access: {
    title: "顺序与随机访问",
    content: [text("顺序访问从当前位置依次读写，随机访问指定任意位置读写。逻辑上能算出偏移时，实际定位代价仍取决于记录组织与外存分配方式。")],
    examTip: "连续分配和索引分配支持随机访问；隐式链接只能顺链顺序定位，不适合随机访问。",
  },
  offset: {
    title: "文件内偏移",
    content: [text("偏移表示相对文件开头的位置。记录等长为 R、编号从 0 开始时，第 i 条记录的起始字节偏移是 i × R。")],
  },
  logicalBlock: {
    title: "逻辑块号",
    content: [
      text("块大小为 B，字节偏移为 x。从 0 编号时，先求文件内逻辑块号和块内偏移，再按分配结构定位磁盘块。"),
      math`k=\lfloor x/B\rfloor,\qquad d=x\bmod B`,
    ],
    examTip: "先确认题干中块号、记录号和字节偏移是从 0 还是从 1 开始编号，再套用整除与取模。",
  },
  diskBlock: {
    title: "磁盘数据块",
    content: [text("数据块（或簇）是外存分配与读写的逻辑单位，存放文件内容。文件系统通过块号定位数据块，并跟踪空闲与已用状态。")],
  },
  directory: {
    title: "目录项",
    content: [text("目录项将文件名映射到文件标识，实现按名存取。在索引节点模型中，目录项只记录文件名与对应的索引节点号。")],
    examTip: "目录本身也是文件；同一目录下不允许重名，不同子目录下允许重名。",
  },
  inode: {
    title: "索引节点",
    content: [text("磁盘索引节点保存文件类型、长度、权限、硬链接计数及盘块地址等元数据。文件打开时将其拷入内存索引节点，并补充打开计数、状态/修改标志、锁和设备号等运行时信息。")],
    examTip: "文件系统可创建的文件总数上限取决于索引节点总数（由节点号位数或节点表容量决定）与可用数据块数的较小值，与文件名长度无关。",
  },
  fcb: {
    title: "文件控制块",
    content: [
      text("文件控制块集中保存文件属性和存储位置。FCB 分解把文件名与索引节点号留在目录项，其余属性放入索引节点，可大幅缩小目录块数、减少查目录读盘次数。"),
      math`\text{平均访盘}=\frac{M+1}{2}\text{（未分解）}\quad\text{vs}\quad\frac{M'+1}{2}+1\text{（分解后读 inode）}`,
    ],
    examTip: "用 FCB 分解法求读入目标文件属性的平均访盘次数时，查完目录块找到匹配项后，别漏掉最后读取磁盘索引节点的 +1 次访盘。",
  },
  directoryTrees: {
    title: "目录层级",
    content: [text("单级目录共用一个命名空间，两级目录按用户划分，树形目录可逐级嵌套。共享形成无环图时，需借助链接计数控制空间回收并防止遍历成环。")],
  },
  path: {
    title: "路径解析",
    content: [text("绝对路径从根目录开始，相对路径从当前工作目录开始。解析通常逐级查目录项，遇到符号链接时继续解析目标路径。")],
    examTip: "设置当前工作目录的主要目的是缩短路径名、减少逐级检索目录的读盘次数，加快文件检索速度。",
  },
  directoryLookup: {
    title: "目录查找",
    content: [text("线性目录逐项比较文件名，哈希目录先按名称定位候选记录，并处理冲突。两者都需要得到对应文件标识。")],
    examTip: "目录检索性能主要取决于目录项数量、目录项大小（决定目录占用的盘块数）及目标项位置，与文件本身大小无关。",
  },
  protection: {
    title: "文件保护",
    content: [text("按主体和文件授予读、写、执行等权限。访问控制表按文件列出谁有什么权限，能力表则按主体列出可访问的对象和权限。")],
    examTip: "用二进制位串表示权限时，至少需要「用户类别数 × 权限种数」位（如 4 类用户 × 5 种权限 = 20 位）；存取控制信息通常存于 FCB 或 inode。",
  },
  hardLink: {
    title: "硬链接",
    content: [text("多个目录项指向同一个索引节点并共享数据。新增硬链接会增加链接计数，通常要求链接和目标在同一文件系统且一般不对目录建硬链接。")],
    examTip: "两个进程分别打开同一文件的不同硬链接，会得到各自独立的打开文件表项与读写指针，但共享同一个内存索引节点。",
  },
  symbolicLink: {
    title: "符号链接",
    content: [text("符号链接是一个独立文件，数据区保存目标路径。它可跨文件系统、支持目录链接，目标路径消失时会悬空；相对目标路径从链接所在目录解释。")],
    examTip: "建软链接不改原文件的引用计数，但软链接自身有独立 inode（计数为 1）；删原文件后，硬链接计数减 1，软链接自身计数仍为 1 但访问失效。",
  },
  linkCount: {
    title: "硬链接计数",
    content: [text("记录指向该索引节点的硬链接目录项数。关闭文件描述符影响内存打开计数，增删目录项（link/unlink）才会改变磁盘硬链接计数。")],
    examTip: "做共享与删除题时务必区分两个计数：磁盘 inode 的硬链接计数（i_nlink）与内存 inode 的打开引用计数（i_count）。",
  },
  reclaim: {
    title: "文件空间回收",
    content: [text("在 POSIX 的文件模型中，最后一个硬链接被移除后，文件仍能由已打开的引用使用。直到所有打开引用都关闭后，才回收数据块和索引节点。")],
    examTip: "判断能否真正回收磁盘空间：必须同时满足「硬链接计数 = 0」且「打开引用计数 = 0」。",
  },
  contiguous: {
    title: "连续分配",
    content: [text("文件占用一段连续的磁盘块，FCB 只需记录起始块号和长度。顺序与随机定位都快，但扩展需要相邻空闲空间，易产生外部碎片。")],
    examTip: "中间插入 1 块且前后均有空闲区时，移动块数较少的一侧（读 k + 写 k + 写新块 1 = 2k+1 次）；若往前移动，FCB 的起始块号与长度都要更新。",
  },
  fromStart: {
    title: "起始块加偏移",
    content: [text("一个连续区间的起始块号为 s、逻辑块号 k 从 0 起时，磁盘块号为 s + k。定位前先确认 k 落在该区间。")],
  },
  extent: {
    title: "盘区分配",
    content: [text("文件可以由多个连续区间（盘区）组成，每个盘区记录〈起始块号，块数〉。定位时先判断逻辑块落在哪个盘区，再按起始块加偏移计算。")],
    examTip: "预分配连续盘区 + 直接索引混合结构（如 2012 真题）：分配〈起始块号，块数〉字节数时，起始块号只需够表示磁盘总块数，多出字节给块数可增大单文件上限。",
  },
  linked: {
    title: "链接分配",
    content: [text("文件的数据块通过下一块指针串联，磁盘块可分散、无外部碎片且易于扩展。顺序访问沿链推进，隐式链接无法直接随机定位第 k 块。")],
  },
  followChain: {
    title: "顺着链定位",
    content: [text("隐式链接把下一块指针存进数据块，每块净容量为 B - p，既占用块内空间，也必须从首块逐块读盘才能取到后续指针。")],
    examTip: "隐式链接最大文件长度 = 指针可寻址块数 × 每块净容量 (B - p)；在位置 k 插入新块，需先顺链读到前驱块，再写新块并写回修改指针后的前驱块。",
  },
  fat: {
    title: "FAT",
    content: [
      text("显式链接将下一块（簇）号集中放入文件分配表。FAT[当前簇号] 存放下一簇号，常驻内存时可沿表项走链实现随机定位。表项占 p 字节、簇大小为 B 时："),
      math`\text{最大表项数}=2^{8p},\qquad \text{FAT最大长度}=2^{8p}\cdot p,\qquad \text{最大文件长度}=2^{8p}\cdot B`,
    ],
    examTip: "目录项只需记录文件首簇号；FAT 同时兼作空闲空间管理结构，且其占用的外存大小固定，不随当前空闲块数变化。",
  },
  indexed: {
    title: "索引分配",
    content: [text("为每个文件建立索引表，将逻辑块号映射到磁盘块号。兼顾随机访问与动态扩展、无外部碎片，但索引块本身占额外空间。")],
  },
  indexLookup: {
    title: "查索引项",
    content: [text("先由字节偏移 x 求逻辑块号 k = ⌊x/B⌋，判断 k 落入直接区（< N₀）、一级间接区（< N₀ + d）还是更深层；inode 已在内存且未缓存索引块时，读盘次数 = 经过的间接层数 + 1（目标数据块）。")],
    examTip: "算访盘次数前先核对三件事：目录文件是否在内存、inode 是否在内存、题目问的是读取目标数据块还是仅获取簇号。",
  },
  indexedCapacity: {
    title: "索引容量",
    content: [
      text("索引块大小为 B，每个地址项占 p 字节，每块容纳 d 个地址项。一级间接覆盖 d 个数据块，二级覆盖 d² 个，三级覆盖 d³ 个；混合索引将各层覆盖的数据块数相加后乘以 B 得最大文件长度。"),
      math`d=\lfloor B/p\rfloor`,
    ],
    examTip: "由磁盘总容量推导地址项最少字节数：先求总块数 = 总容量 / 块大小，再取 ⌈log₂(总块数) / 8⌉ 字节；计算最大文件长度时只算数据块，不计索引块。",
  },
  blockCount: {
    title: "数据块数量",
    content: [
      text("文件系统按分配单位（盘块或簇）分配空间，不足一块仍占一整块（内部碎片）。不考虑稀疏文件、压缩和块内指针开销时，文件大小为 F、每分配单位可用 B 字节："),
      math`\left\lceil F/B\right\rceil`,
    ],
    examTip: "按簇分配而非按扇区分配：例如簇 1KB、扇区 512B 时，1026B 的文件占 2 个簇（2KB），索引块另计。",
  },
  superblock: {
    title: "超级块",
    content: [text("保存文件系统整体参数，如块大小、总块数、空闲块与空闲 inode 统计及关键结构位置。挂载时读入内存，建立访问该文件系统所需的控制状态。")],
  },
  diskLayout: {
    title: "磁盘上的结构",
    content: [text("常见结构包括引导块、超级块、空闲空间记录（块位图/inode 位图）、索引节点表和数据区。具体位置及是否分块组由文件系统格式决定。")],
  },
  layers: {
    title: "文件系统分层",
    content: [text("上层（逻辑文件系统）处理按名存取、目录管理与权限保护，中间层完成文件偏移到磁盘块的映射，下层负责块 I/O、缓存与设备访问。")],
  },
  format: {
    title: "磁盘格式化与挂载",
    content: [text("低级（物理）格式化划分扇区与校验码；分区划出逻辑卷范围；逻辑（高级）格式化建立根目录、超级块并初始化空闲空间结构。挂载使文件系统接入目录树。")],
    examTip: "常考区分：分区与扇区校验码不属于逻辑格式化；建立根目录与初始化空闲空间数据结构属于逻辑格式化。",
  },
  boot: {
    title: "启动与引导",
    content: [text("固件先执行 ROM 引导程序，再加载磁盘主引导记录（MBR，含磁盘引导程序与分区表）或 UEFI 引导文件，接着运行活动分区的分区引导程序，最后加载操作系统初始化程序。")],
    examTip: "传统 MBR 多阶段引导顺序：ROM 引导程序 → 磁盘引导程序（MBR） → 分区引导程序（PBR） → 操作系统初始化程序。",
  },
  vfs: {
    title: "虚拟文件系统",
    content: [text("VFS 为上层提供统一的文件操作接口，将具体操作分派给已挂载的底层文件系统。Linux VFS 定义了四类核心内存对象：超级块、索引节点（inode）、目录项（dentry）和文件（file）。")],
    examTip: "VFS 对象仅存于内存以屏蔽不同文件系统差异；目录项缓存（dentry）用于加速路径解析。",
  },
  descriptor: {
    title: "文件描述符",
    content: [text("进程以非负整数描述符（fd）索引自己的进程打开文件表。描述符表项指向系统打开文件表中的打开文件项，复制描述符（如 dup/fork）可共享同一打开文件项。")],
  },
  openFile: {
    title: "打开文件项",
    content: [text("位于系统打开文件表，记录打开模式、引用计数和当前读写偏移，并指向内存索引节点。同一文件被多次独立 open() 时对应多个打开文件项，读写指针互不干扰。")],
  },
  openClose: {
    title: "打开与关闭",
    content: [text("open() 逐级解析路径、检查权限、将磁盘 inode 调入内存并在系统与进程打开文件表中建项，返回 fd；close() 释放该描述符，递减打开计数，归零时回收打开文件项与内存 inode。")],
    examTip: "只有 open() 等按路径操作的调用会按名查目录；read()/write() 传的是 fd 而非文件名。close() 不会删除磁盘目录项或文件数据。",
  },
  operations: {
    title: "文件基本操作",
    content: [text("创建空文件时分配目录项和 inode 并初始化元数据；读写以打开文件项的当前偏移为起点并推进偏移；lseek 仅修改偏移；删除文件时移除目录项并递减硬链接计数，计数归零且无打开引用时回收块与 inode。")],
    examTip: "高频反向考点：新建空文件不会分配数据块；删除文件或目录需更新目录、链接计数及位图，但内核不必将数据块原内容清零。",
  },
  freeSpace: {
    title: "空闲空间记录",
    content: [text("分配磁盘块时将块标为已用，回收时标为空闲。空闲表、空闲链表、位示图、成组链接和 FAT 均可用于管理空闲磁盘块。")],
    examTip: "索引节点（inode）不用于管理空闲块；提高文件访问速度的常见优化有提前读、延迟写、磁盘高速缓存和分配连续簇。",
  },
  freeExtents: {
    title: "空闲表",
    content: [text("每项记录连续空闲区的起始块号与长度，适合连续分配。分配可能拆分区间，回收时合并相邻空闲区间以减少碎片。")],
  },
  freeList: {
    title: "空闲链表",
    content: [text("通过下一空闲块指针串联空闲块，从链头分配与回收都快，但寻找一批连续空闲块时往往需要遍历整条链表。")],
  },
  bitmap: {
    title: "位示图",
    content: [
      text("每位记录一个块的分配状态，N 个块占 ⌈N/8⌉ 字节。盘块号 b 与块内字节均从 0 编号、每盘块 B 字节（8B 位）时，可按以下公式跨盘块定位；若按字（字长 w）且从 0 编号，字下标为 ⌊b/w⌋、位下标为 b mod w。"),
      math`\text{总字节}=\left\lceil\frac{N}{8}\right\rceil,\qquad \text{所在盘块}=\text{起始块}+\left\lfloor\frac{b}{8B}\right\rfloor,\qquad \text{块内字节}=\left\lfloor\frac{b\bmod(8B)}{8}\right\rfloor`,
    ],
    examTip: "做题先看 0/1 含义及编号起点：行号与列号从 1 开始（每行 w 位）时，行 = ⌈b/w⌉，列 = ((b-1) mod w) + 1；位图外存占用固定，与空闲块数无关。",
  },
  grouped: {
    title: "成组链接法",
    content: [text("UNIX 常用方法：空闲块号分组保存，每组首块存放下一组的空闲块号及计数，当前组通过内存空闲盘块号栈分配，可批量读入以减少逐块追链的读盘开销。")],
    examTip: "看到题干出现「空闲盘块号栈」或「UNIX 空闲空间管理」，直接对应成组链接法。",
  },
  consistency: {
    title: "文件系统一致性",
    content: [text("目录项、索引节点（含链接计数）和空闲空间记录要对应同一份磁盘状态。崩溃可能留下部分更新，日志文件系统与一致性检查（如 fsck）是常见的恢复手段。")],
  },
} satisfies Record<string, FileKnowledgeNode>;

export type FileKnowledgeId = keyof typeof FILE_KNOWLEDGE_NODES;

export interface FileKnowledgeTreeItem {
  id: FileKnowledgeId;
  /** 简短分类标签，帮助一眼看出当前节点在体系中的角色 */
  tag?: string;
  /** 指向更详尽小节的直达入口（如第 1 节物理分类直达第 3 节） */
  detailSection?: string;
  children?: readonly FileKnowledgeTreeItem[];
}

export interface FileKnowledgeGroup {
  title: string;
  subtitle?: string;
  items: readonly FileKnowledgeTreeItem[];
}

export interface FileKnowledgeComparison {
  title: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}

export interface FileKnowledgeSection {
  id: string;
  title: string;
  opening: string;
  graph: readonly (readonly [FileKnowledgeId, number, number])[];
  edges: readonly (readonly [FileKnowledgeId, FileKnowledgeId, string])[];
  groups: readonly FileKnowledgeGroup[];
  comparison?: FileKnowledgeComparison;
}

export function flattenTreeIds(items: readonly FileKnowledgeTreeItem[]): FileKnowledgeId[] {
  return items.flatMap(item => [item.id, ...(item.children ? flattenTreeIds(item.children) : [])]);
}

export function sectionNodeIds(section: FileKnowledgeSection): FileKnowledgeId[] {
  return section.groups.flatMap(group => flattenTreeIds(group.items));
}

export const FILE_KNOWLEDGE_SECTIONS: readonly FileKnowledgeSection[] = [
  {
    id: "os.file.struct",
    title: "文件逻辑/物理结构",
    opening: "先按「逻辑结构（用户怎么组织内容）」与「物理结构（外存怎么分配磁盘块）」两条线分类，再看地址如何从偏移映射到磁盘块。",
    graph: [["logical", 1, 1], ["offset", 1, 2], ["logicalBlock", 1, 3], ["access", 2, 1], ["physical", 2, 2], ["diskBlock", 2, 3]],
    edges: [
      ["logical", "offset", "定位内容"],
      ["offset", "logicalBlock", "按块划分"],
      ["logicalBlock", "diskBlock", "地址映射"],
      ["logical", "access", "影响访问"],
      ["physical", "access", "决定访问能力"],
      ["physical", "diskBlock", "组织外存"],
    ],
    groups: [
      {
        title: "一、文件逻辑结构（用户视角）",
        subtitle: "先分无结构 / 有结构，再看记录怎么组织",
        items: [
          {
            id: "logical",
            tag: "总览",
            children: [
              { id: "stream", tag: "无结构文件" },
              {
                id: "record",
                tag: "有结构 · 记录式",
                children: [
                  { id: "sequentialFile", tag: "串结构 / 顺序结构" },
                  { id: "indexedFile", tag: "变长记录随机定位" },
                  { id: "indexedSequential", tag: "分组 + 索引" },
                ],
              },
            ],
          },
        ],
      },
      {
        title: "二、文件物理结构（OS / 外存视角）",
        subtitle: "逻辑块在磁盘上的三种分配形态",
        items: [
          {
            id: "physical",
            tag: "总览",
            children: [
              { id: "contiguous", tag: "连续块", detailSection: "os.file.alloc" },
              { id: "linked", tag: "隐式 / FAT", detailSection: "os.file.alloc" },
              { id: "indexed", tag: "单级 / 多级 / 混合", detailSection: "os.file.alloc" },
            ],
          },
        ],
      },
      {
        title: "三、逻辑到物理的桥梁（访问与地址映射）",
        subtitle: "把记录/字节翻译成磁盘数据块",
        items: [
          { id: "access", tag: "逻辑 × 物理共同决定" },
          {
            id: "offset",
            tag: "Step 1 算偏移",
            children: [
              {
                id: "logicalBlock",
                tag: "Step 2 划逻辑块",
                children: [{ id: "diskBlock", tag: "Step 3 映物理块" }],
              },
            ],
          },
        ],
      },
    ],
    comparison: {
      title: "逻辑结构 vs 物理结构 核心区分",
      headers: ["维度", "文件逻辑结构", "文件物理结构"],
      rows: [
        ["观察视角", "用户 / 应用程序视角", "操作系统 / 外存管理视角"],
        ["具体分类", "无结构（字节流）；有结构（顺序、索引、索引顺序）", "连续分配；链接分配（隐式 / FAT）；索引分配"],
        ["主要决定", "文件内如何按字节或记录检索与编排", "随机访问速度、动态扩展代价、碎片情况"],
        ["408 高频考法", "索引顺序文件 √N；定长记录成组不跨块", "不同分配方式的随机访问/扩展对比与访盘核算"],
      ],
    },
  },
  {
    id: "os.file.dir",
    title: "目录结构与文件共享",
    opening: "目录解决「按名找文件」的层级组织；共享与删除题必须同时跟踪目录项、硬链接计数与内存打开引用。",
    graph: [["directory", 1, 1], ["inode", 1, 2], ["linkCount", 1, 3], ["symbolicLink", 2, 1], ["hardLink", 2, 2], ["reclaim", 2, 3]],
    edges: [["directory", "inode", "指向"], ["inode", "linkCount", "记录"], ["symbolicLink", "directory", "按路径查找"], ["hardLink", "inode", "共享"], ["linkCount", "reclaim", "影响回收"]],
    groups: [
      {
        title: "一、目录层级与按名存取",
        subtitle: "从目录树结构到 FCB 分解与查找",
        items: [
          {
            id: "directoryTrees",
            tag: "单级 / 两级 / 树形 / 无环图",
            children: [
              { id: "path", tag: "绝对 / 相对路径" },
              { id: "directoryLookup", tag: "线性 / 哈希" },
            ],
          },
          {
            id: "directory",
            tag: "文件名 → 标识",
            children: [
              { id: "fcb", tag: "集中存放 / 分解法" },
              { id: "inode", tag: "磁盘态 vs 内存态" },
            ],
          },
        ],
      },
      {
        title: "二、文件共享、生命周期与保护",
        subtitle: "区分硬链接计数与打开计数",
        items: [
          {
            id: "hardLink",
            tag: "共享同一 inode",
            children: [{ id: "linkCount", tag: "磁盘 i_nlink" }],
          },
          { id: "symbolicLink", tag: "独立 inode + 存路径" },
          {
            id: "openClose",
            tag: "内存 i_count",
            children: [{ id: "reclaim", tag: "双计数归零回收" }],
          },
          { id: "protection", tag: "ACL / 能力表 / 权限位串" },
        ],
      },
    ],
    comparison: {
      title: "硬链接 vs 符号链接（软链接）",
      headers: ["对比项", "硬链接（Hard Link）", "符号链接（Soft Link）"],
      rows: [
        ["指向对象", "多个目录项指向同一个 inode", "独立文件 + 独立 inode，内容存放目标路径"],
        ["跨文件系统 / 目录", "通常不可跨文件系统，一般不链目录", "可跨文件系统，支持链接目录"],
        ["对原文件计数影响", "创建 +1，删除 -1", "创建与删除均不改变原文件硬链接计数"],
        ["删除原文件后", "硬链接计数减 1，其余硬链接仍正常访问", "软链接自身计数仍为 1，但访问时路径悬空失效"],
      ],
    },
  },
  {
    id: "os.file.alloc",
    title: "磁盘分配（连续/链接/索引）",
    opening: "三种分配方式都要把逻辑块号映射到磁盘块，按「结构分类 → 定位方式 → 容量与 I/O 核算」串联掌握。",
    graph: [["contiguous", 1, 1], ["linked", 1, 2], ["indexed", 1, 3], ["fromStart", 2, 1], ["followChain", 2, 2], ["indexLookup", 2, 3]],
    edges: [["contiguous", "fromStart", "直接计算"], ["linked", "followChain", "逐项查找"], ["indexed", "indexLookup", "按项定位"]],
    groups: [
      {
        title: "一、三种物理分配方式与常见变体",
        subtitle: "每种方式对应的定位机制",
        items: [
          {
            id: "contiguous",
            tag: "连续区",
            children: [
              { id: "fromStart", tag: "定位：s + k" },
              { id: "extent", tag: "变体：多盘区" },
            ],
          },
          {
            id: "linked",
            tag: "指针串联",
            children: [
              { id: "followChain", tag: "隐式链接" },
              { id: "fat", tag: "显式链接（FAT）" },
            ],
          },
          {
            id: "indexed",
            tag: "索引表映射",
            children: [{ id: "indexLookup", tag: "直接 / 多级间接" }],
          },
        ],
      },
      {
        title: "二、容量与访盘次数核算",
        subtitle: "大题必用的基础换算",
        items: [
          {
            id: "logicalBlock",
            tag: "偏移 → 逻辑块",
            children: [{ id: "diskBlock", tag: "目标磁盘块" }],
          },
          { id: "blockCount", tag: "按块/簇向上取整" },
          { id: "indexedCapacity", tag: "单块地址项与最大文件" },
        ],
      },
    ],
    comparison: {
      title: "三种磁盘分配方式核心对比",
      headers: ["方式", "随机访问", "动态扩展 / 插入", "外部碎片", "典型 408 考点"],
      rows: [
        ["连续分配", "快（O(1) 算 s+k）", "难（需相邻空闲区 / 搬移块）", "有", "中间插入最少 I/O、前移改起始块号"],
        ["隐式链接", "不支持（须顺链读盘）", "易（改指针即可）", "无", "块内净容量 B-p、插块需先读前驱"],
        ["显式链接（FAT）", "支持（FAT 驻内存）", "易", "无", "FAT 表最大长度、最大文件长度"],
        ["索引分配", "支持（按层查表）", "易（索引块占额外空间）", "无", "混合索引容量、按偏移算读盘次数"],
      ],
    },
  },
  {
    id: "os.file.fs",
    title: "文件系统实现与空闲管理",
    opening: "分成三条清晰主线：外存静态结构与分层、进程访问文件的系统调用链路、外存空闲块的记录与回收。",
    graph: [["descriptor", 1, 1], ["openFile", 1, 2], ["inode", 1, 3], ["bitmap", 2, 1], ["freeSpace", 2, 2], ["diskBlock", 2, 3]],
    edges: [["descriptor", "openFile", "引用"], ["openFile", "inode", "关联文件"], ["inode", "diskBlock", "定位"], ["bitmap", "freeSpace", "实现"], ["freeSpace", "diskBlock", "记录分配状态"]],
    groups: [
      {
        title: "一、磁盘结构、分层与引导",
        subtitle: "文件系统如何落地到磁盘并启动",
        items: [
          {
            id: "diskLayout",
            tag: "磁盘静态布局",
            children: [
              { id: "superblock", tag: "全局参数" },
              { id: "inode", tag: "文件元数据" },
              { id: "diskBlock", tag: "数据区" },
            ],
          },
          {
            id: "layers",
            tag: "层次结构",
            children: [{ id: "vfs", tag: "统一抽象层" }],
          },
          {
            id: "format",
            tag: "低格 → 分区 → 逻格",
            children: [{ id: "boot", tag: "多阶段引导" }],
          },
        ],
      },
      {
        title: "二、进程访问链路与系统调用",
        subtitle: "fd → 系统打开文件表 → 内存 inode",
        items: [
          {
            id: "descriptor",
            tag: "进程表",
            children: [
              {
                id: "openFile",
                tag: "系统表",
                children: [
                  { id: "openClose", tag: "open / close" },
                  { id: "operations", tag: "create / read / unlink" },
                  { id: "reclaim", tag: "空间回收时机" },
                ],
              },
            ],
          },
        ],
      },
      {
        title: "三、外存空闲空间管理与一致性",
        subtitle: "空闲块的记录、分配、回收与恢复",
        items: [
          {
            id: "freeSpace",
            tag: "总览",
            children: [
              { id: "freeExtents", tag: "空闲表" },
              { id: "freeList", tag: "空闲链表" },
              { id: "bitmap", tag: "位示图" },
              { id: "grouped", tag: "成组链接法（UNIX）" },
            ],
          },
          { id: "consistency", tag: "日志 / 崩溃恢复" },
        ],
      },
    ],
    comparison: {
      title: "空闲空间管理方法核心对比",
      headers: ["方法", "外存占用是否随空闲块数变", "找连续空闲块", "典型 408 考点"],
      rows: [
        ["空闲表", "随空闲区段数变化", "容易", "适合连续分配、回收时合并相邻区"],
        ["空闲链表", "随空闲块数变化", "困难（需遍历）", "适合离散分配、从链头取放"],
        ["位示图", "固定不变（⌈N/8⌉ 字节）", "容易（扫描连续 0/1）", "跨盘块定位、0/1 起始编号换算"],
        ["成组链接法", "随空闲组数变化", "一般", "UNIX 默认方案、内存空闲盘块号栈"],
        ["FAT", "固定不变（按总簇数定）", "一般", "兼顾链接分配与空闲簇记录"],
      ],
    },
  },
];

export function findFileKnowledgeSection(id: string | null): FileKnowledgeSection | undefined {
  return FILE_KNOWLEDGE_SECTIONS.find(section => section.id === id);
}
