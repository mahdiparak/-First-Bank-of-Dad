"use client";

import { useMemo, useState } from "react";
import { investmentHistory, positionValueSeries, simulateWhatIfBand } from "@/lib/investment-engine";
import type { MarketDataResponse } from "@/lib/market-data";
import {
  allocateToInvestment,
  availableBalanceForKid,
  canCashOutInvestment,
  investmentUnlockAt,
  withdrawFromInvestment,
} from "@/lib/mutations";
import {
  ASSET_CLASSES,
  assetClassMeta,
  kidColor,
  type AssetClass,
  type AssetClassMeta,
  type AuditActor,
  type FamilyBankState,
  type InvestmentPosition,
  type KidProfile,
} from "@/lib/schema";
import { AutoInvest } from "./auto-invest";
import { SimulationChart, Sparkline } from "./charts";
import { InvestConfirmDialog } from "./invest-confirm";
import { assetColor, InvestmentPlot } from "./investment-plot";

const ASSET_CLASS_ORDER: AssetClass[] = ["savings", "cd", "stocks", "crypto"];

const RIDE_LABELS: Record<AssetClassMeta["ride"], string> = {
  flat: "Never goes down",
  gentle: "Never goes down — if you wait it out",
  bumpy: "Bumpy ride",
  wild: "Wild ride",
};

const HORIZONS: { weeks: number; label: string }[] = [
  { weeks: 13, label: "3 months" },
  { weeks: 26, label: "6 months" },
  { weeks: 52, label: "a year" },
];

const LOCK_OPTIONS = [4, 12, 26, 52];

/**
 * One page for the whole investing story, in the order a kid lives it: what my money is doing
 * right now (a real, daily line — not a single frozen number), then pick something to try, read
 * how it works and what the rules are, watch a simulation of it, and only then decide for real.
 */
export function InvestmentSandbox({
  state,
  kid,
  marketData,
  actor,
  onMutate,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  marketData: MarketDataResponse | null;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  function tryMutate(mutator: (state: FamilyBankState) => FamilyBankState) {
    try {
      setError(null);
      onMutate(mutator);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Something went wrong.");
    }
  }

  const available = availableBalanceForKid(state, kid.id);
  const mine = state.investments.filter((position) => position.kidId === kid.id);

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-500">{error}</p>}

      {mine.length > 0 && (
        <MyInvestments
          state={state}
          kid={kid}
          positions={mine}
          marketData={marketData}
          actor={actor}
          onMutate={tryMutate}
        />
      )}

      <NewInvestment
        state={state}
        kid={kid}
        available={available}
        marketData={marketData}
        actor={actor}
        onMutate={tryMutate}
      />

      {/* Last, on purpose: decide in the moment first, then decide once and stop deciding. */}
      <AutoInvest state={state} kid={kid} onMutate={tryMutate} />
    </div>
  );
}

