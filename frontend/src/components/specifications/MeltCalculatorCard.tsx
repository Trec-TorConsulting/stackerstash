import { useState, useId } from "react";
import { Flame, Calculator } from "lucide-react";

export interface MeltMetalOption {
  symbol: string;
  key: string;
  name: string;
  defaultSpotPerOz: number;
  purities: { label: string; factor: number }[];
}

export const MELT_METALS: MeltMetalOption[] = [
  {
    symbol: "XAU",
    key: "GOLD",
    name: "Gold",
    defaultSpotPerOz: 2650.0,
    purities: [
      { label: ".9999 / 24K (Pure)", factor: 0.9999 },
      { label: ".999 Fine (Bars & Rounds)", factor: 0.999 },
      { label: ".9167 / 22K (Eagle, Crown)", factor: 0.9167 },
      { label: ".900 Pre-1933 US Coin", factor: 0.9 },
      { label: ".750 / 18K Jewelry", factor: 0.75 },
      { label: ".585 / 14K Jewelry", factor: 0.585 },
      { label: ".417 / 10K Jewelry", factor: 0.417 },
    ],
  },
  {
    symbol: "XAG",
    key: "SILVER",
    name: "Silver",
    defaultSpotPerOz: 31.5,
    purities: [
      { label: ".999 Fine (Bars & Rounds)", factor: 0.999 },
      { label: ".925 Sterling Silver", factor: 0.925 },
      { label: ".900 Pre-1965 US 90% Junk", factor: 0.9 },
      { label: ".400 40% Silver (Kennedy 65-70)", factor: 0.4 },
      { label: ".350 War Nickel (1942-1945)", factor: 0.35 },
    ],
  },
  {
    symbol: "XPT",
    key: "PLATINUM",
    name: "Platinum",
    defaultSpotPerOz: 980.0,
    purities: [
      { label: ".9995 Fine Platinum", factor: 0.9995 },
      { label: ".950 Platinum Alloy", factor: 0.95 },
      { label: ".900 Platinum", factor: 0.9 },
    ],
  },
  {
    symbol: "XPD",
    key: "PALLADIUM",
    name: "Palladium",
    defaultSpotPerOz: 1050.0,
    purities: [
      { label: ".9995 Fine Palladium", factor: 0.9995 },
      { label: ".950 Palladium", factor: 0.95 },
    ],
  },
  {
    symbol: "XCU",
    key: "COPPER",
    name: "Copper",
    // 1 lb avoirdupois = 14.5833 oz t; $4.20/lb = ~$0.288/oz t
    defaultSpotPerOz: 0.288,
    purities: [
      { label: ".999 Fine Bullion Copper", factor: 0.999 },
      { label: ".950 Pre-1982 Lincoln Cent", factor: 0.95 },
    ],
  },
];

const GRAMS_PER_TROY_OZ = 31.1034768;

interface MeltCalculatorCardProps {
  initialMetal?: string;
  spotPrices?: Record<string, string>;
}

export function MeltCalculatorCard({ initialMetal = "GOLD", spotPrices }: MeltCalculatorCardProps) {
  const [selectedMetalKey, setSelectedMetalKey] = useState<string>(initialMetal);
  const [quantity, setQuantity] = useState<string>("1");
  const [unit, setUnit] = useState<"ozt" | "grams">("ozt");

  const metal = MELT_METALS.find((m) => m.key === selectedMetalKey || m.symbol === selectedMetalKey) ?? MELT_METALS[0];
  const [purityFactor, setPurityFactor] = useState<number>(metal.purities[0].factor);

  const metalSelectId = useId();
  const puritySelectId = useId();
  const quantityInputId = useId();
  const unitSelectId = useId();

  // Active spot price from props or defaults
  const resolvedSpotRate =
    spotPrices && spotPrices[metal.key] && !Number.isNaN(Number(spotPrices[metal.key]))
      ? Number(spotPrices[metal.key])
      : metal.defaultSpotPerOz;

  const numQuantity = Math.max(0, Number.parseFloat(quantity) || 0);

  // Convert to troy ounces
  const grossTroyOz = unit === "ozt" ? numQuantity : numQuantity / GRAMS_PER_TROY_OZ;
  const fineTroyOz = grossTroyOz * purityFactor;
  const fineGrams = fineTroyOz * GRAMS_PER_TROY_OZ;
  const totalMeltValue = fineTroyOz * resolvedSpotRate;

  const handleMetalChange = (newKey: string) => {
    setSelectedMetalKey(newKey);
    const newMetal = MELT_METALS.find((m) => m.key === newKey) ?? MELT_METALS[0];
    setPurityFactor(newMetal.purities[0].factor);
  };

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-slate-950 p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              Live Scrap Melt Floor Calculator
            </h3>
            <p className="text-xs text-slate-400">
              Compute exact precious metal scrap value based on physical purity and live spot markets.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono">
          <span className="text-slate-500">Benchmark Spot:</span>
          <span className="text-amber-300 font-semibold">
            ${resolvedSpotRate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/oz t
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metal Choice */}
        <div>
          <label htmlFor={metalSelectId} className="block text-xs font-medium text-slate-400 mb-1.5">
            Metal
          </label>
          <select
            id={metalSelectId}
            value={metal.key}
            onChange={(e) => handleMetalChange(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-amber-500/60"
          >
            {MELT_METALS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.name} ({m.symbol})
              </option>
            ))}
          </select>
        </div>

        {/* Purity Choice */}
        <div>
          <label htmlFor={puritySelectId} className="block text-xs font-medium text-slate-400 mb-1.5">
            Purity / Fineness
          </label>
          <select
            id={puritySelectId}
            value={purityFactor}
            onChange={(e) => setPurityFactor(Number.parseFloat(e.target.value))}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-amber-500/60"
          >
            {metal.purities.map((p) => (
              <option key={p.label} value={p.factor}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Quantity Input */}
        <div>
          <label htmlFor={quantityInputId} className="block text-xs font-medium text-slate-400 mb-1.5">
            Gross Mass / Weight
          </label>
          <input
            id={quantityInputId}
            type="number"
            step="any"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-slate-200 focus:outline-none focus:border-amber-500/60"
          />
        </div>

        {/* Unit Selector */}
        <div>
          <label htmlFor={unitSelectId} className="block text-xs font-medium text-slate-400 mb-1.5">
            Unit of Measure
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setUnit("ozt")}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold border transition ${
                unit === "ozt"
                  ? "bg-amber-500 text-slate-950 border-amber-400"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
              }`}
            >
              Troy Ounce (oz t)
            </button>
            <button
              type="button"
              onClick={() => setUnit("grams")}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold border transition ${
                unit === "grams"
                  ? "bg-amber-500 text-slate-950 border-amber-400"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
              }`}
            >
              Grams (g)
            </button>
          </div>
        </div>
      </div>

      {/* Output Panel */}
      <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Calculator className="h-3.5 w-3.5 text-amber-400" />
            <span>Calculated Physical Content:</span>
          </div>
          <div className="text-xs font-mono text-slate-300">
            <strong className="text-amber-300 font-bold">{fineTroyOz.toFixed(4)} oz t</strong> fine pure {metal.name} (
            {fineGrams.toFixed(3)} grams)
          </div>
        </div>

        <div className="text-right flex flex-col md:items-end justify-center">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Calculated Melt Value Floor
          </span>
          <span className="text-2xl font-black text-amber-400 font-mono tracking-tight">
            ${totalMeltValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
}
