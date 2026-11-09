import { MATH_CALCULUS_REVIEWS } from "./mathCalculusReview";
import { MATH_LINEAR_REVIEWS } from "./mathLinearReview";
import { MATH_PROBABILITY_REVIEWS } from "./mathProbabilityReview";
import { MATH_EXTREMA_REVIEW } from "./mathExtremaReview";
import { math, text } from "./mathReviewBuilder";
import { MATH_REVIEW_ESSENTIALS } from "./mathReviewEssentials";
import { MATH_TEXTBOOK_KNOWLEDGE } from "./mathTextbookKnowledge";
import { reviewTextbook } from "./reviewTextbooks";
import type { KnowledgeReview } from "@/lib/kg/knowledgeReview";

export const MATH_KNOWLEDGE_REVIEWS: Readonly<Record<string, KnowledgeReview>> = Object.fromEntries(
  [...MATH_CALCULUS_REVIEWS, ...MATH_LINEAR_REVIEWS, ...MATH_PROBABILITY_REVIEWS, {
    ...MATH_EXTREMA_REVIEW,
    knowledge: [text("局部极值只比较附近点；全局最值比较整个定义范围。内部可微极值点必须是驻点，但驻点未必是极值点。"),
      math`\Delta=f_{xx}f_{yy}-f_{xy}^2`,
      text("在驻点附近二阶偏导连续时，Δ>0 且 fₓₓ>0 为严格局部极小，Δ>0 且 fₓₓ<0 为严格局部极大；Δ<0 为鞍点；Δ=0 需另作分析。约束最值与区域最值还须检查约束正则性、边界及特殊点。")],
  }]
    .map((review) => [review.kpId, {
      ...review,
      textbook: reviewTextbook(review.kpId),
      knowledge: [
        ...(MATH_TEXTBOOK_KNOWLEDGE[review.kpId] ?? review.knowledge ?? []),
        ...(MATH_REVIEW_ESSENTIALS[review.kpId] ?? []),
      ],
      routes: review.routes.map(route => ({
        ...route,
        lessons: route.lessons.map(lesson => ({ ...lesson, showWorkingByDefault: true })),
      })),
    }]),
);
