-- 旧卡片的到期日期保持不变，具体时刻对齐北京时间 0 点。
-- 不修改学习次数、熟练度或客户端版本；分钟级学习步骤保持原时长。
UPDATE cards
SET due = due - ((due % 86400000 + 28800000) % 86400000)
WHERE due > 0
  AND (state = 'review' OR (state = 'learn' AND quiz >= 2))
  AND (due % 86400000 + 28800000) % 86400000 <> 0;
