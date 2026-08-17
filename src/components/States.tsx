import { AlertCircle, LoaderCircle } from "lucide-react";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return <div className="state-box" role="status"><LoaderCircle className="spin" /><p>{label}</p></div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="state-box state-box--error" role="alert">
      <AlertCircle />
      <div><strong>We could not complete that request.</strong><p>{message}</p></div>
      {retry && <button className="button button--outline" onClick={retry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="empty-state"><span aria-hidden="true">MP</span><h3>{title}</h3><p>{message}</p></div>;
}