/** The live picture: one line per view (everything together, or a single asset class), day by day. */
function MyInvestments({
  state,
  kid,
  positions,
  marketData,
  actor,
  onMutate,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  positions: InvestmentPosition[];
  marketData: MarketDataResponse | null;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [view, setView] = useState<AssetClass | "all">("all");

  const classesHeld = ASSET_CLASS_ORDER.filter((assetClass) =>
    positions.some((position) => position.assetClass === assetClass),
  );
  const activeView = view !== "all" && !classesHeld.includes(view) ? "all" : view;
  const shown = useMemo(
    () =>
      activeView === "all" ? positions : positions.filter((position) => position.assetClass === activeView),
    [positions, activeView],
  );
  const open = shown.filter((position) => !position.closedAt);

  const history = useMemo(
    () => investmentHistory(shown, state.parentSettings, marketData),
    [shown, state.parentSettings, marketData],
  );

  const value = open.reduce((sum, position) => sum + position.currentValue, 0);
  const invested = open.reduce((sum, position) => sum + position.principal, 0);
  const color = activeView === "all" ? kidColor(kid) : assetColor(activeView);
  const label = activeView === "all" ? "All my investments" : assetClassMeta(activeView).shortLabel;

  return (
    <section className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">📊 My investments</h2>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">{formatCurrency(value)}</p>
          {invested > 0 && <Delta principal={invested} value={value} />}
        </div>
      </div>

      {classesHeld.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <ViewChip active={activeView === "all"} onClick={() => setView("all")}>
            All together
          </ViewChip>
          {classesHeld.map((assetClass) => (
            <ViewChip key={assetClass} active={activeView === assetClass} onClick={() => setView(assetClass)}>
              {ASSET_CLASSES[assetClass].emoji} {ASSET_CLASSES[assetClass].shortLabel}
            </ViewChip>
          ))}
        </div>
      )}

      <InvestmentPlot value={history.value} invested={history.invested} color={color} label={label} />

      <div className="space-y-3 border-t border-black/10 pt-3 dark:border-white/10">
        {shown
          .slice()
          .sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1))
          .map((position) => (
            <PositionRow
              key={position.id}
              state={state}
              position={position}
              marketData={marketData}
              actor={actor}
              onMutate={onMutate}
            />
          ))}
      </div>
    </section>
  );
}

function ViewChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs ${
        active ? "bg-black text-white dark:bg-white dark:text-black" : "border border-black/20 dark:border-white/20"
      }`}
    >
      {children}
    </button>
  );
}

/** One position: its own little line, what it's done so far, and the way out of it. */
function PositionRow({
  state,
  position,
  marketData,
  actor,
  onMutate,
}: {
  state: FamilyBankState;
  position: InvestmentPosition;
  marketData: MarketDataResponse | null;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const meta = assetClassMeta(position.assetClass);
  const minHoldDays = state.parentSettings.investmentMinHoldDays ?? 0;
  const unlocked = canCashOutInvestment(position, minHoldDays);
  const maturesAt = position.maturesAt ? new Date(position.maturesAt) : null;
  const isLockedCd = maturesAt !== null && maturesAt > new Date() && !position.closedAt;

  const series = useMemo(
    () => positionValueSeries(position, state.parentSettings, marketData).map((point) => point.value),
    [position, state.parentSettings, marketData],
  );

  function handleCashOut() {
    if (isLockedCd) {
      const forfeit = Math.max(0, position.currentValue - position.principal);
      const message = `This CD matures ${maturesAt.toLocaleDateString()}. Cashing out now gives you back ${formatCurrency(
        position.principal,
      )} — you'd lose the ${formatCurrency(forfeit)} of interest it has earned. Cash out anyway?`;
      if (!window.confirm(message)) return;
    }
    onMutate((s) => withdrawFromInvestment(s, position.id, actor));
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span>
          {meta.emoji} {meta.shortLabel}{" "}
          <span className="text-xs opacity-60">
            since {new Date(position.openedAt).toLocaleDateString()}
            {position.closedAt && ` · cashed out ${new Date(position.closedAt).toLocaleDateString()}`}
            {isLockedCd && ` · matures ${maturesAt.toLocaleDateString()}`}
          </span>
        </span>
        <span className="tabular-nums">
          {formatCurrency(position.principal)} → <strong>{formatCurrency(position.currentValue)}</strong>{" "}
          <Delta principal={position.principal} value={position.currentValue} inline />
        </span>
      </div>

      {series.length > 2 ? (
        <div style={{ color: assetColor(position.assetClass) }}>
          <Sparkline values={series} color="currentColor" baseline={position.principal} />
        </div>
      ) : (
        <p className="text-xs opacity-60">Brand new — its line starts drawing tomorrow.</p>
      )}

      {!position.closedAt &&
        (unlocked ? (
          <button
            onClick={handleCashOut}
            className="rounded-md border border-black/20 px-2 py-1 text-xs dark:border-white/20"
          >
            {/* A CD past its minimum hold *can* be cashed out — it just costs the interest. Say so
                on the button rather than springing it in the confirmation. */}
            {isLockedCd ? "Cash out early (lose the interest)" : "Cash out"}
          </button>
        ) : (
          <span className="inline-block rounded-md bg-black/[0.04] px-2 py-1 text-xs opacity-60 dark:bg-white/[0.08]">
            🔒 held until {investmentUnlockAt(position, minHoldDays).toLocaleDateString()}
          </span>
        ))}
    </div>
  );
}

