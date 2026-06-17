import { AppShell } from "@/components/app/app-shell";
import { NotificationRefresh } from "@/components/app/notification-refresh";
import { requireMemberContext } from "@/lib/data/member";
import { getCreditBalance, getUnreadNotifications } from "@/lib/data/portal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localizeNotification } from "@/lib/i18n/dynamic";

export const dynamic = "force-dynamic";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale, member, profile } = await requireMemberContext();
  const dictionary = getDictionary(locale);
  const [creditBalance, notifications] = await Promise.all([
    getCreditBalance(member.id),
    getUnreadNotifications(member.id),
  ]);

  return (
    <AppShell
      creditBalance={creditBalance}
      dictionary={dictionary}
      locale={locale}
      member={member}
      notifications={notifications.map((notification) => localizeNotification(notification, locale))}
      profile={profile}
    >
      <NotificationRefresh memberId={member.id} />
      {children}
    </AppShell>
  );
}
