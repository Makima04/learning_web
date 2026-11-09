// 体系参考的公开书目信息；正文为自编提要，不声明逐页摘录或官方指定教材。
export const REVIEW_TEXTBOOKS = {
 calc: { note: "f′ 为导数，fₓ 为偏导；C¹ 表示一阶导／偏导连续，D、V 表示积分区域。", title: "同济大学《高等数学》", url: "https://abook.hep.com.cn/39663/" },
 la: { note: "Aᵀ 为转置，A* 为伴随，I 为单位矩阵，r(A) 为秩；向量默认列向量。", title: "同济大学《工程数学·线性代数》", url: "https://www.hep.com.cn/book/show/7b50dcc9-58d0-4c23-ac7a-81bafeb921da" },
 prob: { note: "EX 为期望，DX 为方差，Φ 为标准正态分布函数；分位数采用上侧定义。", title: "浙大盛骤等《概率论与数理统计》", url: "https://xuanshu.hep.com.cn/front/book/findBookDetails?bookId=59cf8455ba9eb884cf82377e" },
 ds: { note: "n 通常表示数据规模，h 表示树高；O 为渐近上界，下标和头结点按题内约定。", title: "严蔚敏、吴伟民《数据结构（C语言版）》", url: "https://www.tup.tsinghua.edu.cn/bookscenter/book_02564806.html" },
 co: { note: "B 是字节，bit 是位；KiB=2¹⁰ B，GHz=10⁹ Hz；先确认编址单位。", title: "唐朔飞《计算机组成原理》", url: "https://www.hep.com.cn/book/show/ae8b4f15-c953-4445-a56d-ed96390fe0ae" },
 os: { note: "状态、信号量初值、页长和算法次序均按题内约定；唤醒与获得 CPU 不同。", title: "汤小丹等《计算机操作系统》", url: "https://www.xduph.com/pages/BookDetail.aspx?doi=cf8d7030-acc9-4d7a-9f22-b44977527758&type=1" },
 cn: { note: "速率以 bit/s、字节量以 B 计；RTT 为往返时延，MSS 为最大报文段数据量。", title: "谢希仁《计算机网络》", url: "https://www.phei.com.cn/module/goods/wssd_content.jsp?bookid=58234" },
} as const;
export function reviewTextbook(kpId: string) {
 return REVIEW_TEXTBOOKS[kpId.split(".")[0] as keyof typeof REVIEW_TEXTBOOKS];
}