/** Pick an option → read how it works and its rules → watch it play out → decide. */
function NewInvestment({
  state,
  kid,
  available,
  marketData,
  actor,
  onMutate,
}: {
  state: FamilyBankState;
  kid: KidProfile;
  available: number;
  marketData: MarketDataResponse | null;
  actor: AuditActor;
  onMutate: (mutator: (state: FamilyBankState) => FamilyBankState) => void;
}) {
  const [selected, setSelected] = useState<AssetClass | null>(null);
  const [amount, setAmount] = useState("");
  const [lockWeeks, setLockWeeks] = useState(12);
  const [horizonWeeks, setHorizonWeeks] = useState(52);
  const [roll, setRoll] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const minHoldDays = state.parentSettings.investmentMinHoldDays ?? 0;
  const amountValue = Number(amount) || 0;
  // Everything compares at cent resolution, matching the mutation's own guard — otherwise a
  // balance that reads $241.40 but is really 241.39999999999998 makes "invest all of it" look
  // like it's over budget.
  const overBudget = round2(amountValue) > round2(available);
  // The simulation always has something to show — before an amount is typed it demonstrates the
  // ride with a round $100, which is the part of the answer that doesn't depend on the amount.
  const simPrincipal = amountValue > 0 ? amountValue : 100;
  const horizonLabel = HORIZONS.find((entry) => entry.weeks === horizonWeeks)?.label ?? `${horizonWeeks} weeks`;

  const band = useMemo(() => {
    void roll; // pressing "run it again" bumps this, which is what draws a fresh set of runs
    return selected ? simulateWhatIfBand(selected, simPrincipal, horizonWeeks, state.parentSettings, marketData) : null;
  }, [selected, simPrincipal, horizonWeeks, state.parentSettings, marketData, roll]);

  function choose(assetClass: AssetClass) {
    setSelected((current) => (current === assetClass ? null : assetClass));
  }

  function handleConfirm() {
    if (!selected) return;
    onMutate((s) =>
      allocateToInvestment(s, kid.id, selected, amountValue, selected === "cd" ? lockWeeks : undefined, actor),
    );
    setConfirming(false);
    setSelected(null);
    setAmount("");
  }

  return (
    <section className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">🧭 Put money to work</h2>
        <p className="text-xs opacity-60">{formatCurrency(available)} available to invest</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {ASSET_CLASS_ORDER.map((assetClass) => {
          const meta = ASSET_CLASSES[assetClass];
          const active = selected === assetClass;
          return (
            <button
              key={assetClass}
              type="button"
              onClick={() => choose(assetClass)}
              aria-pressed={active}
              className="rounded-xl border-2 p-3 text-left"
              style={{
                borderColor: active ? assetColor(assetClass) : "rgb(128 128 128 / 0.25)",
                backgroundColor: active ? `color-mix(in srgb, ${assetColor(assetClass)} 10%, transparent)` : undefined,
              }}
            >
              <p className="text-sm font-medium">
                {meta.emoji} {meta.label}
              </p>
              <p className="text-xs opacity-70">{meta.description}</p>
              <p className="mt-1 text-xs font-medium" style={{ color: assetColor(assetClass) }}>
                {RIDE_LABELS[meta.ride]}
                {assetClass === "savings" && ` · ${formatPercent(state.parentSettings.hysaApr)} a year`}
                {assetClass === "cd" && ` · ${formatPercent(state.parentSettings.cdApr)} a year`}
              </p>
            </button>
          );
        })}
      </div>

      {selected && band && (
        <div className="space-y-4 rounded-xl border border-black/10 p-3 dark:border-white/10">
          <div>
            <h3 className="text-sm font-semibold">
              {ASSET_CLASSES[selected].emoji} How {ASSET_CLASSES[selected].shortLabel} works
            </h3>
            <p className="mt-1 text-sm opacity-80">{ASSET_CLASSES[selected].howItWorks}</p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">The rules</h3>
            <ul className="mt-1 space-y-1 text-sm opacity-80">
              {rulesFor(selected, state, lockWeeks, minHoldDays).map((rule) => (
                <li key={rule} className="flex gap-2">
                  <span aria-hidden>•</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
            <h3 className="text-sm font-semibold">Try it out first</h3>
            <p className="text-xs opacity-60">
              This part is pretend — it never touches your real money. It runs {band.runs === 1 ? "the math" : `${band.runs} what-ifs`}{" "}
              {band.guaranteed ? "at the fixed rate" : "using how the real market has actually behaved"}.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                type="number"
                min={0.01}
                step="0.01"
                placeholder="Amount ($)"
                className="w-28 rounded-md border border-black/20 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
              />
              {[0.25, 0.5, 1].map((fraction) => (
                <button
                  key={fraction}
                  type="button"
                  onClick={() => setAmount(String(round2(available * fraction)))}
                  disabled={available <= 0}
                  className="rounded-full border border-black/20 px-2 py-1 text-xs disabled:opacity-40 dark:border-white/20"
                >
                  {Math.round(fraction * 100)}%
                </button>
              ))}
              <select
                value={horizonWeeks}
                onChange={(event) => setHorizonWeeks(Number(event.target.value))}
                aria-label="How far ahead to simulate"
                className="rounded-md border border-black/20 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
              >
                {HORIZONS.map((entry) => (
                  <option key={entry.weeks} value={entry.weeks}>
                    {entry.label}
                  </option>
                ))}
              </select>
              {selected === "cd" && (
                <select
                  value={lockWeeks}
                  onChange={(event) => setLockWeeks(Number(event.target.value))}
                  aria-label="How long to lock the money up"
                  className="rounded-md border border-black/20 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
                >
                  {LOCK_OPTIONS.map((weeks) => (
                    <option key={weeks} value={weeks}>
                      Lock {weeks} weeks
                    </option>
                  ))}
                </select>
              )}
              {!band.guaranteed && (
                <button
                  type="button"
                  onClick={() => setRoll((value) => value + 1)}
                  className="rounded-md border border-black/20 px-2 py-1 text-xs dark:border-white/20"
                >
                  🎲 Run it again
                </button>
              )}
            </div>

            {amountValue <= 0 && <p className="text-xs opacity-60">Showing {formatCurrency(100)} as an example.</p>}

            <SimulationChart
              typical={band.typical}
              best={band.best}
              worst={band.worst}
              principal={simPrincipal}
              guaranteed={band.guaranteed}
            />
            <p className="text-xs opacity-60">
              The flat dashed line is the {formatCurrency(simPrincipal)} that went in. Every step along the line is one{" "}
              {band.step}.{!band.guaranteed && " Best and worst are real runs too — same choice, different luck."}
            </p>

            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs opacity-60">{band.guaranteed ? "You'd have" : "Typical run"}</p>
                <p className="font-semibold tabular-nums">{formatCurrency(band.typical[band.typical.length - 1])}</p>
              </div>
              {!band.guaranteed && (
                <>
                  <div>
                    <p className="text-xs opacity-60">Worst run</p>
                    <p className="font-semibold tabular-nums text-red-500">
                      {formatCurrency(band.worst[band.worst.length - 1])}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs opacity-60">Best run</p>
                    <p className="font-semibold tabular-nums text-green-600 dark:text-green-400">
                      {formatCurrency(band.best[band.best.length - 1])}
                    </p>
                  </div>
                </>
              )}
            </div>
            <p className="text-xs opacity-70">
              {band.guaranteed
                ? `Same answer every time — that's what "guaranteed rate" means.`
                : `${Math.round(band.chanceOfLoss * 100)}% of those runs ended with less than the ${formatCurrency(
                    simPrincipal,
                  )} that went in, over ${horizonLabel}.`}
            </p>
          </div>

          <div className="space-y-1 border-t border-black/10 pt-3 dark:border-white/10">
            <button
              type="button"
              disabled={amountValue <= 0 || overBudget}
              onClick={() => setConfirming(true)}
              className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
            >
              {amountValue > 0
                ? `Invest ${formatCurrency(amountValue)} in ${ASSET_CLASSES[selected].shortLabel} for real`
                : `Type an amount to invest in ${ASSET_CLASSES[selected].shortLabel}`}
            </button>
            {overBudget && (
              <p className="text-xs text-red-500">
                You only have {formatCurrency(available)} available right now.
              </p>
            )}
            <p className="text-center text-xs opacity-60">You&apos;ll get one more chance to say no.</p>
          </div>
        </div>
      )}

      {confirming && selected && band && (
        <InvestConfirmDialog
          assetClass={selected}
          amount={amountValue}
          lockWeeks={selected === "cd" ? lockWeeks : undefined}
          minHoldDays={minHoldDays}
          band={band}
          horizonLabel={horizonLabel}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}

/** The rules a kid agrees to by investing — the family's settings in plain words, per asset. */
function rulesFor(
  assetClass: AssetClass,
  state: FamilyBankState,
  lockWeeks: number,
  minHoldDays: number,
): string[] {
  const holdRule =
    minHoldDays > 0
      ? `Once it's in, it stays in for at least ${minHoldDays} day${minHoldDays === 1 ? "" : "s"} — no same-day changing your mind.`
      : "You can cash it out whenever you want.";
  const common = ["The money comes out of your spendable balance — you can't spend it while it's invested.", holdRule];

  switch (assetClass) {
    case "savings":
      return [
        ...common,
        `It grows at ${formatPercent(state.parentSettings.hysaApr)} a year, the same rate a real high-yield savings account pays.`,
        "It never loses value. The trade: it grows slowly.",
      ];
    case "cd":
      return [
        ...common,
        `It grows at ${formatPercent(state.parentSettings.cdApr)} a year — better than savings, because you're promising to leave it alone.`,
        `You're locking it for ${lockWeeks} weeks (until about ${weeksFromNow(lockWeeks)}).`,
        "Cash out before then and you get your money back, but you lose everything it earned.",
      ];
    case "stocks":
      return [
        ...common,
        "Its value changes every single day, following how the real stock market has actually moved.",
        "It can go down, and it can stay down for a while. There's no guaranteed rate.",
        "Historically, the longer it's left alone, the better it has done.",
      ];
    case "crypto":
      return [
        ...common,
        "Its value changes every single day, and the swings are much bigger than stocks.",
        "It can lose a big chunk of its value in a week. There's no guaranteed rate and no safety net.",
        "Only put in an amount you'd be OK seeing shrink for a long time.",
      ];
  }
}

/** Gain/loss vs. what was put in — the "is my money going up or down" signal, in $ and %, with a
 *  direction arrow and colour. Flat (exactly break-even) reads neutral. */
function Delta({ principal, value, inline = false }: { principal: number; value: number; inline?: boolean }) {
  const change = value - principal;
  const pct = principal > 0 ? (change / principal) * 100 : 0;
  const up = change > 0.004;
  const down = change < -0.004;
  const arrow = up ? "▲" : down ? "▼" : "▬";
  const color = up ? "text-green-600 dark:text-green-400" : down ? "text-red-500" : "opacity-60";
  const text = `${arrow} ${change >= 0 ? "+" : "−"}${formatCurrency(Math.abs(change))} (${change >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)`;
  return <span className={`${color} ${inline ? "text-xs" : "text-sm font-medium"}`}>{text}</span>;
}

function weeksFromNow(weeks: number): string {
  return new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}
