import type { CollectionItem } from "./api";

export interface CompLink {
  id: string;
  label: string;
  url: string;
}

export function buildCompLinks(item: Pick<CollectionItem, "year" | "mint_mark" | "title" | "grading_service" | "grade">): CompLink[] {
  const parts = [
    item.year,
    item.mint_mark,
    item.title,
    item.grading_service !== "NONE" ? item.grading_service : "",
    item.grade,
  ]
    .map((p) => (p || "").trim())
    .filter(Boolean);

  // Deduplicate adjacent or contained tokens lightly while keeping query crisp
  const query = parts.join(" ");
  const encoded = encodeURIComponent(query);

  return [
    {
      id: "ebay-sold",
      label: "eBay Sold",
      url: `https://www.ebay.com/sch/i.html?_nkw=${encoded}&LH_Sold=1&LH_Complete=1`,
    },
    {
      id: "heritage",
      label: "Heritage Auctions",
      url: `https://coins.ha.com/c/search/results.zx?term=${encoded}`,
    },
    {
      id: "greatcollections",
      label: "GreatCollections",
      url: `https://www.greatcollections.com/search.php?q=${encoded}`,
    },
    {
      id: "stacks-bowers",
      label: "Stack's Bowers",
      url: `https://archive.stacksbowers.com/?q=${encoded}`,
    },
  ];
}
