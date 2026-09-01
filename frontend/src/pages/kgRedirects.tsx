import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { findKp, getBook } from "@/data/kg";
import { kgKpPath, kgMapPath, kgModulePath } from "@/lib/kg/paths";
import type { BookId } from "@/lib/kg/types";
import { useSettings } from "@/stores/settings";

/** /kg → 按设置落到 408 或数学图谱 */
export function KgIndexRedirect() {
  const enableCs408 = useSettings((s) => s.enableCs408);
  const enableMath = useSettings((s) => s.enableMath);
  const subject = enableCs408 ? "cs408" : enableMath ? "math" : "cs408";
  return <Navigate to={kgMapPath(subject)} replace />;
}

/** 旧 /kg/module/:book/:mod → 带科目前缀 */
export function KgLegacyModuleRedirect() {
  const { bookId = "", moduleId = "" } = useParams();
  const book = getBook(bookId as BookId);
  if (!book || !moduleId) return <Navigate to="/kg" replace />;
  return <Navigate to={kgModulePath(book.id, moduleId, book.subject)} replace />;
}

/** 旧 /kg/kp/:kpId → 带科目前缀 */
export function KgLegacyKpRedirect() {
  const { kpId = "" } = useParams();
  const [params] = useSearchParams();
  const found = findKp(kpId);
  if (!found) return <Navigate to="/kg" replace />;
  return (
    <Navigate
      to={kgKpPath(found.kp.id, {
        subject: found.book.subject,
        src: params.get("src"),
      })}
      replace
    />
  );
}


