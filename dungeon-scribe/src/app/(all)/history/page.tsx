"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";

const mockStories = Array(6).fill({
  title: "Forest Adventure",
  date: "17th/Aug 2025",
  imageUrl: "/historypp.png",
  summaryLink: "/summary",
});

const mockCharacters = Array(4).fill({
  name: "Forest Adventure",
  detailLink: "/summary",
  imageUrl: "/historypp.png",
  date: "17th/Aug 2025",
});

const DROPDOWN_ITEMS = [
  "All History",
  "Characters",
  "Completed",
  "Sessions",
] as const;
type TabOption = (typeof DROPDOWN_ITEMS)[number];

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState<TabOption>("All History");

  return (
    <div className="w-full px-4 py-6 flex flex-col items-center">
      {/* Dropdown 控制按钮 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="text-3xl font-bold text-white flex items-center gap-2">
            {activeTab.toUpperCase()}
            <ChevronDown size={28} className="mt-1" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="text-center">
          {DROPDOWN_ITEMS.map((item) => (
            <DropdownMenuItem
              key={item}
              className={clsx(
                "cursor-pointer px-4 py-2 text-lg",
                item === activeTab && "font-bold text-blue-600"
              )}
              onSelect={() => setActiveTab(item)}
            >
              {item}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 内容展示区 */}
      <div className="mt-6 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center">
        {activeTab === "All History" &&
          mockStories.map((story, index) => (
            <CardDisplay
              key={index}
              title={story.title}
              date={story.date}
              linkLabel="Summary"
              linkHref={story.summaryLink}
              imageUrl={story.imageUrl}
            />
          ))}

        {activeTab === "Completed" &&
          mockCharacters.map((story, index) => (
            <CardDisplay
              key={index}
              title={story.name}
              date={story.date}
              linkLabel="Summary"
              linkHref={story.detailLink}
              imageUrl={story.imageUrl}
            />
          ))}

        {activeTab === "Characters" && (
          <EmptyState message="No completed stories yet." />
        )}

        {activeTab === "Sessions" && (
          <EmptyState message="No session history available." />
        )}
      </div>
    </div>
  );
}

function CardDisplay({
  title,
  date,
  linkLabel,
  linkHref,
  imageUrl,
}: {
  title: string;
  date: string;
  linkLabel: string;
  linkHref: string;
  imageUrl: string;
}) {
  return (
    <div className="w-[349px] bg-white rounded-xl shadow-md overflow-hidden border">
      {/*图片*/}
      <div className="relative w-full h-[150px]">
        <Image src={imageUrl} alt={title} fill className="object-cover" />
      </div>

      {/* 内容区域 */}
      <div className="px-4 pt-3 pb-3">
        {/* 标题和 Summary*/}
        <div className="flex justify-between items-center">
          <div className="text-xl font-semibold text-gray-900 leading-tight">
            {title}
          </div>
          <Link
            href={linkHref}
            className="text-xl text-gray-500 underline underline-offset-4 hover:text-blue-600"
          >
            {linkLabel}
          </Link>
        </div>

        {/* 日期 */}
        <div className="text-sm text-[#8B0000] mt-1">{date}</div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="col-span-full text-gray-500 text-lg text-center">
      {message}
    </div>
  );
}
