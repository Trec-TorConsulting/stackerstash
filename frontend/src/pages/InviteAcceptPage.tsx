import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Shield, Users, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BrandLogo } from "../components/BrandLogo";
import { useToast } from "../components/ToastProvider";
import { api, type AuthUser } from "../lib/api";

interface InviteAcceptPageProps {
  currentUser: AuthUser | null;
  onAccepted?: (workspaceId: string) => Promise<void> | void;
  onSwitchAccount?: () => void;
}

export function InviteAcceptPage({
  currentUser,
  onAccepted,
  onSwitchAccount,
}: InviteAcceptPageProps) {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const previewQuery = useQuery({
    queryKey: ["invitePreview", token],
    queryFn: () => api.previewInvite(token),
    enabled: Boolean(token),
    retry: false,
  });

  const acceptMut = useMutation({
    mutationFn: () => api.acceptInvite(token),
    onSuccess: async (ws) => {
      toast.success(`Joined shared vault "${ws.name}" as ${ws.role ?? "member"}.`);
      qc.invalidateQueries({ queryKey: ["pendingInvites"] });
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      await onAccepted?.(ws.id);
      navigate("/", { replace: true });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not accept invitation.");
    },
  });

  const declineMut = useMutation({
    mutationFn: () => api.declineInvite(token),
    onSuccess: () => {
      toast.info("Invitation declined.");
      qc.invalidateQueries({ queryKey: ["pendingInvites"] });
      navigate("/", { replace: true });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not decline invitation.");
    },
  });

  const invite = previewQuery.data;
  const inviteNextPath = encodeURIComponent(`/invite/${token}`);
  const emailQuery = invite ? `&email=${encodeURIComponent(invite.email)}` : "";
  const isEmailMatch =
    Boolean(currentUser && invite) &&
    currentUser!.email.toLowerCase() === invite!.email.toLowerCase();
  const isActionable = Boolean(
    invite && invite.status === "PENDING" && !invite.is_expired
  );

  const shell = (content: React.ReactNode) => {
    if (currentUser) {
      return <div className="max-w-lg mx-auto py-8">{content}</div>;
    }
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col">
        <header className="border-b border-slate-800/80 bg-slate-950/90 px-4 md:px-8 h-16 flex items-center justify-between">
          <Link to="/">
            <BrandLogo size="sm" />
          </Link>
          <Link to="/login" className="text-xs text-slate-400 hover:text-amber-400">
            Sign In
          </Link>
        </header>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-lg">{content}</div>
        </div>
      </div>
    );
  };

  if (previewQuery.isLoading) {
    return shell(
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center text-sm text-slate-400">
        Verifying vault invitation...
      </div>
    );
  }

  if (previewQuery.isError || !invite) {
    return shell(
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-8 text-center space-y-4">
        <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto" />
        <h1 className="text-lg font-bold text-slate-100">Invitation Not Found</h1>
        <p className="text-sm text-slate-400">
          {(previewQuery.error as Error | undefined)?.message ||
            "This vault invitation link is invalid or no longer available."}
        </p>
        <Link
          to={currentUser ? "/" : "/login"}
          className="inline-flex px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm hover:bg-amber-400"
        >
          {currentUser ? "Return to Vault" : "Go to Sign In"}
        </Link>
      </div>
    );
  }

  return shell(
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 md:p-8 shadow-2xl space-y-5">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-amber-300 font-semibold">
            Shared Vault Invitation
          </p>
          <h1 className="text-xl font-bold text-slate-100 mt-0.5">
            {invite.workspace_name}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Invited by <span className="text-slate-200">{invite.invited_by_email}</span>
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400">Recipient email</span>
          <span className="font-medium text-slate-100">{invite.email}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400">Granted role</span>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 text-xs font-semibold">
            <Shield className="h-3 w-3" />
            {invite.role === "EDITOR" ? "Editor (View & Catalog)" : "Viewer (Read-only)"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400">Status</span>
          <span className="text-xs font-medium text-slate-200">
            {invite.is_expired ? "EXPIRED" : invite.status}
          </span>
        </div>
      </div>

      {!isActionable ? (
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300">
          This invitation cannot be accepted because it is{" "}
          <span className="font-semibold text-amber-300">
            {invite.is_expired ? "expired" : invite.status.toLowerCase()}
          </span>
          . Ask the vault owner ({invite.owner_email}) to send a fresh invite.
        </div>
      ) : !currentUser ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Sign in or create an account using{" "}
            <span className="text-slate-200 font-medium">{invite.email}</span> to accept
            this shared vault invitation.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Link
              to={`/login?next=${inviteNextPath}${emailQuery}`}
              className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm text-center"
            >
              Sign In to Accept
            </Link>
            <Link
              to={`/register?next=${inviteNextPath}${emailQuery}`}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm text-center"
            >
              Create Account &amp; Accept
            </Link>
          </div>
        </div>
      ) : !isEmailMatch ? (
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
            You are currently signed in as{" "}
            <span className="font-semibold">{currentUser.email}</span>, but this
            invitation was sent to{" "}
            <span className="font-semibold">{invite.email}</span>.
          </div>
          {onSwitchAccount && (
            <button
              type="button"
              onClick={() => {
                onSwitchAccount();
                navigate(`/login?next=${inviteNextPath}${emailQuery}`, {
                  replace: true,
                });
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm"
            >
              Sign Out &amp; Switch Account
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={acceptMut.isPending || declineMut.isPending}
            onClick={() => acceptMut.mutate()}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {acceptMut.isPending ? "Joining..." : "Accept Invitation"}
          </button>
          <button
            type="button"
            disabled={acceptMut.isPending || declineMut.isPending}
            onClick={() => declineMut.mutate()}
            className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-sm disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Decline
          </button>
        </div>
      )}
    </div>
  );
}
