import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { StudyPage } from "@/pages/StudyPage";
import { PapersPage } from "@/pages/PapersPage";
import { PapersRecitePage } from "@/pages/PapersRecitePage";
import { ReaderPage } from "@/pages/ReaderPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TransMgrPage } from "@/pages/TransMgrPage";
import { JournalPage } from "@/pages/JournalPage";
import { useAccountSync } from "@/hooks/useAccountSync";

export default function App() {
  useAccountSync();

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="study" element={<StudyPage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="papers" element={<PapersPage />} />
        <Route path="papers-recite" element={<PapersRecitePage />} />
        <Route path="reader" element={<ReaderPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="transmgr" element={<TransMgrPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
