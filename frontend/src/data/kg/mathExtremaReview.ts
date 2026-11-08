// 求极值首组：由已确认样稿整理；引用题号对应现有真题与教辅目录。
import type { KnowledgeReview } from "@/lib/kg/knowledgeReview";

export const MATH_EXTREMA_REVIEW: KnowledgeReview = {
  "kpId": "calc.m.ext",
  "title": "求极值与最值",
  "description": "先识别题目，再恢复路线；计算技巧随用随看。",
  "opening": "求附近的极大极小，还是整个范围的最大最小？变量能自由变化，还是被限制在曲线、曲面或区域中？",
  "scope": "边界上的最值属于约束问题；求整个区域的最值，要同时检查内部与边界。",
  "defaultRouteId": "region",
  "routes": [
    {
      "id": "free",
      "title": "无约束 · 局部极值",
      "cue": "求 f(x,y) 的极值",
      "lessons": [
        {
          "id": "free",
          "label": "常规判别 · 2020 真题",
          "examId": "math1-2020-q15",
          "prompt": [
            {
              "type": "text",
              "text": "求函数的极值："
            },
            {
              "type": "math",
              "tex": "f(x,y)=x^3+8y^3-xy"
            }
          ],
          "signals": [
            "直接求 f(x,y) 的极值",
            "没有额外等式约束",
            "考察定义域内部"
          ],
          "recognition": "先找驻点，再判别局部性质；不要求把不同驻点的函数值互相排序。",
          "steps": [
            {
              "title": "先确认定义域与可微性",
              "action": "内部可微的极值点，必须满足 fₓ=fᵧ=0。",
              "working": [
                {
                  "type": "text",
                  "text": "本题是多项式，定义域为整个平面，并且具有连续二阶偏导数。一般题目还要检查定义域限制及不可微点。"
                }
              ]
            },
            {
              "title": "解一阶偏导方程，找全驻点",
              "action": "驻点只是候选，求出来还没结束。",
              "working": [
                {
                  "type": "math",
                  "tex": "3x^2-y=0,\\quad24y^2-x=0"
                },
                {
                  "type": "text",
                  "text": "解得 (0,0) 与 (1/6,1/12)。消元时不要直接除以 x 或 y，以免漏掉零解。"
                }
              ]
            },
            {
              "title": "逐点做二阶判别",
              "action": "在每个驻点计算 A=fₓₓ、B=fₓᵧ、C=fᵧᵧ 与 Δ=AC−B²。",
              "working": [
                {
                  "type": "math",
                  "tex": "A=6x,\\quad B=-1,\\quad C=48y"
                },
                {
                  "type": "text",
                  "text": "(0,0)：Δ=−1<0，不是极值点。"
                },
                {
                  "type": "text",
                  "text": "(1/6,1/12)：A=1，B=−1，C=4，Δ=3>0 且 A>0，为严格局部极小值点。"
                }
              ]
            },
            {
              "title": "写明极值点、极值及类型",
              "action": "若 Δ=0，转入定义法或其他分析，不能直接下结论。",
              "working": [
                {
                  "type": "text",
                  "text": "在 (1/6,1/12) 处取得极小值 −1/216；没有极大值。"
                },
                {
                  "type": "text",
                  "text": "这里回答的是局部极值，不据此声称整个平面的最小值。"
                }
              ]
            }
          ],
          "checkpoint": "不要把“驻点”当作“极值点”，也不要把局部极小值直接当作全局最小值。",
          "techniques": [
            {
              "title": "二阶判别，一次记清",
              "content": [
                {
                  "type": "math",
                  "tex": "\\Delta=AC-B^2"
                },
                {
                  "type": "text",
                  "text": "Δ>0 且 A>0：严格局部极小；Δ>0 且 A<0：严格局部极大；Δ<0：鞍点；Δ=0：此法无法判定。要求函数在该点附近有连续二阶偏导数。"
                }
              ]
            },
            {
              "title": "隐函数极值，先转成同一路线",
              "content": [
                {
                  "type": "text",
                  "text": "若 F(x,y,z)=0 确定 z=z(x,y)，先检查 F_z≠0。由 zₓ=−Fₓ/F_z、zᵧ=−Fᵧ/F_z，联立 Fₓ=Fᵧ=F=0 找驻点，再用 z 的二阶偏导判别。F_z=0 处要另查。"
                }
              ]
            },
            {
              "title": "参数题不只求驻点",
              "content": [
                {
                  "type": "text",
                  "text": "“何种参数使极大值唯一”要把存在性、唯一性和极大性质都说明。对于二次函数可检查 Hessian 是否负定；退化情形需单独讨论。"
                }
              ]
            }
          ],
          "references": [
            {
              "source": "exam",
              "questionId": "math1-2020-q15",
              "purpose": "练完整的“求驻点 → 逐点判别 → 写结论”。"
            },
            {
              "source": "exam",
              "questionId": "math1-2023-q18",
              "purpose": "原点的二阶判别式为 0，必须继续判断。点上方的“判别失效”可切换到这道题。"
            },
            {
              "source": "lilin880",
              "questionId": "ll-hard-5-big-8",
              "purpose": "由 x²−6xy+10y²−2yz−z²+18=0 确定 z(x,y)。补“隐函数先求导，再回到驻点与判别”。",
              "label": "多元函数微分学及其应用 · 第 8 题"
            },
            {
              "source": "zhangyu1000",
              "questionId": "zy-hard-hs-13-27",
              "purpose": "f=3x+4y−ax²−2ay²−2bxy，问何时有唯一极大值。补“由判别反求参数条件”。",
              "label": "多元函数微分学 · 第 27 题"
            }
          ],
          "selfCheck": {
            "question": "两个驻点中，一个函数值更大，就能把它判成极大值点吗？",
            "options": [
              "能，比较函数值就够了",
              "不能，需要判断附近的变化"
            ],
            "correctIndex": 1,
            "explanation": "极大极小是相对于该点附近而言，不能靠比较两个驻点的函数值判断。"
          }
        },
        {
          "id": "degenerate",
          "label": "判别失效 · 2023 真题",
          "examId": "math1-2023-q18",
          "prompt": [
            {
              "type": "text",
              "text": "求函数的极值："
            },
            {
              "type": "math",
              "tex": "f(x,y)=(y-x^2)(y-x^3)"
            }
          ],
          "signals": [
            "仍然是无约束极值",
            "驻点处 Δ=0",
            "二阶判别法无法判定"
          ],
          "recognition": "这是“驻点后判别”的后续分支；需要对照该点附近函数值的大小。",
          "steps": [
            {
              "title": "按常规路线找出全部驻点",
              "action": "不要因为一个点退化，就漏掉其余驻点。",
              "working": [
                {
                  "type": "text",
                  "text": "驻点为 (0,0)、(1,1)、(2/3,10/27)。"
                }
              ]
            },
            {
              "title": "能用二阶判别的点先处理",
              "action": "Δ≠0 的点照常判别，只把失效的点留给其他方法。",
              "working": [
                {
                  "type": "text",
                  "text": "(1,1) 处 Δ=−1<0，不是极值点。"
                },
                {
                  "type": "text",
                  "text": "(2/3,10/27) 处 Δ=8/27>0 且 A=100/27>0，取得严格局部极小值 −4/729。"
                }
              ]
            },
            {
              "title": "原点改看定义：找附近一大一小",
              "action": "要否定极值，找任意接近该点、函数值分居 f(0,0) 两侧的点。",
              "working": [
                {
                  "type": "math",
                  "tex": "f(t,0)=t^5,\\qquad f(0,0)=0"
                },
                {
                  "type": "text",
                  "text": "t>0 时 f(t,0)>0，t<0 时 f(t,0)<0，两类点都能任意接近原点，因此原点不是极值点。"
                }
              ]
            },
            {
              "title": "合并结论",
              "action": "说明失效点怎样处理，再写最终极值。",
              "working": [
                {
                  "type": "text",
                  "text": "只有 (2/3,10/27) 是极小值点，极小值 −4/729；没有极大值。"
                }
              ]
            }
          ],
          "checkpoint": "几条路径都不变号，不能据此证明极值；但只要找到两列趋近点使函数值一大一小，就能否定极值。",
          "techniques": [
            {
              "title": "先尝试最简单的路径",
              "content": [
                {
                  "type": "text",
                  "text": "先看 x=0、y=0、y=kx；若不足，再根据函数结构找曲线。本题取 y=0 就能看到 t⁵ 变号。"
                }
              ]
            },
            {
              "title": "证明极小值需要什么",
              "content": [
                {
                  "type": "text",
                  "text": "要控制一个邻域内的所有允许点，例如把 f−f(P) 写成非负量，或给出统一的不等式。检查有限条路径通常不够。"
                }
              ]
            },
            {
              "title": "Δ=0 为什么不能猜",
              "content": [
                {
                  "type": "text",
                  "text": "x⁴+y⁴ 在原点有极小值，x⁴−y⁴ 在原点没有极值，而两者在原点的二阶判别式都是 0。"
                }
              ]
            }
          ],
          "references": [
            {
              "source": "exam",
              "questionId": "math1-2023-q18",
              "purpose": "这道真题决定主模板必须保留“Δ=0 后怎么办”。"
            },
            {
              "source": "lilin880",
              "questionId": "ll-hard-5-big-8",
              "purpose": "隐函数题提示：套用判别前，先确认函数与导数的适用条件。",
              "label": "多元函数微分学及其应用 · 第 8 题"
            },
            {
              "source": "zhangyu1000",
              "questionId": "zy-hard-hs-13-27",
              "purpose": "参数使二次型退化时，也不能把二阶判别失效简单等同于“没有极值”。",
              "label": "多元函数微分学 · 第 27 题"
            }
          ],
          "selfCheck": {
            "question": "在某个驻点算得 Δ=0，这意味着什么？",
            "options": [
              "一定没有极值",
              "一定有极值",
              "当前判别法不能下结论"
            ],
            "correctIndex": 2,
            "explanation": "Δ=0 只说明二阶判别法失效。本题可沿 y=0 找到函数值变号，才得出原点不是极值点。"
          }
        }
      ]
    },
    {
      "id": "constraint",
      "title": "等式约束 · 最值",
      "cue": "在曲线、曲面上最大最小",
      "lessons": [
        {
          "id": "constraint",
          "label": "等式约束最值",
          "examId": "math1-2021-q19",
          "prompt": [
            {
              "type": "text",
              "text": "曲线 C 由两个曲面相交得到："
            },
            {
              "type": "math",
              "tex": "x^2+2y^2-z=6,\\qquad4x+2y+z=30"
            },
            {
              "type": "text",
              "text": "求 C 上的点到 xOy 坐标面的距离的最大值。"
            }
          ],
          "signals": [
            "点必须在曲线 C 上",
            "两条等式约束",
            "目标是距离，需要先写成函数"
          ],
          "recognition": "先明确目标与可行集，再选择消元或拉格朗日法；不能把变量当作彼此独立。",
          "steps": [
            {
              "title": "把“求什么”翻译成目标函数",
              "action": "点到 xOy 面的距离是 |z|，先处理绝对值。",
              "working": [
                {
                  "type": "text",
                  "text": "由 z=x²+2y²+6≥6，知 z>0，因此距离 d=|z|=z。最大化距离就等价于最大化 z。"
                }
              ]
            },
            {
              "title": "整理约束，选最省事的表示",
              "action": "本题可以消去 z，把空间曲线转成平面椭圆。",
              "working": [
                {
                  "type": "math",
                  "tex": "g(x,y)=x^2+2y^2+4x+2y-36=0"
                },
                {
                  "type": "math",
                  "tex": "z=30-4x-2y"
                },
                {
                  "type": "text",
                  "text": "约束可写成 (x+2)²+2(y+1/2)²=81/2，是有界闭椭圆；目标连续，最值存在。"
                }
              ]
            },
            {
              "title": "只沿约束找候选点",
              "action": "在椭圆上对目标用拉格朗日法，或参数化后求一元最值。",
              "working": [
                {
                  "type": "math",
                  "tex": "L=30-4x-2y+\\lambda g(x,y)"
                },
                {
                  "type": "math",
                  "tex": "-4+\\lambda(2x+4)=0,\\quad-2+\\lambda(4y+2)=0"
                },
                {
                  "type": "text",
                  "text": "连同 g=0 解得 (x,y)=(4,1)、(−8,−2)，对应 z=12、66。约束梯度在椭圆上不为零，没有约束奇异点漏出此方程组。"
                }
              ]
            },
            {
              "title": "比较目标值，回答原来的距离问题",
              "action": "候选点须满足原约束，最后把 z 还原成距离。",
              "working": [
                {
                  "type": "text",
                  "text": "最大距离为 66，在 (−8,−2,66) 处取得。"
                },
                {
                  "type": "text",
                  "text": "也可以不消元，直接对空间目标使用两个乘子，结论相同。"
                }
              ]
            }
          ],
          "checkpoint": "在曲线上求最值，不能直接令原目标对所有坐标的偏导都为零。乘子方程给出候选点，还需处理适用条件并完成最值判断。",
          "techniques": [
            {
              "title": "什么时候优先消元",
              "content": [
                {
                  "type": "text",
                  "text": "约束能简单表示一个变量，并且不会丢失分支时，先代入通常更短。消元后必须保留剩余约束与变量范围。"
                }
              ]
            },
            {
              "title": "拉格朗日法的使用条件",
              "content": [
                {
                  "type": "text",
                  "text": "单个约束 g=0 时，在可微且 ∇g≠0 的约束极值点满足 ∇f=λ∇g。多个约束要求梯度独立；不满足的点要单独考察。"
                }
              ]
            },
            {
              "title": "圆约束中的快速化简",
              "content": [
                {
                  "type": "text",
                  "text": "李林第 6 题在 x²+y²=1 上，f=1+2kxy。由 −1/2≤xy≤1/2（可取到）得到最大最小值 1+k、1−k，二者之和为 2。先看能否利用约束改写目标。"
                }
              ]
            }
          ],
          "references": [
            {
              "source": "exam",
              "questionId": "math1-2021-q19",
              "purpose": "把距离目标、空间曲线与消元法串起来，最后确认最大值。"
            },
            {
              "source": "lilin880",
              "questionId": "ll-hard-5-big-6",
              "purpose": "在 x²+y²=1 上求 x²+2kxy+y²（k&gt;0）的最大最小值之和。补“先用约束化简目标”。",
              "label": "多元函数微分学及其应用 · 第 6 题"
            },
            {
              "source": "zhangyu1000",
              "questionId": "zy-hard-hs-13-35",
              "purpose": "x²+y²+z²=1 还附带 z≥0。补“约束曲面带边界时，边界也要单独检查”。",
              "label": "多元函数微分学 · 第 35 题"
            }
          ],
          "selfCheck": {
            "question": "约束里有 x²+y²=1，求目标 f 的最值时可以直接解 fₓ=fᵧ=0 吗？",
            "options": [
              "可以，所有最值都必须这样求",
              "不可以，要沿圆周寻找候选"
            ],
            "correctIndex": 1,
            "explanation": "约束最值只比较可行方向；目标在圆周取得最值时，平面梯度通常不为零。"
          }
        }
      ]
    },
    {
      "id": "region",
      "title": "区域 · 最大最小",
      "cue": "在 D 上的最大值与最小值",
      "lessons": [
        {
          "id": "region",
          "label": "区域最值",
          "examId": "math1-2024-q18",
          "prompt": [
            {
              "type": "text",
              "text": "已知"
            },
            {
              "type": "math",
              "tex": "f(x,y)=x^3+y^3-(x+y)^2+3"
            },
            {
              "type": "text",
              "text": "先由曲面在 (1,1,1) 处的切平面与坐标平面围出区域，再求 f 在其投影 D 上的最大值与最小值。"
            }
          ],
          "signals": [
            "求 D 上的最大值与最小值",
            "D 有内部，也有边界",
            "区域由上一问得到"
          ],
          "recognition": "目标是全局最值。内部驻点、每段边界和顶点都要进入候选集合。",
          "steps": [
            {
              "title": "先把区域写清楚",
              "action": "由几何描述得到可行范围，并判断最值是否存在。",
              "working": [
                {
                  "type": "text",
                  "text": "切平面为 x+y+z=3，投影区域是"
                },
                {
                  "type": "math",
                  "tex": "D=\\{(x,y):x\\ge0,\\ y\\ge0,\\ x+y\\le3\\}"
                },
                {
                  "type": "text",
                  "text": "f 在有界闭区域 D 上连续，因此最大值、最小值都存在。"
                }
              ]
            },
            {
              "title": "找区域内部的候选点",
              "action": "解 fₓ=fᵧ=0，只保留严格位于内部的解。",
              "working": [
                {
                  "type": "math",
                  "tex": "f_x=3x^2-2(x+y),\\quad f_y=3y^2-2(x+y)"
                },
                {
                  "type": "text",
                  "text": "内部只有 (4/3,4/3)。解方程时出现的 (0,0) 在边界上，留到顶点一并检查。"
                }
              ]
            },
            {
              "title": "把每一段边界转为一元问题",
              "action": "分别处理 x=0、y=0、x+y=3，并补齐三个顶点。",
              "working": [
                {
                  "type": "text",
                  "text": "在 y=0 上令 h(x)=f(x,0)=x³−x²+3，0≤x≤3；得到边内候选 x=2/3。x=0 上同理。"
                },
                {
                  "type": "text",
                  "text": "在 x+y=3 上代入 y=3−x，得到 h(x)=9x²−27x+21，0≤x≤3；边内候选 x=3/2。"
                },
                {
                  "type": "text",
                  "text": "补上顶点 (0,0)、(3,0)、(0,3)。"
                }
              ]
            },
            {
              "title": "把所有候选点放在一起比较",
              "action": "比较函数值，给出最值及其取得位置。",
              "working": [
                {
                  "type": "table",
                  "headers": [
                    "位置",
                    "候选点",
                    "函数值"
                  ],
                  "rows": [
                    [
                      "内部",
                      "(4/3,4/3)",
                      "17/27"
                    ],
                    [
                      "坐标轴边",
                      "(2/3,0)、(0,2/3)",
                      "77/27"
                    ],
                    [
                      "斜边",
                      "(3/2,3/2)",
                      "3/4"
                    ],
                    [
                      "顶点",
                      "(0,0)",
                      "3"
                    ],
                    [
                      "顶点",
                      "(3,0)、(0,3)",
                      "21"
                    ]
                  ]
                },
                {
                  "type": "text",
                  "text": "最小值 17/27，在 (4/3,4/3) 取得；最大值 21，在 (3,0)、(0,3) 取得。"
                }
              ]
            }
          ],
          "checkpoint": "收尾检查：内部、每段边界、顶点，有没有漏掉一类？找齐候选并比较时，不必先逐个做局部极值判别。",
          "techniques": [
            {
              "title": "直线边界怎样降维",
              "content": [
                {
                  "type": "text",
                  "text": "把 y=c−x 代入 f，得到 h(x)=f(x,c−x)。同时写出 x 的范围；一元导数为 h′=fₓ−fᵧ，不能直接令 fₓ=fᵧ=0。"
                }
              ]
            },
            {
              "title": "曲线边界怎样处理",
              "content": [
                {
                  "type": "text",
                  "text": "能直接消元就消元；圆、椭圆可参数化；也可以在边界上用拉格朗日法。若只是一段弧，端点仍需单独检查。"
                }
              ]
            },
            {
              "title": "“存在最值”怎么说明",
              "content": [
                {
                  "type": "text",
                  "text": "连续函数在非空有界闭区域上一定能取得最大、最小值。开区域或无界区域要另作判断。"
                }
              ]
            }
          ],
          "references": [
            {
              "source": "exam",
              "questionId": "math1-2024-q18",
              "purpose": "从几何描述确定 D，再完整比较内部、三条边与顶点。"
            },
            {
              "source": "lilin880",
              "questionId": "ll-hard-5-big-9",
              "purpose": "先由两个方向导数还原 f，再求三角区域 0≤x≤7、0≤y≤7−x 上的最大值。补“先求函数，再求区域最值”。",
              "label": "多元函数微分学及其应用 · 第 9 题"
            },
            {
              "source": "zhangyu1000",
              "questionId": "zy-hard-hs-13-35",
              "purpose": "球面 x²+y²+z²=1 且 z≥0，目标 u=xz+ay³。补“曲面内部与边界圆 z=0 都要检查”，并加入参数变化。",
              "label": "多元函数微分学 · 第 35 题"
            }
          ],
          "selfCheck": {
            "question": "内部找到一个极小值点，能否就结束“区域最大最小值”的题？",
            "options": [
              "可以，极小值就是最小值",
              "不可以，还要处理边界与顶点"
            ],
            "correctIndex": 1,
            "explanation": "还要检查全部边界与顶点，比较后才能确认全局最值；本题最大值正好在顶点。"
          }
        }
      ]
    }
  ]
};
