export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Mail, Users, TrendingUp, Inbox } from "lucide-react";
import DashboardClient from "@/components/dashboard/DashboardClient";
import LocalTime from "@/components/dashboard/LocalTime";
import { Bot, User } from "lucide-react";

const placementColors: Record<string,string> = {
  PRIMARY:"text-green-400 bg-green-400/10",
  PROMOTIONS:"text-amber-400 bg-amber-400/10",
  SPAM:"text-red-400 bg-red-400/10",
  UPDATES:"text-blue-400 bg-blue-400/10",
  UNKNOWN:"text-gray-400 bg-gray-400/10",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;

  // Date navigation
  const selectedDate = sp.date ? new Date(sp.date + "T00:00:00") : new Date();
  const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const isToday = dayStart.toDateString() === new Date().toDateString();
  const prevDay = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);
  const nextDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const staleThreshold = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

  // Stats bar always shows current numbers regardless of selected date
  const now2 = new Date();
  const todayStart = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const [
    totalEmails, todayEmails, weekEmails, totalPublishers,
    dayEmails, recentEmails, placementBreakdown, topTopics,
    stalePublishers, staleLists, recentLearnings,
  ] = await Promise.all([
    prisma.email.count(),
    prisma.email.count({ where: { receivedAt: { gte: todayStart, lt: todayEnd } } }),
    prisma.email.count({ where: { receivedAt: { gte: week } } }),
    prisma.publisher.count(),
    prisma.email.count({ where: { receivedAt: { gte: dayStart, lt: dayEnd } } }),
    prisma.email.findMany({
      where: { receivedAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { receivedAt: "desc" },
      take: 20,
      include: { publisher: { select: { id: true, name: true } }, list: { select: { id: true, name: true } }, topics: { include: { topic: { select: { name: true } } } } },
    }),
    prisma.email.groupBy({
      by: ["inboxPlacement"], _count: true,
      where: { receivedAt: { gte: dayStart, lt: dayEnd } },
    }),
    prisma.emailTopic.groupBy({
      by: ["topicId"], _count: true,
      where: { email: { receivedAt: { gte: dayStart, lt: dayEnd } } },
      orderBy: { _count: { topicId: "desc" } },
      take: 8,
    }),
    // Stale publishers: have emails but none in last 6 days
    prisma.publisher.findMany({
      where: {
        emails: {
          some: { receivedAt: { lt: staleThreshold } },
          none: { receivedAt: { gte: staleThreshold } },
        },
      },
      select: { id: true, name: true },
    }),
    // Stale lists: have emails but none in last 6 days
    prisma.list.findMany({
      where: {
        isIgnored: false,
        emails: {
          some: { receivedAt: { lt: staleThreshold } },
          none: { receivedAt: { gte: staleThreshold } },
        },
      },
      select: { id: true, name: true },
    }),
    // Recent learnings for dashboard widget
    prisma.learning.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, content: true, source: true, category: true, createdAt: true },
    }),
  ]);

  // Get last email date for stale items
  const stalePublisherDetails = await Promise.all(
    stalePublishers.map(async (p) => {
      const last = await prisma.email.findFirst({ where: { publisherId: p.id }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } });
      return { ...p, lastEmail: last?.receivedAt ?? null };
    })
  );
  const staleListDetails = await Promise.all(
    staleLists.map(async (l) => {
      const last = await prisma.email.findFirst({ where: { listId: l.id }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } });
      return { ...l, lastEmail: last?.receivedAt ?? null };
    })
  );

  const topicIds = topTopics.map(t => t.topicId);
  const topicDetails = await prisma.topic.findMany({ where: { id: { in: topicIds } } });
  const topTopicsNamed = topTopics.map(t => ({
    count: t._count,
    name: topicDetails.find(td => td.id === t.topicId)?.name ?? "unknown",
  }));

  // Stats bar always reflects current state, independent of date navigator
  const stats = [
    { label: "All-Time Emails Received", value: totalEmails.toLocaleString(), icon: Mail },
    { label: "Received Today", value: todayEmails, icon: Inbox },
    { label: "This Week", value: weekEmails, icon: TrendingUp },
    { label: "Publishers Tracked", value: totalPublishers, icon: Users },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Daily Briefing</h1>
      </div>

      {/* Stale alerts — always current, independent of date */}
      {isToday && (stalePublisherDetails.length > 0 || staleListDetails.length > 0) && (
        <DashboardClient
          stalePublishers={stalePublisherDetails}
          staleLists={staleListDetails}
          showStale
        />
      )}

      {/* Stat cards — always current, not affected by date navigator */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-2"><Icon className="w-3.5 h-3.5" />{label}</div>
            <div className="text-2xl font-bold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* Date navigator — below stats bar */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-300 text-sm font-medium">
            {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            {isToday && <span className="ml-2 text-xs text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">Today</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/?date=${prevDay.toISOString().split("T")[0]}`} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors">← Prev</Link>
          <DashboardClient currentDate={dayStart.toISOString().split("T")[0]} />
          {!isToday && (
            <Link href={nextDay <= new Date() ? `/?date=${nextDay.toISOString().split("T")[0]}` : "/"} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors">Next →</Link>
          )}
          {!isToday && <Link href="/" className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-medium rounded transition-colors">Today</Link>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Email list */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-lg">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold text-white text-sm">
              {isToday ? "Today's Emails" : `Emails on ${selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            </h2>
            <Link href={`/emails?sort=receivedAt&order=desc`} className="text-xs text-amber-400 hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-gray-800">
            {recentEmails.length === 0 ? (
              <p className="p-4 text-gray-500 text-sm">No emails received {isToday ? "today" : "on this date"} yet.</p>
            ) : recentEmails.map(email => (
              <Link key={email.id} href={`/emails/${email.id}`} className="flex items-start gap-3 p-3 hover:bg-gray-800/50 transition-colors">
                <span className={`mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${placementColors[email.inboxPlacement] ?? placementColors.UNKNOWN}`}>
                  {email.inboxPlacement === "PRIMARY" ? "✓" : email.inboxPlacement === "SPAM" ? "✗" : "~"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{email.subject}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {email.publisher?.name ?? email.list?.name ?? "Unknown"} · <LocalTime date={email.receivedAt} />
                  </p>
                </div>
                <div className="flex gap-1 flex-wrap justify-end max-w-32">
                  {email.topics.slice(0, 2).map(({ topic }) => (
                    <span key={topic.name} className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{topic.name}</span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Side panels */}
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h2 className="font-semibold text-white text-sm mb-3">Inbox Placement</h2>
            <div className="space-y-2">
              {placementBreakdown.map(p => (
                <div key={p.inboxPlacement} className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${placementColors[p.inboxPlacement] ?? placementColors.UNKNOWN}`}>{p.inboxPlacement}</span>
                  <span className="text-sm font-semibold text-white">{p._count}</span>
                </div>
              ))}
              {placementBreakdown.length === 0 && <p className="text-xs text-gray-500">No data</p>}
            </div>
          </div>
          {/* AI Intelligence widget — always shown */}
          <div className="bg-gray-900 border border-amber-500/20 rounded-lg p-4">
            <h2 className="font-semibold text-white text-sm mb-3 flex items-center gap-1.5">
              <span className="text-amber-400">✦</span> New Things Learned
            </h2>
            {recentLearnings.length > 0 ? (
              <>
                <div className="space-y-2">
                  {recentLearnings.map(l => (
                    <div key={l.id} className="flex items-start gap-1.5">
                      {l.source === "AI_EMAIL"
                        ? <Bot className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5" />
                        : <User className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />}
                      <p className="text-xs text-gray-300 leading-snug">{l.content}</p>
                    </div>
                  ))}
                </div>
                <Link href="/intelligence" className="text-xs text-amber-400 hover:underline mt-3 block">View all →</Link>
              </>
            ) : (
              <p className="text-xs text-gray-600">No insights yet — go to <Link href="/intelligence" className="text-amber-400 hover:underline">Intelligence</Link> and run <Link href="/settings" className="text-amber-400 hover:underline">Extract</Link> in Settings.</p>
            )}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h2 className="font-semibold text-white text-sm mb-3">Hot Topics</h2>
            <div className="space-y-2">
              {topTopicsNamed.map(({ name, count }) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-xs text-gray-300 capitalize">{name}</span>
                  <span className="text-xs font-semibold text-amber-400">{count}</span>
                </div>
              ))}
              {topTopicsNamed.length === 0 && <p className="text-xs text-gray-500">No topics</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
