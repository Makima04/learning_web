import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { StudyPage } from "@/pages/StudyPage";
import { useAccountSync } from "@/hooks/useAccountSync";
import { useReminder } from "@/hooks/useReminder";

/** 重页面：首屏不进主包，进入路由再拉 */
const PapersPage = lazy(() =>
  import("@/pages/PapersPage").then((m) => ({ default: m.PapersPage }))
);
const PapersRecitePage = lazy(() =>
  import("@/pages/PapersRecitePage").then((m) => ({ default: m.PapersRecitePage }))
);
const ReaderPage = lazy(() =>
  import("@/pages/ReaderPage").then((m) => ({ default: m.ReaderPage }))
);
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const TransMgrPage = lazy(() =>
  import("@/pages/TransMgrPage").then((m) => ({ default: m.TransMgrPage }))
);
const JournalPage = lazy(() =>
  import("@/pages/JournalPage").then((m) => ({ default: m.JournalPage }))
);
const JournalChapterPage = lazy(() =>
  import("@/pages/JournalChapterPage").then((m) => ({ default: m.JournalChapterPage }))
);
const TodayPage = lazy(() =>
  import("@/pages/TodayPage").then((m) => ({ default: m.TodayPage }))
);
const WordListsPage = lazy(() =>
  import("@/pages/WordListsPage").then((m) => ({ default: m.WordListsPage }))
);
const KgMapPage = lazy(() =>
  import("@/pages/KgMapPage").then((m) => ({ default: m.KgMapPage }))
);
const KgModulePage = lazy(() =>
  import("@/pages/KgModulePage").then((m) => ({ default: m.KgModulePage }))
);
const KgKpPage = lazy(() =>
  import("@/pages/KgKpPage").then((m) => ({ default: m.KgKpPage }))
);
const KgBookDrillPage = lazy(() =>
  import("@/pages/KgBookDrillPage").then((m) => ({ default: m.KgBookDrillPage }))
);
const KgPredictPage = lazy(() =>
  import("@/pages/KgPredictPage").then((m) => ({ default: m.KgPredictPage }))
);
const KgExamsPage = lazy(() =>
  import("@/pages/KgExamsPage").then((m) => ({ default: m.KgExamsPage }))
);
const OsMemExamSetPage = lazy(() =>
  import("@/pages/OsMemExamSetPage").then((m) => ({ default: m.OsMemExamSetPage }))
);
const ExamSetPage = lazy(() =>
  import("@/pages/ExamSetPage").then((m) => ({ default: m.ExamSetPage }))
);
const WdSetPage = lazy(() =>
  import("@/pages/WdSetPage").then((m) => ({ default: m.WdSetPage }))
);
const KgIndexRedirect = lazy(() =>
  import("@/pages/kgRedirects").then((m) => ({ default: m.KgIndexRedirect }))
);
const KgLegacyKpRedirect = lazy(() =>
  import("@/pages/kgRedirects").then((m) => ({ default: m.KgLegacyKpRedirect }))
);
const KgLegacyModuleRedirect = lazy(() =>
  import("@/pages/kgRedirects").then((m) => ({ default: m.KgLegacyModuleRedirect }))
);
const VizHomePage = lazy(() =>
  import("@/pages/VizHomePage").then((m) => ({ default: m.VizHomePage }))
);
const VizKpPage = lazy(() =>
  import("@/pages/VizKpPage").then((m) => ({ default: m.VizKpPage }))
);
const PoliticsPage = lazy(() =>
  import("@/pages/PoliticsPage").then((m) => ({ default: m.PoliticsPage }))
);
const PoliticsXiaoPage = lazy(() =>
  import("@/pages/PoliticsXiaoPage").then((m) => ({ default: m.PoliticsXiaoPage }))
);

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
      加载中…
    </div>
  );
}

export default function App() {
  useAccountSync();
  useReminder();

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="study" element={<StudyPage />} />
          <Route path="today" element={<TodayPage />} />
          <Route path="lists" element={<WordListsPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="journal/chapter/:moduleId" element={<JournalChapterPage />} />
          <Route path="journal/:tab" element={<JournalPage />} />
          <Route path="kg" element={<KgIndexRedirect />} />
          <Route path="kg/predict" element={<KgPredictPage />} />
          <Route path="kg/exams" element={<KgExamsPage />} />
          <Route path="kg/wd" element={<WdSetPage />} />
          <Route path="kg/wd/:group" element={<WdSetPage />} />
          <Route path="kg/exams/set" element={<ExamSetPage />} />
          <Route path="kg/exams/set/:group" element={<ExamSetPage />} />
          <Route path="kg/exams/os-mem" element={<OsMemExamSetPage />} />
          <Route path="kg/exams/os-mem/:group" element={<OsMemExamSetPage />} />
          <Route path="kg/exams/:year" element={<KgExamsPage />} />
          <Route path="kg/module/:bookId/:moduleId" element={<KgLegacyModuleRedirect />} />
          <Route path="kg/kp/:kpId" element={<KgLegacyKpRedirect />} />
          <Route path="kg/:subject" element={<KgMapPage />} />
          <Route path="kg/:subject/module/:bookId/:moduleId" element={<KgModulePage />} />
          <Route
            path="kg/:subject/module/:bookId/:moduleId/book"
            element={<KgBookDrillPage />}
          />
          <Route path="kg/:subject/kp/:kpId" element={<KgKpPage />} />
          <Route path="viz" element={<VizHomePage />} />
          <Route path="viz/:kpId" element={<VizKpPage />} />
          <Route path="politics" element={<PoliticsPage />} />
          <Route path="politics/xiao" element={<PoliticsXiaoPage />} />
          <Route path="politics/xiao/:subject" element={<PoliticsXiaoPage />} />
          <Route path="politics/xiao/:subject/:kpId" element={<PoliticsXiaoPage />} />
          <Route path="politics/q/:qid" element={<PoliticsPage />} />
          <Route path="politics/:tab" element={<PoliticsPage />} />
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
    </Suspense>
  );
}
