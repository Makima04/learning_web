// 每日提醒轮询 —— 挂载在 App 顶层，设置里 reminderEnabled 打开才生效。
import { useEffect } from "react";
import { startReminderLoop } from "@/lib/reminder";
import { useSettings } from "@/stores/settings";

export function useReminder() {
  useEffect(() => {
    const stop = startReminderLoop({
      getEnabled: () => useSettings.getState().reminderEnabled,
      getTime: () => useSettings.getState().reminderTime,
    });
    return stop;
  }, []);
}
