import { useState } from "react";
import { HelpCircle, ChevronDown } from "lucide-react";

export interface FaqItem {
  question: string;
  answer: string;
  tag: string;
}

export const SPECIFICATIONS_FAQS: FaqItem[] = [
  {
    tag: "Numismatics",
    question: "What is the practical difference between PCGS, NGC, and CACG Sheldon grades?",
    answer:
      "All three use the 70-point Sheldon scale, but PCGS and CACG tend to apply stricter surface preservation rubrics to vintage US coins, while NGC is widely celebrated for ancient, world, and modern commemoratives. CACG was launched specifically to enforce strict eye-appeal standards right out of the holder.",
  },
  {
    tag: "Stickering",
    question: "What does CAC verification (Green Bean vs Gold Bean) mean for coin values?",
    answer:
      "A Green Bean sticker signifies that Certified Acceptance Corp evaluated a PCGS or NGC slab and determined the coin is in the upper tier (solid or premium) for that assigned numerical grade. A Gold Bean indicates the coin undergraded by at least one full grade point, often commanding significant market premiums.",
  },
  {
    tag: "Currency",
    question: "Are Goldbacks legal tender, and how is their aurum content verified?",
    answer:
      "Goldbacks are voluntary local complementary currency notes containing lab-verified 24-karat physical gold vacuum-deposited between tough polymer film sheets. While not federal legal tender, they are legally recognized as sound voluntary trade currency in participating states (e.g. Utah, Nevada, Wyoming, New Hampshire, South Dakota).",
  },
  {
    tag: "Bullion Math",
    question: "Why does precious metal valuation use Troy Ounces instead of Avoirdupois Ounces?",
    answer:
      "The global bullion and numismatic markets operate strictly on the Troy system (NIST standard: 1 oz t = 31.1034768 grams). Standard household avoirdupois ounces are lighter (1 oz = 28.349523125 grams). Weighing silver or gold on a standard postal scale without converting will understate your precious metal mass by approximately 9.7%.",
  },
  {
    tag: "Valuation",
    question: "How does Stacker Stash calculate the spot melt floor for alloyed coins like 90% silver?",
    answer:
      "Stacker Stash multiplies gross coin weight by its exact legal fineness (e.g. 0.900 for pre-1965 US dimes, quarters, and half dollars) to determine fine pure silver mass, then multiplies by the real-time live COMEX spot price. Collector and numismatic premiums are modeled as an additive layer above this immutable physical floor.",
  },
  {
    tag: "Trading Cards",
    question: "What front and back centering ratios qualify a card for a PSA 10 Gem Mint?",
    answer:
      "According to PSA official specifications, a card must exhibit centering between 55/45 and 60/40 on the front, and no worse than 75/25 on the reverse, with four sharp unfrayed corners, original surface gloss, and absence of staining or print defects.",
  },
];

export function SpecificationsFaqCard() {
  const [openIndices, setOpenIndices] = useState<number[]>([0]);

  const toggleIndex = (idx: number) => {
    setOpenIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-5">
      <div className="flex items-center gap-3 border-b border-slate-800/80 pb-4">
        <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
          <HelpCircle className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-100">
            Specifications &amp; Standards Knowledge Base
          </h3>
          <p className="text-xs text-slate-400">
            Authoritative answers on grading scales, stickering rubrics, legal standards, and mass conversions.
          </p>
        </div>
      </div>

      <div className="divide-y divide-slate-800/70">
        {SPECIFICATIONS_FAQS.map((faq, idx) => {
          const isOpen = openIndices.includes(idx);
          return (
            <div key={faq.question} className="py-3.5">
              <button
                type="button"
                onClick={() => toggleIndex(idx)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between text-left gap-4 group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/80">
                    {faq.tag}
                  </span>
                  <span className="text-sm font-semibold text-slate-200 group-hover:text-amber-300 transition">
                    {faq.question}
                  </span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                    isOpen ? "rotate-180 text-amber-400" : ""
                  }`}
                />
              </button>
              {isOpen && (
                <p className="mt-2 text-xs text-slate-400 leading-relaxed pl-1 sm:pl-3">
                  {faq.answer}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
