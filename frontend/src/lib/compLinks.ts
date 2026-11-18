import type { CollectionItem } from "./api";
import { isCardItem } from "./format";

export interface CompLink {
  id: string;
  label: string;
  url: string;
}

export function buildCompLinks(
  item: Pick<
    CollectionItem,
    | "year"
    | "mint_mark"
    | "title"
    | "grading_service"
    | "grade"
    | "category"
    | "sort_category"
    | "is_card_item"
    | "card_game"
    | "set_name"
    | "card_number"
    | "attributes"
  >,
): CompLink[] {
  if (isCardItem(item)) {
    const attrs = (item.attributes || {}) as Record<string, unknown>;
    const setName = String(item.set_name || attrs.set_name || "").trim();
    const cardNum = String(item.card_number || attrs.card_number || "").trim();
    const parts = [
      item.title,
      setName,
      cardNum,
      item.grading_service !== "NONE" ? item.grading_service : "",
      item.grade,
    ]
      .map((p) => (p || "").trim())
      .filter(Boolean);

    const query = parts.join(" ");
    const encoded = encodeURIComponent(query);

    return [
      {
        id: "ebay-sold",
        label: "eBay Sold",
        url: `https://www.ebay.com/sch/i.html?_nkw=${encoded}&LH_Sold=1&LH_Complete=1`,
      },
      {
        id: "tcgplayer",
        label: "TCGplayer",
        url: `https://www.tcgplayer.com/search/all/product?q=${encoded}&view=grid`,
      },
      {
        id: "pricecharting",
        label: "PriceCharting",
        url: `https://www.pricecharting.com/search-products?q=${encoded}&type=prices`,
      },
      {
        id: "130point",
        label: "130point",
        url: `https://130point.com/sales/?search=${encoded}`,
      },
      {
        id: "beckett",
        label: "Beckett",
        url: `https://www.beckett.com/search/?term=${encoded}`,
      },
      {
        id: "cardladder",
        label: "Card Ladder",
        url: `https://www.cardladder.com/sales-history?q=${encoded}`,
      },
      {
        id: "collectr",
        label: "Collectr",
        url: `https://app.getcollectr.com/?q=${encoded}`,
      },
    ];
  }

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
