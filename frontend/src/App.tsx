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
import { JournalChapterPage } from "@/pages/JournalChapterPage";
import { TodayPage } from "@/pages/TodayPage";
import { KgMapPage } from "@/pages/KgMapPage";
import { KgModulePage } from "@/pages/KgModulePage";
import { KgPredictPage } from "@/pages/KgPredictPage";
import { KgExamsPage } from "@/pages/KgExamsPage";
import { useAccountSync } from "@/hooks/useAccountSync";

export default function App() {
  useAccountSync();

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="study" element={<StudyPage />} />
        <Route path="today" element={<TodayPage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="journal/chapter/:moduleId" element={<JournalChapterPage />} />
        <Route path="journal/:tab" element={<JournalPage />} />
        <Route path="kg" element={<KgMapPage />} />
        <Route path="kg/module/:bookId/:moduleId" element={<KgModulePage />} />
        <Route path="kg/predict" element={<KgPredictPage />} />
        <Route path="kg/exams" element={<KgExamsPage />} />
        <Route path="kg/exams/:year" element={<KgExamsPage />} />
        <Route path="papers" element={<PapersPage />} />
        <Route path="papers/:variant" element={<PapersPage />} />
        <Route path="papers/:variant/:year" element={<PapersPage />} />
        <Route path="papers-recite" element={<PapersRecitePage />} />
        <Route path="papers-recite/:variant" element={<PapersRecitePage />} />
        <Route path="papers-recite/:variant/:year" element={<PapersRecitePage />} />
        {/* 深链：/reader/en1/2006/Text%202 — 刷新可从 PAPERS 还原 */}
        <Route path="reader/:variant/:year/:label" element={<ReaderPage />} />
        <Route path="reader" element={<Navigate to="/papers/en1" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/:tab" element={<SettingsPage />} />
        <Route path="transmgr" element={<TransMgrPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
