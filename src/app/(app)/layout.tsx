import { AppShell } from "@/components/app/app-shell";
import { NotificationRefresh } from "@/components/app/notification-refresh";
import { requireMemberContext } from "@/lib/data/member";
import { getCreditBalance, getUnreadNotifications } from "@/lib/data/portal";

export const dynamic = "force-dynamic";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { member, profile } = await requireMemberContext();
  const [creditBalance, notifications] = await Promise.all([
    getCreditBalance(member.id),
    getUnreadNotifications(member.id),
  ]);

  return (
    <AppShell
      creditBalance={creditBalance}
      member={member}
      notifications={notifications}
      profile={profile}
    >
      <NotificationRefresh memberId={member.id} />
      {children}
    </AppShell>
  );
}
