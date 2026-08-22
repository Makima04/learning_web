// 全局错误兜底 —— 渲染崩溃时给中文提示 + 刷新入口，避免白屏。
// 每天都要打开的工具，白屏等于断一天。
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">页面出了点问题</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            渲染时发生错误。学习进度在本地与服务端都有保存，刷新通常即可恢复。
          </p>
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground">错误详情</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs text-muted-foreground">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ""}
            </pre>
          </details>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-95"
            >
              刷新页面
            </button>
            <button
              type="button"
              onClick={this.reset}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }
}
